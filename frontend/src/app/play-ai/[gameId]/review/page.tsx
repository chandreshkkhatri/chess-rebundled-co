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
  const { isConnected, reviewData, notFound, setNotFound, error, setError } = useAiGameStore();

  const [selectedPly, setSelectedPly] = useState<number | null>(null);

  useEffect(() => {
    if (isConnected) getReview(gameId);
  }, [isConnected, gameId, getReview]);

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
          <div className="text-center">
            {error ? (
              <>
                <p className="text-red-400 mb-3">{error}</p>
                <button
                  onClick={() => { setError(null); getReview(gameId); }}
                  disabled={!isConnected}
                  className="px-4 py-2 rounded-lg bg-purple-600 text-white disabled:opacity-50"
                >
                  Retry review
                </button>
              </>
            ) : (
              <p className="text-slate-400 animate-pulse">
                {isConnected ? 'Loading game review…' : 'Reconnecting to load review…'}
              </p>
            )}
          </div>
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
              Decisions with {review.persona.name} {review.persona.emoji}
            </h1>
            <p className="text-sm text-slate-400">
              {resultText} · {review.result}
            </p>
            <p className="mt-2 text-sm text-slate-400">
              Explanations recorded when each move was chosen. These are AI-generated summaries and may contain chess mistakes.
            </p>
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1fr)_420px] gap-6 items-start">
            {/* Board + scrubber */}
            <div className="w-full max-w-[min(100%,calc(100vh-280px))] mx-auto lg:sticky lg:top-4">
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
                      {(turn.moveSource === "heuristic" || turn.moveSource === "random") && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-900/40 text-yellow-400 border border-yellow-800"
                          title="A simple chess fallback chose this move while the AI was unavailable"
                        >
                          fallback move
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

                    {turn.decision ? (
                      <div className="space-y-3 text-sm text-slate-300">
                        <p>{turn.decision.summary}</p>
                        {turn.decision.alternatives.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-slate-400 mb-1">Alternatives</p>
                            {turn.decision.alternatives.map(alternative => (
                              <p key={alternative.move} className="text-xs mt-1">
                                <span className="font-semibold">{alternative.move}</span>: {alternative.reason}
                              </p>
                            ))}
                          </div>
                        )}
                        <p className="text-xs"><span className="font-semibold text-slate-400">Threat: </span>{turn.decision.threat}</p>
                        <p className="text-xs"><span className="font-semibold text-slate-400">Plan: </span>{turn.decision.plan}</p>
                      </div>
                    ) : turn.moveSource === "heuristic" || turn.moveSource === "random" ? (
                      <p className="text-xs text-slate-400">
                        A simple chess fallback selected this move. No AI decision summary was recorded.
                      </p>
                    ) : turn.thinking ? (
                      <div className="bg-slate-900 rounded-lg p-3">
                        <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                          Earlier game notes
                        </div>
                        <p className="text-xs font-mono text-slate-300 whitespace-pre-wrap">
                          {turn.thinking}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">
                        No decision summary was recorded for this move.
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
