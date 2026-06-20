"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMultiplayerSocket } from "@/hooks/useMultiplayerSocket";
import { useMultiplayerStore } from "@/stores/multiplayerStore";
import { usePracticeSocket } from "@/hooks/usePracticeSocket";
import { ChessBoard } from "@/components/ChessBoard";
import { ChessClock } from "@/components/ChessClock";
import { UniversalInputPanel } from "@/components/UniversalInputPanel";
import { MoveHistory } from "@/components/MoveHistory";

export default function MultiplayerGamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;

  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [showMoveHistory, setShowMoveHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [highlightSquares, setHighlightSquares] = useState<string[]>([]);
  const settingsRef = useRef<HTMLDivElement>(null);

  const {
    submitMove,
    resign,
    offerDraw,
    respondDraw,
    reconnect,
    parseMoveWithAI,
    parseAudioMoveWithGemini,
  } = useMultiplayerSocket();
  // Init practice socket for shared connection
  usePracticeSocket();

  const {
    status,
    playerColor,
    fen,
    moves,
    turn,
    moveCount,
    lastMove,
    isCheck,
    opponent,
    timeControl,
    whiteTimeMs,
    blackTimeMs,
    result,
    endReason,
    winner,
    drawOfferedBy,
    isSubmitting,
    aiParseResult,
    aiParseError,
    isAIParsing,
    isConnected,
    error,
    setError,
    clearAIParseState,
    voiceParsingMode,
    autoSubmitEnabled,
    inputMode,
    setVoiceParsingMode,
    setAutoSubmitEnabled,
    setInputMode,
    reset,
  } = useMultiplayerStore();

  // Try to reconnect if we have a gameId but aren't in a game
  useEffect(() => {
    if (
      gameId &&
      status !== "playing" &&
      status !== "completed" &&
      isConnected
    ) {
      reconnect(gameId);
    }
  }, [gameId, status, isConnected, reconnect]);

  // Close settings dropdown on outside click
  useEffect(() => {
    if (!showSettings) return;
    const handler = (e: MouseEvent) => {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(e.target as Node)
      ) {
        setShowSettings(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSettings]);

  const isMyTurn = turn === playerColor;
  const isGameOver = status === "completed";
  const isGameActive = status === "playing";

  const handleMoveSubmit = useCallback(
    (move: string) => {
      if (!gameId || isSubmitting) return;
      submitMove(gameId, move);
    },
    [gameId, isSubmitting, submitMove],
  );

  const handleResign = useCallback(() => {
    if (!gameId) return;
    resign(gameId);
    setShowResignConfirm(false);
  }, [gameId, resign]);

  const handleOfferDraw = useCallback(() => {
    if (!gameId) return;
    offerDraw(gameId);
  }, [gameId, offerDraw]);

  const handleRespondDraw = useCallback(
    (accept: boolean) => {
      if (!gameId) return;
      respondDraw(gameId, accept);
    },
    [gameId, respondDraw],
  );

  const handleExit = useCallback(() => {
    reset();
    router.push("/play");
  }, [reset, router]);

  // Derive game result text
  const resultText = useMemo(() => {
    if (!result || !endReason) return "";
    const reasons: Record<string, string> = {
      checkmate: "Checkmate",
      stalemate: "Stalemate",
      timeout: "Time out",
      resignation: "Resignation",
      draw_agreement: "Draw by agreement",
      insufficient_material: "Insufficient material",
      threefold_repetition: "Threefold repetition",
      fifty_move_rule: "Fifty-move rule",
      abandonment: "Opponent abandoned",
    };
    const reason = reasons[endReason] || endReason;

    if (result === "1/2-1/2") return `Draw — ${reason}`;
    const didWin = winner === playerColor;
    return didWin ? `You won — ${reason}` : `You lost — ${reason}`;
  }, [result, endReason, winner, playerColor]);

  // Draw offer for me
  const drawOfferedToMe = drawOfferedBy && drawOfferedBy !== playerColor;

  // Board orientation
  const orientation = playerColor || "white";

  // Loading state
  if (status !== "playing" && status !== "completed") {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          {error ? (
            <>
              <p className="text-red-400 mb-4">{error}</p>
              <button
                onClick={handleExit}
                className="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-lg"
              >
                Back to Lobby
              </button>
            </>
          ) : (
            <>
              <div className="animate-spin h-10 w-10 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-slate-400">Connecting to game...</p>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-3 py-2">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          {/* Exit */}
          <button
            onClick={() =>
              isGameOver ? handleExit() : setShowResignConfirm(true)
            }
            className="text-slate-400 hover:text-white transition-colors text-sm"
          >
            {isGameOver ? "Exit" : "Leave"}
          </button>

          {/* Opponent info */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-400">vs</span>
            <span className="text-white font-medium">
              {opponent?.displayName || "Opponent"}
            </span>
            {opponent && !opponent.connected && (
              <span className="text-xs text-yellow-400">(disconnected)</span>
            )}
          </div>

          {/* Settings gear + Clock group */}
          <div className="flex items-center gap-2">
            <div className="relative" ref={settingsRef}>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="text-slate-400 hover:text-white transition-colors p-1"
                aria-label="Game settings"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              {/* Settings dropdown */}
              {showSettings && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 p-3 space-y-3">
                  {/* Input mode */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-300">Input mode</span>
                    <button
                      onClick={() =>
                        setInputMode(
                          inputMode === "voice-tap" ? "tap-only" : "voice-tap",
                        )
                      }
                      className={`px-2 py-1 text-xs rounded ${
                        inputMode === "voice-tap"
                          ? "bg-purple-600 text-white"
                          : "bg-slate-600 text-slate-300"
                      }`}
                    >
                      {inputMode === "voice-tap" ? "Voice + Tap" : "Tap only"}
                    </button>
                  </div>

                  {/* Voice parsing mode */}
                  {inputMode === "voice-tap" && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-300">
                        Voice engine
                      </span>
                      <button
                        onClick={() =>
                          setVoiceParsingMode(
                            voiceParsingMode === "webspeech-haiku"
                              ? "gemini-audio"
                              : "webspeech-haiku",
                          )
                        }
                        className={`px-2 py-1 text-xs rounded ${
                          voiceParsingMode === "gemini-audio"
                            ? "bg-blue-600 text-white"
                            : "bg-slate-600 text-slate-300"
                        }`}
                      >
                        {voiceParsingMode === "gemini-audio"
                          ? "Gemini Audio"
                          : "Browser + AI"}
                      </button>
                    </div>
                  )}

                  {/* Auto-submit */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-300">Auto-submit</span>
                    <button
                      onClick={() => setAutoSubmitEnabled(!autoSubmitEnabled)}
                      role="switch"
                      aria-checked={autoSubmitEnabled}
                      className={`relative w-9 h-5 rounded-full transition-colors ${
                        autoSubmitEnabled ? "bg-purple-500" : "bg-slate-600"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                          autoSubmitEnabled
                            ? "translate-x-4"
                            : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Clock */}
            {timeControl && (
              <ChessClock
                whiteTimeMs={whiteTimeMs}
                blackTimeMs={blackTimeMs}
                turn={turn}
                isActive={isGameActive}
                playerColor={orientation}
              />
            )}

            {/* Turn / status indicator */}
            {!timeControl && (
              <div
                className={`text-sm font-medium ${
                  isGameOver
                    ? "text-slate-400"
                    : isMyTurn
                      ? "text-purple-400"
                      : "text-slate-400"
                }`}
              >
                {isGameOver
                  ? "Game over"
                  : isMyTurn
                    ? "Your turn"
                    : "Opponent's turn"}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Game over banner */}
      {isGameOver && (
        <div
          className={`px-4 py-3 text-center ${
            winner === playerColor
              ? "bg-green-900/40"
              : winner === null
                ? "bg-yellow-900/40"
                : "bg-red-900/40"
          }`}
        >
          <p
            className={`text-lg font-bold ${
              winner === playerColor
                ? "text-green-300"
                : winner === null
                  ? "text-yellow-300"
                  : "text-red-300"
            }`}
          >
            {resultText}
          </p>
          <div className="flex gap-3 justify-center mt-2">
            <button
              onClick={() => {
                reset();
                router.push("/play");
              }}
              className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm rounded-lg"
            >
              Play Again
            </button>
            <button
              onClick={handleExit}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg"
            >
              Back to Lobby
            </button>
          </div>
        </div>
      )}

      {/* Draw offer banner */}
      {drawOfferedToMe && !isGameOver && (
        <div className="bg-yellow-900/30 border-b border-yellow-700 px-4 py-2 text-center">
          <p className="text-sm text-yellow-300 mb-2">
            Your opponent offers a draw
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => handleRespondDraw(true)}
              className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg"
            >
              Accept
            </button>
            <button
              onClick={() => handleRespondDraw(false)}
              className="px-4 py-1.5 bg-slate-600 hover:bg-slate-700 text-slate-200 text-sm rounded-lg"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="bg-red-900/30 border-b border-red-700 px-4 py-2 text-center">
          <p className="text-sm text-red-400">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-2 underline text-xs"
            >
              dismiss
            </button>
          </p>
        </div>
      )}

      {/* Main content: Board + Controls */}
      <div className="flex-1 flex flex-col lg:flex-row items-center lg:items-start justify-center gap-4 p-3 lg:p-6">
        {/* Board */}
        <div className="flex-shrink-0">
          <ChessBoard
            fen={fen}
            orientation={orientation}
            lastMove={
              lastMove ? { from: lastMove.from, to: lastMove.to } : undefined
            }
            highlightSquares={highlightSquares}
          />
          {/* Move count */}
          <div className="text-center text-xs text-slate-500 mt-2">
            Move {moveCount} {isCheck && "— Check!"}
          </div>
        </div>

        {/* Controls panel */}
        <div className="w-full lg:w-72 flex flex-col gap-3">
          {/* Move input */}
          <div className="bg-slate-800 rounded-xl p-3 flex-1 min-h-[240px]">
            <UniversalInputPanel
              fen={fen}
              isActive={isMyTurn}
              isSubmitting={isSubmitting || isGameOver}
              inputMode={inputMode}
              voiceParsingMode={voiceParsingMode}
              autoSubmitEnabled={autoSubmitEnabled}
              autoSubmitConfidenceThreshold={0.97}
              aiParseResult={aiParseResult}
              aiParseError={aiParseError}
              isAIParsing={isAIParsing}
              onMoveSubmit={handleMoveSubmit}
              onParseMoveWithText={(text, rawTranscript) => {
                if (gameId) {
                  parseMoveWithAI(gameId, text, rawTranscript);
                }
              }}
              onParseMoveWithAudio={(audioBase64, mimeType) => {
                if (gameId) {
                  parseAudioMoveWithGemini(gameId, audioBase64, mimeType);
                }
              }}
              clearAIParseState={clearAIParseState}
              onHighlightSquares={setHighlightSquares}
            />
          </div>

          {/* Action buttons */}
          {!isGameOver && (
            <div className="flex gap-2">
              <button
                onClick={handleOfferDraw}
                disabled={!!drawOfferedBy}
                className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-all disabled:opacity-50"
              >
                {drawOfferedBy === playerColor ? "Draw offered" : "Offer Draw"}
              </button>
              <button
                onClick={() => setShowResignConfirm(true)}
                className="flex-1 py-2 bg-red-900/50 hover:bg-red-900/70 text-red-300 text-sm rounded-lg transition-all"
              >
                Resign
              </button>
            </div>
          )}

          {/* Move history toggle (mobile) */}
          <button
            onClick={() => setShowMoveHistory(!showMoveHistory)}
            className="lg:hidden py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-all"
          >
            {showMoveHistory ? "Hide Moves" : `Moves (${moves.length})`}
          </button>

          {/* Move history */}
          <div className={`${showMoveHistory ? "block" : "hidden"} lg:block`}>
            <MoveHistory
              moves={moves.map((san, i) => ({
                moveIndex: i,
                expectedMove: san,
                submittedMove: san,
                isCorrect: true,
                timeSpent: 0,
                side: (i % 2 === 0 ? "white" : "black") as "white" | "black",
              }))}
              mode="both-sides"
              playerColor={playerColor}
              variant="compact"
              theme="dark"
              maxHeight="max-h-32"
            />
          </div>
        </div>
      </div>

      {/* Resign confirmation modal */}
      {showResignConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-white mb-2">Resign?</h3>
            <p className="text-slate-400 text-sm mb-4">
              Are you sure you want to resign this game?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResignConfirm(false)}
                className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleResign}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg"
              >
                Resign
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
