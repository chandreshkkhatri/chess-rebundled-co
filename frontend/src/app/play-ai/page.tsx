"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAiGameSocket } from "@/hooks/useAiGameSocket";
import { useAiGameStore } from "@/stores/aiGameStore";
import { useAuth } from "@/contexts/AuthContext";
import { useLoginModal } from "@/contexts/LoginModalContext";
import { PageLayout } from "@/components/PageLayout";
import { AI_PERSONAS } from "@/types/aiGame";

type ColorChoice = "white" | "black" | "random";

const COLOR_OPTIONS: { id: ColorChoice; label: string; icon: string }[] = [
  { id: "white", label: "White", icon: "♔" },
  { id: "black", label: "Black", icon: "♚" },
  { id: "random", label: "Random", icon: "🎲" },
];

export default function PlayAiSetupPage() {
  const router = useRouter();
  const [colorChoice, setColorChoice] = useState<ColorChoice>("random");
  const [starting, setStarting] = useState(false);

  const { user } = useAuth();
  const { openLoginModal } = useLoginModal();
  const { startGame } = useAiGameSocket();

  const {
    isConnected,
    gameId,
    status,
    error,
    preferredPersonaId,
    setPreferredPersonaId,
    setError,
    reset,
  } = useAiGameStore();

  // Navigate once the game exists (fresh start or resumed active game).
  useEffect(() => {
    if (gameId && (status === "active" || status === "bot-thinking")) {
      router.push(`/play-ai/${gameId}`);
    }
  }, [gameId, status, router]);

  // Clear a finished game left in the store.
  useEffect(() => {
    const state = useAiGameStore.getState();
    if (state.status === "completed") {
      reset();
    }
  }, [reset]);

  const selectedPersona =
    AI_PERSONAS.find((p) => p.id === preferredPersonaId) || AI_PERSONAS[0];

  const handleStart = () => {
    if (!user) {
      openLoginModal({
        onSuccess: () => startGame(selectedPersona.id, colorChoice),
      });
      return;
    }
    setStarting(true);
    startGame(selectedPersona.id, colorChoice);
  };

  return (
    <PageLayout>
      <main className="flex items-center justify-center p-4 py-8">
        <div className="max-w-md md:max-w-2xl w-full">
          <div className="text-center mb-6">
            <h1 className="text-4xl font-bold text-white mb-2">Play vs AI</h1>
            <p className="text-slate-400">
              A living opponent — it thinks, it talks, it plays
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={() => {
                  setError(null);
                  setStarting(false);
                }}
                className="text-xs text-red-300 underline mt-1"
              >
                Dismiss
              </button>
            </div>
          )}

          {!isConnected && (
            <div className="mb-4 p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg">
              <p className="text-sm text-yellow-400">Connecting to server...</p>
            </div>
          )}

          <div className="bg-slate-800 rounded-2xl shadow-xl p-6">
            {/* Persona picker */}
            <h3 className="text-sm font-medium text-slate-300 mb-3">
              Choose your opponent
            </h3>
            <div className="grid gap-3 mb-6">
              {AI_PERSONAS.map((persona) => (
                <button
                  key={persona.id}
                  onClick={() => setPreferredPersonaId(persona.id)}
                  className={`p-4 rounded-xl border-2 text-left transition-all flex items-center gap-4 ${
                    preferredPersonaId === persona.id
                      ? "border-purple-500 bg-purple-900/30"
                      : "border-slate-600 hover:border-slate-500"
                  }`}
                >
                  <span className="text-3xl">{persona.emoji}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-100">
                        {persona.name}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                        ~{persona.rating}
                      </span>
                    </div>
                    <div className="text-sm text-slate-400">
                      {persona.tagline}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Color picker */}
            <h3 className="text-sm font-medium text-slate-300 mb-3">
              Play as
            </h3>
            <div className="grid grid-cols-3 gap-2 mb-6">
              {COLOR_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setColorChoice(option.id)}
                  className={`p-3 rounded-lg border-2 text-center transition-all ${
                    colorChoice === option.id
                      ? "border-purple-500 bg-purple-900/30"
                      : "border-slate-600 hover:border-slate-500"
                  }`}
                >
                  <div className="text-2xl">{option.icon}</div>
                  <div className="text-sm text-slate-300">{option.label}</div>
                </button>
              ))}
            </div>

            <button
              onClick={handleStart}
              disabled={!isConnected || starting}
              className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold rounded-lg transition-all"
            >
              {starting
                ? "Starting..."
                : `Play ${selectedPersona.name} ${selectedPersona.emoji}`}
            </button>

            {!user && (
              <p className="mt-3 text-center text-xs text-slate-500">
                You&apos;ll be asked to sign in — AI games are tied to your
                account
              </p>
            )}
          </div>
        </div>
      </main>
    </PageLayout>
  );
}
