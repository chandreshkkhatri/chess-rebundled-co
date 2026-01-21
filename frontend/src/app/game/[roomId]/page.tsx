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

  const handleHome = useCallback(() => {
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
      <main className="min-h-screen flex items-center justify-center p-2">
        <GameResults onPlayAgain={handlePlayAgain} />
      </main>
    );
  }

  // Render playing state - COMPACT LAYOUT
  return (
    <main className="min-h-screen p-2">
      <div className="max-w-6xl mx-auto">
        {/* Compact Header */}
        <div className="bg-slate-800 rounded-lg p-2 mb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={handleHome}
                className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 transition-colors"
                title="Back to Home"
              >
                <svg
                  className="w-4 h-4 text-slate-300"
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
                <div className="text-white font-medium text-sm">{selectedGame?.title}</div>
                <div className="text-slate-500 text-xs">
                  {selectedGame?.white.shortName} vs {selectedGame?.black.shortName}
                </div>
              </div>
            </div>
            <div
              className={`text-sm font-bold px-2 py-1 rounded ${
                myColor === 'white' ? 'bg-white text-slate-800' : 'bg-slate-600 text-white'
              }`}
            >
              {myColor === 'white' ? '⬜ White' : '⬛ Black'}
            </div>
          </div>
        </div>

        {/* Game area - compact gaps */}
        <div className="flex flex-col lg:flex-row gap-2">
          {/* Chess board */}
          <div className="flex justify-center lg:flex-1 lg:max-w-lg xl:max-w-xl">
            <ChessBoard
              fen={currentPosition}
              orientation={myColor || 'white'}
              lastMove={currentExpectedMove ? { from: currentExpectedMove.from, to: currentExpectedMove.to } : undefined}
            />
          </div>

          {/* Sidebar - Voice Input FIRST */}
          <div className="flex flex-col gap-2 lg:w-72 xl:w-80">
            {/* Voice Input - PROMINENT, FIRST */}
            <VoiceInput onMoveSubmit={handleMoveSubmit} />

            {/* Timer and Score - side by side */}
            <div className="flex gap-2">
              <div className="flex-1">
                <TimerDisplay />
              </div>
              <div className="flex-1">
                <ScoreDisplay />
              </div>
            </div>

            {/* Move History */}
            <MoveHistory />
          </div>
        </div>
      </div>
    </main>
  );
}
