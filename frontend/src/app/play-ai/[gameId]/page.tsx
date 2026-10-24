"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { Chess } from "chess.js";
import { useAiGameSocket } from "@/hooks/useAiGameSocket";
import { useAiGameStore } from "@/stores/aiGameStore";
import { ChessBoard } from "@/components/ChessBoard";
import { MoveHistory } from "@/components/MoveHistory";
import { AiChatPanel } from "@/components/AiChatPanel";
import { UniversalInputPanel } from "@/components/UniversalInputPanel";
import { usePracticeStore } from "@/stores/practiceStore";
import { useAiMoveInput } from "@/hooks/useAiMoveInput";
import { PageLayout } from "@/components/PageLayout";

export default function PlayAiGamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;

  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
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
    aiNotice,
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

  const inputActive = isMyTurn && isConnected && !isSubmitting;
  const voice = useAiMoveInput(gameId, fen, inputActive);
  const { inputMode, voiceParsingMode, autoSubmitEnabled } = usePracticeStore();
  const handleNotationMove = useCallback((move: string) => {
    if (inputActive) submitMove(gameId, move);
  }, [inputActive, gameId, submitMove]);

  // Rejoin the game room and resync on every connection, including reconnects.
  useEffect(() => {
    if (gameId && isConnected) {
      reconnect(gameId);
    }
  }, [gameId, isConnected, reconnect]);

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
      if (!inputActive) return false;
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
    [fen, gameId, inputActive, submitMove],
  );

  const handlePieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string): boolean =>
      tryMove(sourceSquare, targetSquare),
    [tryMove],
  );

  const handleSquareClick = useCallback(
    (square: string, piece: string | undefined) => {
      if (!inputActive) return;
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
    [inputActive, selectedSquare, legalTargets, tryMove, playerColor],
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

          {aiNotice && (
            <p role="status" className="mb-4 p-3 rounded-lg bg-amber-900/30 text-sm text-amber-200">
              {aiNotice}
            </p>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
            {/* Board column — board capped to viewport height so the whole
                position is always visible without scrolling */}
            <div className="w-full min-w-0 max-w-[min(100%,calc(100vh-240px))] mx-auto">
              {/* Status bar */}
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm text-slate-300 flex items-center gap-2 min-w-0">
                  {isGameOver ? (
                    <span className="font-semibold truncate">{resultText}</span>
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
                  {playerColor && !isGameOver && (
                    <span className="text-xs text-slate-500 whitespace-nowrap">
                      · you play {playerColor}
                    </span>
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
                draggable={inputActive}
                onPieceDrop={handlePieceDrop}
                onSquareClick={handleSquareClick}
                highlightSquares={highlightSquares}
              />

              {!isGameOver && (
                <div className="mt-4 h-[280px]">
                  <UniversalInputPanel
                    key={fen}
                    fen={fen}
                    isActive={inputActive}
                    isSubmitting={isSubmitting}
                    inputMode={inputMode}
                    voiceParsingMode={voiceParsingMode}
                    autoSubmitEnabled={autoSubmitEnabled}
                    aiParseResult={voice.aiParseResult}
                    aiParseError={voice.aiParseError}
                    isAIParsing={voice.isAIParsing}
                    onMoveSubmit={handleNotationMove}
                    onParseMoveWithText={voice.parseText}
                    onParseMoveWithAudio={voice.parseAudio}
                    clearAIParseState={voice.clearAIParseState}
                  />
                </div>
              )}

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

            <aside className="min-w-0 space-y-4 lg:sticky lg:top-4">
              <div className="bg-slate-800 rounded-2xl p-5">
                <h2 className="font-semibold text-slate-100">
                  {persona?.emoji} {persona?.name || "AI Opponent"}
                </h2>
                <p className="mt-2 text-sm text-slate-400">{persona?.tagline}</p>
                <p className="mt-4 text-sm text-slate-300">
                  Play at your own pace. Review your opponent&apos;s move explanations after the game.
                </p>
                <button
                  onClick={() => setChatOpen(open => !open)}
                  aria-expanded={chatOpen}
                  aria-controls="ai-conversation"
                  className="mt-4 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm text-slate-200"
                >
                  {chatOpen ? "Close conversation" : "Open optional conversation"}
                </button>
              </div>
              <div id="ai-conversation" hidden={!chatOpen}>
                {chatOpen && <AiChatPanel
                  persona={persona}
                  chat={chat}
                  botTyping={botTyping}
                  disabled={isGameOver || !isConnected}
                  onSend={handleSendChat}
                  className="h-[420px] lg:max-h-[60vh]"
                />}
              </div>
            </aside>
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
                  Review moves and decisions →
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
