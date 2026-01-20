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
    reset,
    roomId: storeRoomId,
    currentExpectedMove,
  } = useGameStore();

  // Redirect to lobby if no game is in progress
  useEffect(() => {
    if (isConnected && status !== 'playing' && status !== 'finished') {
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

  // Redirect to lobby if not playing
  if (status !== 'playing' && status !== 'finished') {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-white text-xl">Redirecting to lobby...</div>
      </main>
    );
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
            <div>
              <div className="text-slate-400 text-sm">Now Playing</div>
              <div className="text-white font-bold">{selectedGame?.title}</div>
              <div className="text-slate-500 text-sm">
                {selectedGame?.white.shortName} vs {selectedGame?.black.shortName} (
                {selectedGame?.year})
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
