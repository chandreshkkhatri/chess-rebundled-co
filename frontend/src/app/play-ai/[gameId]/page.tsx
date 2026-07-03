"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { Chess } from "chess.js";
import { useAiGameSocket } from "@/hooks/useAiGameSocket";
import { useAiGameStore } from "@/stores/aiGameStore";
import { ChessBoard } from "@/components/ChessBoard";
import { MoveHistory } from "@/components/MoveHistory";
import { AiChatPanel } from "@/components/AiChatPanel";
import { PageLayout } from "@/components/PageLayout";

export default function PlayAiGamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;

  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);

  const { submitMove, sendChat, resign, reconnect } = useAiGameSocket();

  const {
    isConnected,
    status,
    playerColor,
    persona,
    fen,
    moves,
    turn,
    lastMove,
    chat,
    botTyping,
    botTurnInProgress,
    result,
    endReason,
    winner,
    finalBotMessage,
    isSubmitting,
    error,
    notFound,
    setError,
    setNotFound,
  } = useAiGameStore();

  const isGameOver = status === "completed";
  const isMyTurn =
    status === "active" && turn === playerColor && !botTurnInProgress;

  // Resume the game after a refresh (or when landing here directly).
  useEffect(() => {
    if (gameId && status === "idle" && isConnected) {
      reconnect(gameId);
    }
  }, [gameId, status, isConnected, reconnect]);

  // Unknown/expired game — back to setup.
  useEffect(() => {
    if (notFound) {
      setNotFound(false);
      router.push("/play-ai");
    }
  }, [notFound, setNotFound, router]);

  const legalTargets = useMemo(() => {
    if (!selectedSquare || !isMyTurn) return [];
    try {
      const chess = new Chess(fen);
      return chess
        .moves({ square: selectedSquare as never, verbose: true })
        .map((m) => m.to as string);
    } catch {
      return [];
    }
  }, [selectedSquare, fen, isMyTurn]);

  const tryMove = useCallback(
    (from: string, to: string): boolean => {
      if (!isMyTurn || isSubmitting) return false;
      try {
        const chess = new Chess(fen);
        const move = chess.move({ from, to, promotion: "q" });
        if (!move) return false;
        submitMove(gameId, move.san);
        setSelectedSquare(null);
        return true;
      } catch {
        return false;
      }
    },
    [fen, gameId, isMyTurn, isSubmitting, submitMove],
  );

  const handlePieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string): boolean =>
      tryMove(sourceSquare, targetSquare),
    [tryMove],
  );

  const handleSquareClick = useCallback(
    (square: string, piece: string | undefined) => {
      if (!isMyTurn) return;
      if (selectedSquare && legalTargets.includes(square)) {
        tryMove(selectedSquare, square);
        return;
      }
      // Select own piece (react-chessboard piece codes start with color letter)
      const myPrefix = playerColor === "white" ? "w" : "b";
      if (piece && piece.startsWith(myPrefix)) {
        setSelectedSquare(square === selectedSquare ? null : square);
      } else {
        setSelectedSquare(null);
      }
    },
    [isMyTurn, selectedSquare, legalTargets, tryMove, playerColor],
  );

  const handleSendChat = useCallback(
    (text: string) => {
      if (gameId) sendChat(gameId, text);
    },
    [gameId, sendChat],
  );

  const handleResign = useCallback(() => {
    if (gameId) resign(gameId);
    setShowResignConfirm(false);
  }, [gameId, resign]);

  const resultText = useMemo(() => {
    if (!isGameOver) return "";
    const reasonText = endReason ? endReason.replace(/_/g, " ") : "";
    if (winner === "player") return `You won by ${reasonText}!`;
    if (winner === "bot")
      return `${persona?.name || "The AI"} won by ${reasonText}`;
    return `Draw — ${reasonText}`;
  }, [isGameOver, winner, endReason, persona]);

  const highlightSquares = selectedSquare
    ? [selectedSquare, ...legalTargets]
    : [];

  return (
    <PageLayout>
      <main className="p-4 py-6">
        <div className="max-w-6xl mx-auto">
          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={() => setError(null)}
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

          <div className="grid lg:grid-cols-[1fr_340px] gap-6">
            {/* Board column */}
            <div>
              {/* Status bar */}
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm text-slate-300">
                  {isGameOver ? (
                    <span className="font-semibold">{resultText}</span>
                  ) : botTurnInProgress ? (
                    <span className="text-purple-300 animate-pulse">
                      {persona?.name || "AI"} is thinking…
                    </span>
                  ) : isMyTurn ? (
                    <span className="font-semibold text-green-400">
                      Your move
                    </span>
                  ) : (
                    <span>Waiting…</span>
                  )}
                </div>
                {!isGameOver && (
                  <button
                    onClick={() => setShowResignConfirm(true)}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-red-900/50 text-slate-300 hover:text-red-300 text-xs rounded-lg transition-all"
                  >
                    Resign
                  </button>
                )}
              </div>

              <ChessBoard
                fen={fen}
                orientation={playerColor || "white"}
                lastMove={lastMove || undefined}
                draggable={isMyTurn && !isSubmitting}
                onPieceDrop={handlePieceDrop}
                onSquareClick={handleSquareClick}
                highlightSquares={highlightSquares}
              />

              {/* Move history */}
              <div className="mt-4">
                <MoveHistory
                  moves={moves.map((san, i) => ({
                    moveIndex: i,
                    expectedMove: san,
                    submittedMove: san,
                    isCorrect: true,
                    timeSpent: 0,
                    side: (i % 2 === 0 ? "white" : "black") as
                      | "white"
                      | "black",
                  }))}
                  mode="both-sides"
                  playerColor={playerColor}
                  variant="compact"
                  theme="dark"
                  autoScroll
                />
              </div>
            </div>

            {/* Chat column */}
            <AiChatPanel
              persona={persona}
              chat={chat}
              botTyping={botTyping}
              disabled={isGameOver}
              onSend={handleSendChat}
              className="h-[420px] lg:h-auto lg:min-h-[520px]"
            />
          </div>
        </div>

        {/* Resign confirmation */}
        {showResignConfirm && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-2xl p-6 max-w-sm w-full">
              <h3 className="text-lg font-semibold text-white mb-2">
                Resign this game?
              </h3>
              <p className="text-sm text-slate-400 mb-4">
                {persona?.name || "Your opponent"} will take the win.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleResign}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-all"
                >
                  Resign
                </button>
                <button
                  onClick={() => setShowResignConfirm(false)}
                  className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-all"
                >
                  Keep playing
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Game over overlay */}
        {isGameOver && result && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-2xl p-6 max-w-sm w-full text-center">
              <div className="text-4xl mb-2">
                {winner === "player" ? "🏆" : winner === "bot" ? "🤝" : "⚖️"}
              </div>
              <h3 className="text-xl font-bold text-white mb-1">
                {resultText}
              </h3>
              <p className="text-sm text-slate-400 mb-3">{result}</p>
              {finalBotMessage && (
                <div className="mb-4 px-3 py-2 bg-slate-700 rounded-xl text-sm text-slate-200 text-left">
                  <span className="mr-1">{persona?.emoji}</span>
                  {finalBotMessage}
                </div>
              )}
              <div className="grid gap-2">
                <button
                  onClick={() => router.push(`/play-ai/${gameId}/review`)}
                  className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg transition-all"
                >
                  See what {persona?.name || "the AI"} was thinking →
                </button>
                <button
                  onClick={() => router.push("/play-ai")}
                  className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-all"
                >
                  Play again
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </PageLayout>
  );
}
