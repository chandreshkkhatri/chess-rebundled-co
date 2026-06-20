"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { PageLayout } from "@/components/PageLayout";
import { ChessBoard } from "@/components/ChessBoard";
import { AudioWaveform } from "@/components/AudioWaveform";
import Link from "next/link";

// Available files and ranks for generating random squares
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"];

export default function CoordinateTrainerPage() {
  // Config states
  const [gameMode, setGameMode] = useState<"find" | "name">("find");
  const [boardSetup, setBoardSetup] = useState<"pieces" | "empty">("empty");
  const [orientationSetting, setOrientationSetting] = useState<"white" | "black" | "random">("white");
  const [inputMode, setInputMode] = useState<"tap" | "voice">("tap");

  // Game play states
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [targetSquare, setTargetSquare] = useState<string | null>(null);
  const [activeOrientation, setActiveOrientation] = useState<"white" | "black">("white");
  
  // Feedback states
  const [clickedSquare, setClickedSquare] = useState<string | null>(null);
  const [typedInput, setTypedInput] = useState("");
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showFeedbackSquare, setShowFeedbackSquare] = useState<string | null>(null);

  // Voice recognition states
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechTranscript, setSpeechTranscript] = useState("");
  const [speechError, setSpeechError] = useState<string | null>(null);

  // References
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const feedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Read High Score on Mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("chess_trainer_highscore");
      if (stored) {
        setHighScore(parseInt(stored, 10));
      }
      
      // Check speech support
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      setIsSpeechSupported(!!SpeechRecognition);
    }
  }, []);

  // Web Audio chime/synthesizer helper
  const playSound = useCallback((type: "correct" | "incorrect" | "gameover" | "start") => {
    if (typeof window === "undefined") return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      
      if (type === "correct") {
        // High-pitched sweet chime (C6 then G6)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(1046.50, ctx.currentTime); // C6
        osc.frequency.setValueAtTime(1567.98, ctx.currentTime + 0.08); // G6
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      } else if (type === "incorrect") {
        // Lower buzz sound
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "triangle";
        osc.frequency.setValueAtTime(180, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } else if (type === "start") {
        // Rising synth chime
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.2); // A5
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      } else if (type === "gameover") {
        // Descending low buzzer tones
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(110, ctx.currentTime + 0.5);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        osc.start();
        osc.stop(ctx.currentTime + 0.6);
      }
    } catch (err) {
      console.warn("AudioContext failed to start:", err);
    }
  }, []);

  // NATO / Homophones parser for speech coordinates
  const parseVoiceCoordinate = useCallback((transcript: string): string | null => {
    const text = transcript.toLowerCase().trim();
    
    const fileMap: Record<string, string> = {
      alpha: "a", a: "a",
      bravo: "b", bee: "b", b: "b",
      charlie: "c", see: "c", c: "c",
      delta: "d", d: "d",
      echo: "e", e: "e",
      foxtrot: "f", fox: "f", f: "f",
      golf: "g", gee: "g", g: "g",
      hotel: "h", h: "h"
    };

    const rankMap: Record<string, string> = {
      one: "1", "1": "1", won: "1",
      two: "2", "2": "2", to: "2", too: "2",
      three: "3", "3": "3", tree: "3",
      four: "4", "4": "4", for: "4", fore: "4",
      five: "5", "5": "5",
      six: "6", "6": "6",
      seven: "7", "7": "7",
      eight: "8", "8": "8", ate: "8"
    };

    // Try finding exact two-character code like "e4"
    const words = text.split(/\s+/);
    for (const w of words) {
      if (w.length === 2) {
        const fileChar = w[0];
        const rankChar = w[1];
        if (FILES.includes(fileChar) && RANKS.includes(rankChar)) {
          return fileChar + rankChar;
        }
      }
      
      // NATO combos like "delta-4" or "alpha2"
      const alphaPart = w.replace(/[^a-z]/g, "");
      const numPart = w.replace(/[^0-9]/g, "");
      if (fileMap[alphaPart] && rankMap[numPart]) {
        return fileMap[alphaPart] + rankMap[numPart];
      }
    }

    // Try separate word mapping
    let matchedFile: string | null = null;
    let matchedRank: string | null = null;

    for (const w of words) {
      if (!matchedFile && fileMap[w]) {
        matchedFile = fileMap[w];
      }
      if (!matchedRank && rankMap[w]) {
        matchedRank = rankMap[w];
      }
    }

    if (matchedFile && matchedRank) {
      return matchedFile + matchedRank;
    }

    // Try fallback simple character scan
    const clean = text.replace(/[^a-h1-8]/g, "");
    if (clean.length === 2) {
      const f = clean[0];
      const r = clean[1];
      if (FILES.includes(f) && RANKS.includes(r)) {
        return f + r;
      }
    }

    return null;
  }, []);

  // Next Round / Generate new target square
  const nextRound = useCallback(() => {
    setIsCorrect(null);
    setClickedSquare(null);
    setTypedInput("");
    setSpeechTranscript("");
    
    // Choose orientation
    if (orientationSetting === "random") {
      setActiveOrientation(Math.random() > 0.5 ? "white" : "black");
    } else {
      setActiveOrientation(orientationSetting);
    }

    // Generate random square
    const randomFile = FILES[Math.floor(Math.random() * FILES.length)];
    const randomRank = RANKS[Math.floor(Math.random() * RANKS.length)];
    setTargetSquare(randomFile + randomRank);
  }, [orientationSetting]);

  // Handle a guess input (common logic for click/keyboard/speech)
  const submitGuess = useCallback((guess: string) => {
    if (!isPlaying || !targetSquare || isCorrect !== null) return;
    
    const correct = guess.toLowerCase().trim() === targetSquare;
    setIsCorrect(correct);
    
    if (correct) {
      playSound("correct");
      setScore((s) => s + 1);
      setStreak((st) => st + 1);
    } else {
      playSound("incorrect");
      setStreak(0);
      setShowFeedbackSquare(targetSquare); // Highlight the correct square in green to show them what it was
    }

    // Clear feedback and trigger next round after a short delay
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
    }
    
    feedbackTimeoutRef.current = setTimeout(() => {
      setIsCorrect(null);
      setShowFeedbackSquare(null);
      nextRound();
    }, 900);
  }, [isPlaying, targetSquare, isCorrect, playSound, nextRound]);

  // Voice speech result handler
  const handleSpeechResult = useCallback((event: any) => {
    const results = event.results[event.resultIndex];
    const transcriptText = results[0].transcript;
    setSpeechTranscript(transcriptText);

    const parsed = parseVoiceCoordinate(transcriptText);
    if (parsed) {
      submitGuess(parsed);
    }
  }, [parseVoiceCoordinate, submitGuess]);

  // Initialize Speech recognition hook
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition && isPlaying && inputMode === "voice" && gameMode === "name") {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechError(null);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onerror = (e: any) => {
        console.warn("Speech recognition error:", e.error);
        if (e.error === "not-allowed") {
          setSpeechError("Microphone access denied.");
        }
      };

      recognition.onresult = handleSpeechResult;
      recognitionRef.current = recognition;
      
      try {
        recognition.start();
      } catch (err) {
        console.error(err);
      }

      return () => {
        if (recognitionRef.current) {
          recognitionRef.current.abort();
        }
      };
    } else {
      setIsListening(false);
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    }
  }, [isPlaying, inputMode, gameMode, handleSpeechResult]);

  // Timer loop
  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            // Game Over
            setIsPlaying(false);
            playSound("gameover");
            if (timerRef.current) clearInterval(timerRef.current);
            
            // Save high score if necessary
            setHighScore((currentHigh) => {
              const newHigh = Math.max(currentHigh, score);
              localStorage.setItem("chess_trainer_highscore", newHigh.toString());
              return newHigh;
            });
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, score, playSound]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
    };
  }, []);

  // Board click handler (Coordinate to Board mode)
  const handleSquareClick = useCallback((square: string) => {
    if (!isPlaying || gameMode !== "find" || isCorrect !== null) return;
    setClickedSquare(square);
    submitGuess(square);
  }, [isPlaying, gameMode, isCorrect, submitGuess]);

  // Keyboard Submission (Board to Coordinate mode)
  const handleKeyboardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedInput) return;
    submitGuess(typedInput);
  };

  // Start the trainer game
  const startGame = () => {
    playSound("start");
    setScore(0);
    setStreak(0);
    setTimeLeft(30);
    setIsCorrect(null);
    setClickedSquare(null);
    setTypedInput("");
    setSpeechTranscript("");
    setShowFeedbackSquare(null);
    setIsPlaying(true);
    nextRound();
  };

  // Stop / Reset the game
  const resetGame = () => {
    setIsPlaying(false);
    setScore(0);
    setStreak(0);
    setTimeLeft(30);
    setIsCorrect(null);
    setTargetSquare(null);
    setClickedSquare(null);
    setTypedInput("");
    setSpeechTranscript("");
    setShowFeedbackSquare(null);
  };

  // Compute CSS classes for the progress timer circle
  const getTimerColorClass = () => {
    if (timeLeft > 15) return "text-green-500";
    if (timeLeft > 8) return "text-yellow-500";
    return "text-red-500 animate-pulse";
  };

  // Setup highlight square styles dynamically
  const getCustomSquareStyles = () => {
    const styles: Record<string, any> = {};

    // In Board to Coordinate (Name Square) mode, highlight the target square in purple to name
    if (isPlaying && gameMode === "name" && targetSquare) {
      styles[targetSquare] = {
        background: "radial-gradient(circle, rgba(168, 85, 247, 0.7) 35%, transparent 35%)",
        borderRadius: "50%",
      };
    }

    // Correct / Incorrect click feedback
    if (isCorrect === true && clickedSquare) {
      styles[clickedSquare] = {
        backgroundColor: "rgba(34, 197, 94, 0.4)", // transparent green
      };
    } else if (isCorrect === false && clickedSquare) {
      styles[clickedSquare] = {
        backgroundColor: "rgba(239, 68, 68, 0.4)", // transparent red
      };
    }

    // Show correct square in green when user guessed incorrectly
    if (showFeedbackSquare) {
      styles[showFeedbackSquare] = {
        backgroundColor: "rgba(34, 197, 94, 0.5)",
        border: "3px solid #22c55e",
      };
    }

    return styles;
  };

  // Board FEN based on setting
  const boardFen = boardSetup === "pieces"
    ? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    : "8/8/8/8/8/8/8/8 w - - 0 1";

  // Visual percentages for circular timer
  const strokeDashoffset = 113 - (113 * timeLeft) / 30;

  return (
    <PageLayout>
      <div className="flex flex-col items-center max-w-6xl mx-auto px-4 py-6">
        
        {/* Header Title with Back Link */}
        <div className="w-full flex items-center justify-between mb-6">
          <Link
            href="/"
            className="flex items-center text-sm font-semibold text-slate-400 hover:text-purple-400 transition-colors"
          >
            <span className="mr-1 text-lg">&larr;</span> Back to Dashboard
          </Link>
          <div className="text-right">
            <h1 className="text-2xl font-bold text-white tracking-tight">🎯 Notation Vision Trainer</h1>
            <p className="text-xs text-slate-400">Master chessboard coordinates for voice control speed</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-12 gap-8 w-full">
          
          {/* LEFT PANEL: The Interactive Chessboard */}
          <div className="lg:col-span-7 flex flex-col items-center">
            
            {/* Target Display Glow Banner */}
            <div className="w-full max-w-[460px] bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 mb-4 text-center backdrop-blur-md shadow-lg flex flex-col justify-center items-center h-24">
              {!isPlaying ? (
                <div>
                  <h3 className="text-lg font-bold text-purple-300">Ready to train?</h3>
                  <p className="text-xs text-slate-400 mt-1">Press Start below to begin your 30-second challenge</p>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  {gameMode === "find" ? (
                    <>
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Find Square</span>
                      <h2 className="text-4xl font-extrabold text-white tracking-wide mt-1 animate-pulse drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]">
                        {targetSquare?.toUpperCase()}
                      </h2>
                    </>
                  ) : (
                    <>
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Name the Highlighted Square</span>
                      {inputMode === "voice" ? (
                        <div className="flex flex-col items-center mt-1">
                          <h2 className="text-xl font-bold text-purple-300">Speak the coordinate</h2>
                          <div className="h-6 flex items-center justify-center">
                            {isListening ? (
                              <AudioWaveform isListening={true} isRecording={false} volumeLevel={0} />
                            ) : (
                              <span className="text-xs text-red-400">Speech initializing...</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <h2 className="text-xl font-bold text-white mt-1">Type or Tap coordinate below</h2>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ChessBoard Wrapper */}
            <div className="w-full max-w-[460px] aspect-square relative">
              <ChessBoard
                fen={boardFen}
                orientation={activeOrientation}
                onSquareClick={handleSquareClick}
                customSquareStyles={getCustomSquareStyles()}
                draggable={false}
              />
              
              {/* Correct/Incorrect Overlay flash on board */}
              {isCorrect !== null && (
                <div className="absolute inset-0 bg-transparent flex items-center justify-center pointer-events-none z-10">
                  <div className={`text-6xl font-black rounded-full px-6 py-4 backdrop-blur-sm animate-ping duration-300 ${
                    isCorrect ? "text-green-500" : "text-red-500"
                  }`}>
                    {isCorrect ? "\u2713" : "\u2717"}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT PANEL: Stats, Configuration, controls */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            
            {/* Live Stats Display */}
            <div className="bg-slate-800/40 border border-slate-700/50 backdrop-blur-md rounded-2xl p-5 shadow-xl grid grid-cols-3 items-center gap-4 relative overflow-hidden">
              <div className="text-center border-r border-slate-700/60">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Score</span>
                <span className="text-3xl font-black text-white">{score}</span>
              </div>
              <div className="text-center border-r border-slate-700/60 flex flex-col items-center justify-center">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Timer</span>
                
                {/* Visual Circle Timer */}
                <div className="relative w-12 h-12 mt-1 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 40 40">
                    <circle
                      cx="20"
                      cy="20"
                      r="18"
                      className="text-slate-700"
                      strokeWidth="3.5"
                      fill="transparent"
                      stroke="currentColor"
                    />
                    <circle
                      cx="20"
                      cy="20"
                      r="18"
                      className={getTimerColorClass()}
                      strokeWidth="3.5"
                      fill="transparent"
                      stroke="currentColor"
                      strokeDasharray="113"
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className={`absolute text-sm font-bold ${getTimerColorClass()}`}>{timeLeft}s</span>
                </div>
              </div>
              <div className="text-center">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">High Score</span>
                <span className="text-3xl font-black text-purple-400">{highScore}</span>
              </div>
              
              {/* Streak Flame Badge */}
              {streak >= 3 && (
                <div className="absolute top-2 right-2 bg-orange-500/20 text-orange-400 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-orange-500/50 animate-bounce flex items-center gap-0.5">
                  🔥 {streak} STREAK
                </div>
              )}
            </div>

            {/* In-Game Name Mode Controls */}
            {isPlaying && gameMode === "name" && (
              <div className="bg-slate-800/40 border border-slate-700/50 backdrop-blur-md rounded-2xl p-5 shadow-xl">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Submit coordinate</h3>
                
                {inputMode === "tap" ? (
                  <form onSubmit={handleKeyboardSubmit} className="flex gap-2">
                    <input
                      type="text"
                      maxLength={2}
                      autoFocus
                      placeholder="e.g. e4"
                      value={typedInput}
                      onChange={(e) => setTypedInput(e.target.value.toLowerCase())}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white font-mono text-lg font-bold w-full uppercase focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <button
                      type="submit"
                      disabled={isCorrect !== null}
                      className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-6 py-2 rounded-lg transition-colors text-sm"
                    >
                      Submit
                    </button>
                  </form>
                ) : (
                  <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800 text-center font-mono">
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">Live voice text</span>
                    <p className="text-slate-300 text-lg font-bold min-h-7 italic">
                      &quot;{speechTranscript || "Listening..."}&quot;
                    </p>
                    {speechError && (
                      <p className="text-xs text-red-400 mt-1 font-sans">{speechError}</p>
                    )}
                  </div>
                )}

                {/* Quick Touch Button Panel for Tapping */}
                {inputMode === "tap" && (
                  <div className="mt-4">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Quick coordinates tap grid</span>
                    
                    {/* Select File and Rank grids */}
                    <div className="flex flex-col gap-2">
                      <div className="grid grid-cols-8 gap-1">
                        {FILES.map((f) => (
                          <button
                            key={f}
                            onClick={() => setTypedInput((prev) => f + (prev[1] || ""))}
                            className={`py-1.5 rounded bg-slate-900 hover:bg-slate-750 border border-slate-700 text-xs font-bold text-slate-300 uppercase transition-colors ${
                              typedInput[0] === f ? "bg-purple-600/30 text-purple-300 border-purple-500" : ""
                            }`}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-8 gap-1">
                        {RANKS.map((r) => (
                          <button
                            key={r}
                            onClick={() => setTypedInput((prev) => (prev[0] || "a") + r)}
                            className={`py-1.5 rounded bg-slate-900 hover:bg-slate-750 border border-slate-700 text-xs font-bold text-slate-300 transition-colors ${
                              typedInput[1] === r ? "bg-purple-600/30 text-purple-300 border-purple-500" : ""
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => {
                          if (typedInput.length === 2) {
                            submitGuess(typedInput);
                          }
                        }}
                        disabled={typedInput.length !== 2 || isCorrect !== null}
                        className="w-full bg-slate-700 hover:bg-slate-650 text-white font-bold py-2 rounded text-xs tracking-wider uppercase disabled:opacity-50 transition-colors"
                      >
                        Tap to Confirm Guess
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Game Setup / Configuration Card */}
            <div className="bg-slate-800/40 border border-slate-700/50 backdrop-blur-md rounded-2xl p-5 shadow-xl flex flex-col gap-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-700/50 pb-2">
                Trainer Configuration
              </h3>

              {/* Game Mode Choice */}
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Game Mode</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    disabled={isPlaying}
                    onClick={() => setGameMode("find")}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors ${
                      gameMode === "find"
                        ? "bg-purple-600 border-purple-500 text-white shadow-[0_0_12px_rgba(168,85,247,0.3)]"
                        : "bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-750 hover:text-slate-300 disabled:opacity-50"
                    }`}
                  >
                    🎯 Find Square
                  </button>
                  <button
                    disabled={isPlaying}
                    onClick={() => setGameMode("name")}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors ${
                      gameMode === "name"
                        ? "bg-purple-600 border-purple-500 text-white shadow-[0_0_12px_rgba(168,85,247,0.3)]"
                        : "bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-750 hover:text-slate-300 disabled:opacity-50"
                    }`}
                  >
                    🏷️ Name Square
                  </button>
                </div>
              </div>

              {/* Board Setup Choice */}
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Board Setup</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    disabled={isPlaying}
                    onClick={() => setBoardSetup("empty")}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors ${
                      boardSetup === "empty"
                        ? "bg-purple-600 border-purple-500 text-white shadow-[0_0_12px_rgba(168,85,247,0.3)]"
                        : "bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-750 hover:text-slate-300 disabled:opacity-50"
                    }`}
                  >
                    Empty Board
                  </button>
                  <button
                    disabled={isPlaying}
                    onClick={() => setBoardSetup("pieces")}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors ${
                      boardSetup === "pieces"
                        ? "bg-purple-600 border-purple-500 text-white shadow-[0_0_12px_rgba(168,85,247,0.3)]"
                        : "bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-750 hover:text-slate-300 disabled:opacity-50"
                    }`}
                  >
                    Starting Pieces
                  </button>
                </div>
              </div>

              {/* Orientation Setting */}
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Orientation</span>
                <div className="grid grid-cols-3 gap-2">
                  {(["white", "black", "random"] as const).map((opt) => (
                    <button
                      key={opt}
                      disabled={isPlaying}
                      onClick={() => setOrientationSetting(opt)}
                      className={`py-2 px-1.5 rounded-lg text-[11px] font-bold border capitalize transition-colors ${
                        orientationSetting === opt
                          ? "bg-purple-600 border-purple-500 text-white shadow-[0_0_12px_rgba(168,85,247,0.3)]"
                          : "bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-750 hover:text-slate-300 disabled:opacity-50"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Input Mode (Visible only in Name Square Mode) */}
              {gameMode === "name" && (
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                    Input Method
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      disabled={isPlaying}
                      onClick={() => setInputMode("tap")}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors ${
                        inputMode === "tap"
                          ? "bg-purple-600 border-purple-500 text-white shadow-[0_0_12px_rgba(168,85,247,0.3)]"
                          : "bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-750 hover:text-slate-300 disabled:opacity-50"
                      }`}
                    >
                      ⌨️ Keyboard / Grid
                    </button>
                    <button
                      disabled={isPlaying || !isSpeechSupported}
                      onClick={() => setInputMode("voice")}
                      title={!isSpeechSupported ? "Speech recognition not supported in this browser" : ""}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        inputMode === "voice"
                          ? "bg-purple-600 border-purple-500 text-white shadow-[0_0_12px_rgba(168,85,247,0.3)]"
                          : "bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-750 hover:text-slate-300"
                      }`}
                    >
                      🎙️ Voice Command
                    </button>
                  </div>
                </div>
              )}

              {/* Action Buttons: Play, Reset */}
              <div className="flex flex-col gap-2 mt-2">
                {!isPlaying ? (
                  <button
                    onClick={startGame}
                    className="w-full py-4 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white font-extrabold rounded-xl transition-all shadow-[0_4px_20px_rgba(168,85,247,0.35)] hover:shadow-[0_4px_25px_rgba(168,85,247,0.5)] transform hover:-translate-y-0.5 text-center text-sm uppercase tracking-wider"
                  >
                    Start Training Challenge ⚡
                  </button>
                ) : (
                  <button
                    onClick={resetGame}
                    className="w-full py-4 bg-slate-700 hover:bg-slate-650 text-slate-200 font-bold rounded-xl transition-all text-center text-sm uppercase tracking-wider border border-slate-600"
                  >
                    Reset & Stop Challenge
                  </button>
                )}
              </div>
            </div>

            {/* Instruction Helper Card */}
            <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-4 text-xs text-slate-400">
              <h4 className="font-bold text-slate-300 uppercase tracking-wider mb-2">How to Play</h4>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>Find Square</strong>: Look at the highlighted coordinates on top and click the matching square on the board as fast as possible.</li>
                <li><strong>Name Square</strong>: Look at the pulsing purple square on the board, and type or shout out its coordinate.</li>
                <li><strong>Voice Command</strong>: Speak coordinates clearly (e.g. &quot;e4&quot;, &quot;delta five&quot;, &quot;bravo six&quot;).</li>
                <li>Score as many points as you can in 30 seconds. Consecutive correct answers build a multiplier flame!</li>
              </ul>
            </div>
            
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
