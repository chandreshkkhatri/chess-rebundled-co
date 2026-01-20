'use client';

import { useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import { useGameStore } from '@/stores/gameStore';
import { ChessBoard } from '@/components/ChessBoard';
import { TimerDisplay } from '@/components/TimerDisplay';
import { ScoreDisplay } from '@/components/ScoreDisplay';
import { VoiceInput } from '@/components/VoiceInput';
import { MoveHistory } from '@/components/MoveHistory';
import { GameResults } from '@/components/GameResults';
import { ReadyScreen } from '@/components/ReadyScreen';

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;

  const { submitMove } = useSocket();
  const {
    isConnected,
    status,
    currentPosition,
    currentTurn,
    myColor,
    selectedGame,
    players,
    reset,
    roomId: storeRoomId,
    currentExpectedMove,
  } = useGameStore();

  // Redirect to lobby if no game is in progress
  useEffect(() => {
    const validStatuses = ['ready', 'countdown', 'playing', 'finished'];
    if (isConnected && !validStatuses.includes(status)) {
      router.push('/');
    }
  }, [isConnected, status, router]);

  // Verify we're in the right room
  useEffect(() => {
    if (storeRoomId && storeRoomId !== roomId) {
      router.push(`/game/${storeRoomId}`);
    }
  }, [storeRoomId, roomId, router]);

  const handleMoveSubmit = useCallback(
    (move: string, confidence: number) => {
      submitMove(roomId, move, confidence);
    },
    [roomId, submitMove]
  );

  const handlePlayAgain = useCallback(() => {
    reset();
    router.push('/');
  }, [reset, router]);

  // Render loading state
  if (!isConnected) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-white text-xl">Connecting...</div>
      </main>
    );
  }

  // Redirect to lobby if not in a valid game state
  const validStatuses = ['ready', 'countdown', 'playing', 'finished'];
  if (!validStatuses.includes(status)) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-white text-xl">Redirecting to lobby...</div>
      </main>
    );
  }

  // Render ready/countdown screen
  if (status === 'ready' || status === 'countdown') {
    // If we don't have game data yet (e.g., after refresh), show validating state
    // The rejoin logic will populate this data or redirect to lobby if room doesn't exist
    if (!selectedGame || players.length === 0) {
      return (
        <main className="min-h-screen flex items-center justify-center">
          <div className="text-white text-xl">Validating room...</div>
        </main>
      );
    }
    return <ReadyScreen />;
  }

  // Render game finished state
  if (status === 'finished') {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <GameResults onPlayAgain={handlePlayAgain} />
      </main>
    );
  }

  // Render playing state
  return (
    <main className="min-h-screen p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-slate-800 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  reset();
                  router.push('/');
                }}
                className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
                title="Back to Home"
              >
                <svg
                  className="w-5 h-5 text-slate-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
              </button>
              <div>
                <div className="text-slate-400 text-sm">Now Playing</div>
                <div className="text-white font-bold">{selectedGame?.title}</div>
                <div className="text-slate-500 text-sm">
                  {selectedGame?.white.shortName} vs {selectedGame?.black.shortName} (
                  {selectedGame?.year})
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-slate-400 text-sm">You are</div>
              <div
                className={`text-lg font-bold ${
                  myColor === 'white' ? 'text-white' : 'text-gray-400'
                }`}
              >
                {myColor === 'white' ? '⬜ White' : '⬛ Black'}
              </div>
            </div>
          </div>
        </div>

        {/* Game area */}
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
          {/* Chess board (center on mobile, left-center on desktop) */}
          <div className="flex justify-center lg:flex-1 lg:max-w-lg xl:max-w-xl px-6 lg:px-0">
            <ChessBoard
              fen={currentPosition}
              orientation={myColor || 'white'}
              lastMove={currentExpectedMove ? { from: currentExpectedMove.from, to: currentExpectedMove.to } : undefined}
            />
          </div>

          {/* Sidebar content */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-4 lg:w-72 xl:w-80">
            {/* Timer and Score - side by side on mobile, stacked on desktop */}
            <div className="flex flex-row sm:flex-col gap-4 flex-1">
              <div className="flex-1">
                <TimerDisplay />
              </div>
              <div className="flex-1">
                <ScoreDisplay />
              </div>
            </div>

            {/* Voice input and move history */}
            <div className="flex flex-col gap-4 flex-1">
              <VoiceInput onMoveSubmit={handleMoveSubmit} />
              <MoveHistory />
            </div>
          </div>
        </div>

        {/* Turn indicator */}
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2">
          <div
            className={`px-6 py-3 rounded-full font-bold text-lg shadow-lg ${
              currentTurn === myColor
                ? 'bg-green-500 text-white animate-pulse'
                : 'bg-gray-700 text-gray-300'
            }`}
          >
            {currentTurn === myColor ? "🎤 Your turn - speak your move!" : "Opponent's turn..."}
          </div>
        </div>
      </div>
    </main>
  );
}
