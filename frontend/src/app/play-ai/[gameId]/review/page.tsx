"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Chess } from "chess.js";
import { useAiGameSocket } from "@/hooks/useAiGameSocket";
import { useAiGameStore } from "@/stores/aiGameStore";
import { ChessBoard } from "@/components/ChessBoard";
import { PageLayout } from "@/components/PageLayout";

export default function PlayAiReviewPage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;

  const { getReview } = useAiGameSocket();
  const { isConnected, reviewData, notFound, setNotFound } = useAiGameStore();

  const [selectedPly, setSelectedPly] = useState<number | null>(null);
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    if (isConnected && !requested) {
      setRequested(true);
      getReview(gameId);
    }
  }, [isConnected, requested, gameId, getReview]);

  useEffect(() => {
    if (notFound) {
      setNotFound(false);
      router.push("/play-ai");
    }
  }, [notFound, setNotFound, router]);

  const review = reviewData?.gameId === gameId ? reviewData : null;

  const totalPlies = review?.moves.length ?? 0;
  const ply = selectedPly ?? totalPlies;

  const fenAtPly = useMemo(() => {
    const chess = new Chess();
    if (!review) return chess.fen();
    for (let i = 0; i < ply && i < review.moves.length; i++) {
      try {
        chess.move(review.moves[i]);
      } catch {
        break;
      }
    }
    return chess.fen();
  }, [review, ply]);

  const resultText = useMemo(() => {
    if (!review) return "";
    const reason = review.endReason
      ? review.endReason.replace(/_/g, " ")
      : "";
    if (review.winner === "player") return `You won by ${reason}`;
    if (review.winner === "bot")
      return `${review.persona.name} won by ${reason}`;
    return `Draw — ${reason}`;
  }, [review]);

  if (!review) {
    return (
      <PageLayout>
        <main className="flex items-center justify-center p-4 py-16">
          <p className="text-slate-400 animate-pulse">Loading game review…</p>
        </main>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <main className="p-4 py-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white mb-1">
              Inside {review.persona.name}&apos;s head {review.persona.emoji}
            </h1>
            <p className="text-sm text-slate-400">
              {resultText} · {review.result}
            </p>
          </div>

          <div className="grid lg:grid-cols-[1fr_420px] gap-6">
            {/* Board + scrubber */}
            <div>
              <ChessBoard
                fen={fenAtPly}
                orientation={review.playerColor}
              />
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  onClick={() => setSelectedPly(Math.max(0, ply - 1))}
                  disabled={ply === 0}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-slate-200 rounded-lg transition-all"
                >
                  ← Prev
                </button>
                <span className="text-sm text-slate-400 min-w-[80px] text-center">
                  {ply} / {totalPlies}
                </span>
                <button
                  onClick={() =>
                    setSelectedPly(Math.min(totalPlies, ply + 1))
                  }
                  disabled={ply >= totalPlies}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-slate-200 rounded-lg transition-all"
                >
                  Next →
                </button>
              </div>

              <button
                onClick={() => router.push("/play-ai")}
                className="mt-4 w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg transition-all"
              >
                Play another game
              </button>
            </div>

            {/* Thinking timeline */}
            <div className="space-y-3 lg:max-h-[75vh] lg:overflow-y-auto lg:pr-1">
              {review.turns.length === 0 && (
                <p className="text-sm text-slate-500">
                  No bot turns recorded for this game.
                </p>
              )}
              {review.turns.map((turn, index) => {
                const prevTurnIndex =
                  index > 0 ? review.turns[index - 1].turnIndex : -1;
                const turnChat = review.chat.filter(
                  (m) =>
                    m.turnIndex > prevTurnIndex &&
                    m.turnIndex <= turn.turnIndex,
                );
                const moveNumber = Math.floor(turn.turnIndex / 2) + 1;
                const isCurrentPly = ply === turn.turnIndex + 1;
                return (
                  <button
                    key={turn.turnIndex}
                    onClick={() => setSelectedPly(turn.turnIndex + 1)}
                    className={`w-full text-left bg-slate-800 rounded-xl p-4 border-2 transition-all ${
                      isCurrentPly
                        ? "border-purple-500"
                        : "border-transparent hover:border-slate-600"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-bold text-slate-100">
                        {moveNumber}. {turn.move}
                      </span>
                      {turn.moveSource !== "llm" && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-900/40 text-yellow-400 border border-yellow-800"
                          title="The AI couldn't settle on a legal move here, so a fallback picked one"
                        >
                          improvised
                        </span>
                      )}
                    </div>

                    {turnChat.length > 0 && (
                      <div className="mb-2 space-y-1">
                        {turnChat.map((m) => (
                          <p
                            key={m.id}
                            className={`text-xs ${
                              m.from === "bot"
                                ? "text-purple-300"
                                : "text-slate-400"
                            }`}
                          >
                            <span className="font-semibold">
                              {m.from === "bot"
                                ? review.persona.name
                                : "You"}
                              :
                            </span>{" "}
                            {m.text}
                          </p>
                        ))}
                      </div>
                    )}

                    {turn.thinking ? (
                      <div className="bg-slate-900 rounded-lg p-3">
                        <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                          Private notes
                        </div>
                        <p className="text-xs font-mono text-slate-300 whitespace-pre-wrap">
                          {turn.thinking}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">
                        (no recorded thinking this turn)
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </PageLayout>
  );
}
