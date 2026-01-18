'use client';

import { useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import { useGameStore } from '@/stores/gameStore';
import { ChessBoard } from '@/components/ChessBoard';
import { TimerDisplay } from '@/components/TimerDisplay';
import { ScoreDisplay } from '@/components/ScoreDisplay';
import { VoiceInput } from '@/components/VoiceInput';
import { MoveHistory } from '@/components/MoveHistory';
import { GameSelector } from '@/components/GameSelector';
import { GameResults } from '@/components/GameResults';

export default function GamePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const playerName = searchParams.get('name') || 'Player';

  const { joinRoom, selectGame, startGame, submitMove } = useSocket();
  const {
    isConnected,
    status,
    currentPosition,
    currentTurn,
    myColor,
    selectedGame,
    players,
    reset,
  } = useGameStore();

  // Join room on mount
  useEffect(() => {
    if (isConnected && roomId) {
      joinRoom(roomId, playerName);
    }
  }, [isConnected, roomId, playerName, joinRoom]);

  const handleSelectGame = useCallback(
    (gameId: string) => {
      selectGame(roomId, gameId);
    },
    [roomId, selectGame]
  );

  const handleStartGame = useCallback(() => {
    startGame(roomId);
  }, [roomId, startGame]);

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

  // Render waiting/selecting state
  if (status === 'waiting' || status === 'selecting' || status === 'joining') {
    return (
      <main className="min-h-screen p-4">
        <div className="max-w-2xl mx-auto">
          {/* Room info */}
          <div className="bg-slate-800 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-slate-400 text-sm">Room Code</div>
                <div className="text-white text-2xl font-mono font-bold">{roomId}</div>
              </div>
              <div className="text-right">
                <div className="text-slate-400 text-sm">Players</div>
                <div className="text-white">{players.length}/2</div>
              </div>
            </div>
          </div>

          {/* Players list */}
          <div className="bg-white rounded-lg shadow-md p-4 mb-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Players
            </h3>
            <div className="space-y-2">
              {players.map((player) => (
                <div key={player.id} className="flex items-center gap-3">
                  <div
                    className={`w-4 h-4 rounded-full ${
                      player.color === 'white'
                        ? 'bg-white border-2 border-gray-400'
                        : 'bg-gray-800'
                    }`}
                  />
                  <span className="font-medium">{player.name}</span>
                  <span className="text-sm text-gray-500">({player.color})</span>
                </div>
              ))}
              {players.length < 2 && (
                <div className="text-gray-400 italic">Waiting for opponent...</div>
              )}
            </div>
          </div>

          {/* Game selector */}
          {players.length >= 2 && (
            <GameSelector onSelectGame={handleSelectGame} onStartGame={handleStartGame} />
          )}
        </div>
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left sidebar */}
          <div className="space-y-4 order-2 lg:order-1">
            <TimerDisplay />
            <ScoreDisplay />
          </div>

          {/* Chess board (center) */}
          <div className="flex justify-center order-1 lg:order-2">
            <ChessBoard fen={currentPosition} orientation={myColor || 'white'} />
          </div>

          {/* Right sidebar */}
          <div className="space-y-4 order-3">
            <VoiceInput onMoveSubmit={handleMoveSubmit} />
            <MoveHistory />
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
