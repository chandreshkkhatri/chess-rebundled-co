'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface AudioTiming {
  /** When the speaker went quiet (Date.now()), for measuring end-of-speech latency. */
  speechEndedAt: number;
}

interface UseGeminiVoiceOptions {
  onAudioReady?: (audioBase64: string, mimeType: string, timing: AudioTiming) => void;
  silenceThreshold?: number;
  silenceDuration?: number;
  maxDuration?: number;
  /**
   * How much audio from before the volume crossed the threshold to keep, so a
   * soft first sound ("eh-" of "e4") isn't cut. Must be less than
   * silenceDuration: the recording ends this much earlier after the speech.
   */
  prerollDuration?: number;
}

// Sounds shorter than this are clicks or bumps, not a spoken move.
const MIN_SPEECH_MS = 250;

export function useGeminiVoice(options: UseGeminiVoiceOptions = {}) {
  const {
    onAudioReady, silenceThreshold = 0.02, silenceDuration = 400, maxDuration = 8000, prerollDuration = 250,
  } = options;
  const [isListening, setIsListening] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [volumeLevel, setVolumeLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const onAudioReadyRef = useRef(onAudioReady);
  const generationRef = useRef(0);
  const startingRef = useRef(false);
  const listeningRef = useRef(false);

  useEffect(() => { onAudioReadyRef.current = onAudioReady; }, [onAudioReady]);

  const releaseResources = useCallback(() => {
    // Invalidates pending permission prompts, recorder events and FileReader callbacks.
    generationRef.current += 1;
    startingRef.current = false;
    listeningRef.current = false;
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (recorder?.state === 'recording') recorder.stop();
    if (audioContextRef.current) void audioContextRef.current.close().catch(() => {});
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }, []);

  const stopListening = useCallback(() => {
    releaseResources();
    setIsListening(false);
    setIsRecording(false);
    setVolumeLevel(0);
  }, [releaseResources]);

  const startListening = useCallback(async () => {
    if (startingRef.current || listeningRef.current) return;
    const generation = ++generationRef.current;
    startingRef.current = true;
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder || !window.AudioContext) {
        setIsSupported(false);
        throw new Error('Audio recording not supported in this browser');
      }
      // Safari records MP4/AAC; do not assume a WAV encoder exists.
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
        .find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) {
        setIsSupported(false);
        throw new Error('No supported audio recording format');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        echoCancellation: true, noiseSuppression: true, autoGainControl: true,
        channelCount: 1, sampleRate: { ideal: 16000 },
      } });
      if (generationRef.current !== generation) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      const context = new AudioContext();
      audioContextRef.current = context;
      // The recorder now listens through this graph, so it must be running.
      if (context.state === 'suspended') void context.resume().catch(() => {});
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      // The recorder hears the microphone prerollDuration late, while the
      // volume check hears it live: a recording started when speech is
      // detected therefore begins just before the speech did.
      const delay = context.createDelay(1);
      delay.delayTime.value = Math.min(prerollDuration, Math.max(0, silenceDuration - 100)) / 1000;
      const delayed = context.createMediaStreamDestination();
      delayed.channelCount = 1;
      source.connect(delay);
      delay.connect(delayed);
      const recorder = new MediaRecorder(delayed.stream, { mimeType });
      mediaRecorderRef.current = recorder;
      let chunks: Blob[] = [];
      let recordingStart: number | null = null;
      let silenceStart: number | null = null;
      const current = () => generationRef.current === generation && listeningRef.current;
      const schedule = () => {
        if (current()) animationFrameRef.current = requestAnimationFrame(checkVolume);
      };
      const checkVolume = () => {
        animationFrameRef.current = null;
        if (!current()) return;
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const volume = data.length ? data.reduce((a, b) => a + b, 0) / data.length / 255 : 0;
        setVolumeLevel(volume);
        const now = Date.now();
        if (volume > silenceThreshold) {
          silenceStart = null;
          if (recorder.state === 'inactive') {
            chunks = [];
            recordingStart = now;
            recorder.start();
            setIsRecording(true);
          }
        } else if (recorder.state === 'recording') {
          silenceStart ??= now;
          if (now - silenceStart > silenceDuration) { recorder.stop(); return; }
        }
        if (recorder.state === 'recording' && recordingStart !== null && now - recordingStart > maxDuration) {
          recorder.stop();
          return;
        }
        schedule();
      };
      recorder.ondataavailable = event => {
        if (current() && event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        if (!current()) return;
        setIsRecording(false);
        const speechEndedAt = silenceStart ?? Date.now();
        const spokenFor = recordingStart === null ? 0 : speechEndedAt - recordingStart;
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
        chunks = [];
        recordingStart = null;
        silenceStart = null;
        // Resume even when a brief noise or quiet recording was discarded.
        schedule();
        if (blob.size > 0 && spokenFor >= MIN_SPEECH_MS) {
          const reader = new FileReader();
          reader.onloadend = () => {
            if (current() && typeof reader.result === 'string') {
              onAudioReadyRef.current?.(reader.result.split(',')[1], blob.type.split(';')[0], { speechEndedAt });
            }
          };
          reader.readAsDataURL(blob);
        }
      };
      recorder.onerror = () => {
        if (!current()) return;
        stopListening();
        setError('Recording failed. Please restart the microphone.');
      };
      listeningRef.current = true;
      startingRef.current = false;
      setIsListening(true);
      schedule();
    } catch (err) {
      if (generationRef.current !== generation) return;
      releaseResources();
      setIsListening(false);
      setIsRecording(false);
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setError('Microphone access denied. Please allow microphone access.');
      } else if (err instanceof Error && err.name === 'NotFoundError') {
        setError('No microphone found.');
      } else {
        setError(err instanceof Error ? err.message : 'Unable to record audio');
      }
    }
  }, [silenceThreshold, silenceDuration, maxDuration, prerollDuration, releaseResources, stopListening]);

  useEffect(() => releaseResources, [releaseResources]);
  return { isListening, isRecording, isSupported, error, startListening, stopListening, volumeLevel, silenceThreshold };
}
