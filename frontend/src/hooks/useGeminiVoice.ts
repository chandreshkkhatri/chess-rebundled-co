'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface UseGeminiVoiceOptions {
  onAudioReady?: (audioBase64: string, mimeType: string) => void;
  silenceThreshold?: number; // Volume level to consider as silence (0-1), default 0.02
  silenceDuration?: number; // ms of silence before stopping, default 800 (reduced from 1500 for lower latency)
  maxDuration?: number; // max recording duration in ms, default 8000
}

export function useGeminiVoice(options: UseGeminiVoiceOptions = {}) {
  const {
    onAudioReady,
    silenceThreshold = 0.02,
    silenceDuration = 800, // Reduced from 1500ms for lower latency
    maxDuration = 8000,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [isRecording, setIsRecording] = useState(false); // Actually capturing speech
  const [isSupported, setIsSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [volumeLevel, setVolumeLevel] = useState(0); // 0-1 normalized volume

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const silenceStartRef = useRef<number | null>(null);
  const recordingStartRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const onAudioReadyRef = useRef(onAudioReady);
  const isListeningRef = useRef(false); // Sync ref for animation frame access
  const isRecordingRef = useRef(false); // Sync ref for animation frame access

  // Keep callback ref updated
  useEffect(() => {
    onAudioReadyRef.current = onAudioReady;
  }, [onAudioReady]);

  const stopAndSendAudio = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const checkVolume = useCallback(() => {
    if (!analyserRef.current || !isListeningRef.current) return;

    const analyser = analyserRef.current;
    // Guard against division by zero if analyser not properly initialized
    if (analyser.frequencyBinCount === 0) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    // Calculate average volume (0-255 range, normalize to 0-1)
    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255;

    // Update volume level for debug display
    setVolumeLevel(average);

    const now = Date.now();

    if (average > silenceThreshold) {
      // Sound detected
      silenceStartRef.current = null;

      // Start recording if not already
      if (!isRecordingRef.current && mediaRecorderRef.current?.state === 'inactive') {
        chunksRef.current = [];
        mediaRecorderRef.current.start();
        recordingStartRef.current = now;
        isRecordingRef.current = true;
        setIsRecording(true);
      }
    } else if (isRecordingRef.current) {
      // Silence detected while recording
      if (!silenceStartRef.current) {
        silenceStartRef.current = now;
      } else if (now - silenceStartRef.current > silenceDuration) {
        // Silence lasted long enough, stop recording
        stopAndSendAudio();
        return;
      }
    }

    // Check max duration
    if (isRecordingRef.current && recordingStartRef.current && now - recordingStartRef.current > maxDuration) {
      stopAndSendAudio();
      return;
    }

    // Continue monitoring
    animationFrameRef.current = requestAnimationFrame(checkVolume);
  }, [silenceThreshold, silenceDuration, maxDuration, stopAndSendAudio]);

  const startListening = useCallback(async () => {
    try {
      setError(null);

      // Check for browser support
      if (!navigator.mediaDevices || !window.MediaRecorder || !window.AudioContext) {
        setIsSupported(false);
        setError('Audio recording not supported in this browser');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: { ideal: 16000 }, // Optimal for speech recognition
        },
      });
      streamRef.current = stream;

      // Set up audio analysis for volume detection
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Set up MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/wav';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        isRecordingRef.current = false;
        setIsRecording(false);
        silenceStartRef.current = null;
        recordingStartRef.current = null;

        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: mimeType });

          // Only send if we have meaningful audio (at least 200ms worth)
          if (blob.size > 1000) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = (reader.result as string).split(',')[1];
              const simpleMimeType = mimeType.split(';')[0];
              onAudioReadyRef.current?.(base64, simpleMimeType);
            };
            reader.readAsDataURL(blob);
          }
        }

        chunksRef.current = [];
      };

      isListeningRef.current = true;
      setIsListening(true);

      // Start volume monitoring
      animationFrameRef.current = requestAnimationFrame(checkVolume);

    } catch (err) {
      // Cleanup any partially initialized resources on error
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      analyserRef.current = null;
      mediaRecorderRef.current = null;

      console.error('Error starting Gemini voice:', err);
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError('Microphone access denied. Please allow microphone access.');
        } else if (err.name === 'NotFoundError') {
          setError('No microphone found.');
        } else {
          setError(`Recording error: ${err.message}`);
        }
      }
    }
  }, [checkVolume]);

  const stopListening = useCallback(() => {
    // Stop animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Stop recording if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Stop stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    analyserRef.current = null;
    mediaRecorderRef.current = null;
    isListeningRef.current = false;
    isRecordingRef.current = false;
    setIsListening(false);
    setIsRecording(false);
    silenceStartRef.current = null;
    recordingStartRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return {
    isListening,
    isRecording, // True when actually capturing speech
    isSupported,
    error,
    startListening,
    stopListening,
    volumeLevel, // 0-1 normalized volume for debug display
    silenceThreshold, // Current threshold for reference
  };
}
