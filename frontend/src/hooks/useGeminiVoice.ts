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
   * Audio kept from before speech was detected, so quiet initial consonants
   * survive. Capped at silenceDuration - 100 ms, which is how much trailing
   * quiet the clip keeps after the speech.
   */
  prerollDuration?: number;
}

export function useGeminiVoice(options: UseGeminiVoiceOptions = {}) {
  const {
    onAudioReady, silenceThreshold = 0.02, silenceDuration = 700, maxDuration = 8000, prerollDuration = 300,
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
      await context.resume();
      if (generationRef.current !== generation) return;
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      // Speech detection hears the microphone live; the recorder hears it
      // prerollDuration late. A recording started when speech is detected
      // therefore begins just before the speech did, and holds no idle
      // silence before it (fewer bytes to upload, nothing to mishear).
      const delay = context.createDelay(1);
      delay.delayTime.value = Math.max(0, Math.min(prerollDuration, silenceDuration - 100)) / 1000;
      const delayed = context.createMediaStreamDestination();
      delayed.channelCount = 1;
      source.connect(delay);
      delay.connect(delayed);
      const recorder = new MediaRecorder(delayed.stream, { mimeType, audioBitsPerSecond: 128000 });
      mediaRecorderRef.current = recorder;
      let chunks: Blob[] = [];
      let silenceStart: number | null = null;
      let speechStart: number | null = null;
      let speechDuration = 0;
      let lastFrame = Date.now();
      const samples = new Float32Array(analyser.fftSize);
      const current = () => generationRef.current === generation && listeningRef.current;
      const schedule = () => {
        if (current()) animationFrameRef.current = requestAnimationFrame(checkVolume);
      };
      const checkVolume = () => {
        animationFrameRef.current = null;
        if (!current()) return;
        const now = Date.now();
        analyser.getFloatTimeDomainData(samples);
        const volume = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        setVolumeLevel(volume);
        if (volume > silenceThreshold) {
          if (speechStart === null) {
            // The delayed recorder starts with the audio from before this moment.
            chunks = [];
            speechStart = now;
            recorder.start();
          }
          speechDuration += Math.min(now - lastFrame, 100);
          silenceStart = null;
          setIsRecording(true);
        } else if (speechStart !== null) {
          silenceStart ??= now;
          if (now - silenceStart > silenceDuration) { recorder.stop(); return; }
        }
        lastFrame = now;
        if (speechStart !== null && now - speechStart > maxDuration) {
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
        const hasSpeech = speechDuration >= 120;
        const speechEndedAt = silenceStart ?? Date.now();
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
        chunks = [];
        silenceStart = null;
        speechStart = null;
        speechDuration = 0;
        lastFrame = Date.now();
        // Resume even when a brief noise or quiet recording was discarded.
        schedule();
        // Encoded byte size depends on codec/bitrate, not intelligibility.
        if (blob.size > 0 && hasSpeech) {
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
