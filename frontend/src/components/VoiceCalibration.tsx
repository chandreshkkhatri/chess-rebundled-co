"use client";

import { useState, useCallback, useRef, useEffect } from "react";

// Calibration phrases grouped by category
const CALIBRATION_TARGETS = [
  { target: "e4", display: "e4", category: "move" },
  { target: "d5", display: "d5", category: "move" },
  { target: "knight f3", display: "Knight f3", category: "piece" },
  { target: "bishop c4", display: "Bishop c4", category: "piece" },
  { target: "queen d1", display: "Queen d1", category: "piece" },
  { target: "rook e1", display: "Rook e1", category: "piece" },
  { target: "a4", display: "a4", category: "file" },
  { target: "b6", display: "b6", category: "file" },
  { target: "c3", display: "c3", category: "file" },
  { target: "f7", display: "f7", category: "file" },
  { target: "g5", display: "g5", category: "file" },
  { target: "h2", display: "h2", category: "file" },
  {
    target: "castle king side",
    display: "Castle king side",
    category: "special",
  },
  { target: "takes e5", display: "Takes e5", category: "special" },
  {
    target: "knight takes d4",
    display: "Knight takes d4",
    category: "special",
  },
];

export interface CalibrationEntry {
  target: string;
  heard: string;
  timestamp: number;
}

export interface VoiceCalibrationData {
  entries: CalibrationEntry[];
  confusionMap: Record<string, string[]>;
  calibratedAt: number;
}

interface VoiceCalibrationProps {
  onComplete: (data: VoiceCalibrationData) => void;
  onCancel: () => void;
}

export function VoiceCalibration({
  onComplete,
  onCancel,
}: VoiceCalibrationProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [entries, setEntries] = useState<CalibrationEntry[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [lastHeard, setLastHeard] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const currentTarget = CALIBRATION_TARGETS[currentIndex];
  const progress = (currentIndex / CALIBRATION_TARGETS.length) * 100;
  const isComplete = currentIndex >= CALIBRATION_TARGETS.length;

  // Cleanup recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.toLowerCase().trim();
      setLastHeard(transcript);
      setIsListening(false);
    };

    recognition.onerror = (event) => {
      if (event.error !== "aborted") {
        setError(`Recognition error: ${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    setError(null);
    setLastHeard(null);
    setIsListening(true);
    recognition.start();
  }, []);

  const acceptResult = useCallback(() => {
    if (!lastHeard || !currentTarget) return;

    const entry: CalibrationEntry = {
      target: currentTarget.target,
      heard: lastHeard,
      timestamp: Date.now(),
    };

    const newEntries = [...entries, entry];
    setEntries(newEntries);
    setLastHeard(null);
    setCurrentIndex((i) => i + 1);
  }, [lastHeard, currentTarget, entries]);

  const retryPhrase = useCallback(() => {
    setLastHeard(null);
    setError(null);
  }, []);

  const skipPhrase = useCallback(() => {
    setLastHeard(null);
    setError(null);
    setCurrentIndex((i) => i + 1);
  }, []);

  const finishCalibration = useCallback(() => {
    // Build confusion map from entries
    const confusionMap: Record<string, string[]> = {};

    for (const entry of entries) {
      if (entry.heard !== entry.target) {
        // Extract individual words and map misheard ones
        const targetWords = entry.target.split(/\s+/);
        const heardWords = entry.heard.split(/\s+/);

        // Map full phrase confusion
        if (!confusionMap[entry.target]) {
          confusionMap[entry.target] = [];
        }
        if (!confusionMap[entry.target].includes(entry.heard)) {
          confusionMap[entry.target].push(entry.heard);
        }

        // Map individual word confusions when lengths match
        if (targetWords.length === heardWords.length) {
          for (let i = 0; i < targetWords.length; i++) {
            if (targetWords[i] !== heardWords[i]) {
              if (!confusionMap[targetWords[i]]) {
                confusionMap[targetWords[i]] = [];
              }
              if (!confusionMap[targetWords[i]].includes(heardWords[i])) {
                confusionMap[targetWords[i]].push(heardWords[i]);
              }
            }
          }
        }
      }
    }

    onComplete({
      entries,
      confusionMap,
      calibratedAt: Date.now(),
    });
  }, [entries, onComplete]);

  // Auto-finish when all targets done
  useEffect(() => {
    if (isComplete && entries.length > 0) {
      finishCalibration();
    }
  }, [isComplete, entries.length, finishCalibration]);

  if (isComplete) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-slate-300">Saving calibration data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div>
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>
            Phrase {currentIndex + 1} of {CALIBRATION_TARGETS.length}
          </span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-2">
          <div
            className="bg-purple-500 h-2 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Current target */}
      <div className="text-center py-6">
        <p className="text-slate-400 text-sm mb-2">Say this chess move:</p>
        <p className="text-3xl font-bold text-white">{currentTarget.display}</p>
        <p className="text-xs text-slate-500 mt-1 capitalize">
          {currentTarget.category}
        </p>
      </div>

      {/* Mic button / result */}
      <div className="text-center">
        {lastHeard ? (
          <div className="space-y-3">
            <div className="bg-slate-700/50 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">Browser heard:</p>
              <p className="text-lg text-white font-mono">
                &quot;{lastHeard}&quot;
              </p>
              {lastHeard === currentTarget.target ? (
                <p className="text-xs text-green-400 mt-1">Perfect match!</p>
              ) : (
                <p className="text-xs text-yellow-400 mt-1">
                  Different from target — this helps us adapt
                </p>
              )}
            </div>
            <div className="flex gap-2 justify-center">
              <button
                onClick={retryPhrase}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-slate-200 text-sm rounded-lg"
              >
                Retry
              </button>
              <button
                onClick={acceptResult}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg"
              >
                Accept & Next
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={startListening}
            disabled={isListening}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all mx-auto ${
              isListening
                ? "bg-red-500 animate-pulse scale-110"
                : "bg-purple-600 hover:bg-purple-500"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8 text-white"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </button>
        )}

        {isListening && (
          <p className="text-sm text-purple-400 mt-3 animate-pulse">
            Listening...
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-400 text-center">{error}</p>}

      {/* Skip / Cancel */}
      <div className="flex justify-between text-sm">
        <button
          onClick={onCancel}
          className="text-slate-500 hover:text-slate-300"
        >
          Cancel
        </button>
        <button
          onClick={skipPhrase}
          className="text-slate-500 hover:text-slate-300"
        >
          Skip this phrase
        </button>
      </div>
    </div>
  );
}
