'use client';

import { useRouter } from 'next/navigation';
import { useGameStore } from '@/stores/gameStore';
import { useSocket } from '@/hooks/useSocket';

export function ReadyScreen() {
  const router = useRouter();
  const {
    roomId,
    selectedGame,
    players,
    myPlayerId,
    readyPlayers,
    status,
    countdownValue,
    reset,
  } = useGameStore();
  const { markReady } = useSocket();

  const amIReady = myPlayerId ? readyPlayers.includes(myPlayerId) : false;

  const handleReady = () => {
    console.log('Ready clicked:');
    console.log('  roomId:', roomId);
    console.log('  status:', status);
    console.log('  myPlayerId:', myPlayerId);
    console.log('  players:', players.map(p => `${p.name}(${p.id})`).join(', '));
    if (roomId) {
      console.log('  Calling markReady with roomId:', roomId);
      markReady(roomId);
    } else {
      console.log('  ERROR: No roomId available!');
    }
  };

  const handleGoHome = () => {
    reset();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      {/* Home button */}
      <button
        onClick={handleGoHome}
        className="absolute top-4 left-4 p-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
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

      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
        {/* Game Info */}
        {selectedGame && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              {selectedGame.title}
            </h2>
            <p className="text-gray-500">
              {selectedGame.event}, {selectedGame.year}
            </p>
          </div>
        )}

        {/* Players */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Players</h3>
          <div className="flex justify-center gap-6">
            {players.map((player) => {
              const isReady = readyPlayers.includes(player.id);
              const isMe = player.id === myPlayerId;
              return (
                <div
                  key={player.id}
                  className={`flex flex-col items-center p-4 rounded-lg ${
                    isMe ? 'bg-blue-50 border-2 border-blue-200' : 'bg-gray-50'
                  }`}
                >
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold mb-2 ${
                      player.color === 'white'
                        ? 'bg-white border-2 border-gray-300 text-gray-700'
                        : 'bg-gray-800 text-white'
                    }`}
                  >
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="font-medium text-gray-800">
                    {player.name}
                    {isMe && <span className="text-blue-500"> (You)</span>}
                  </div>
                  <div className="text-sm text-gray-500 capitalize">
                    {player.color}
                  </div>
                  <div
                    className={`mt-2 px-3 py-1 rounded-full text-sm font-medium ${
                      isReady
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {isReady ? 'Ready!' : 'Waiting...'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Ready/Countdown Section */}
        {status === 'ready' && (
          <div>
            {!amIReady ? (
              <button
                onClick={handleReady}
                className="w-full py-4 px-8 bg-green-500 hover:bg-green-600 text-white text-xl font-bold rounded-xl transition-colors shadow-lg"
              >
                Ready!
              </button>
            ) : (
              <div className="text-gray-600 text-lg">
                Waiting for opponent...
              </div>
            )}
          </div>
        )}

        {status === 'countdown' && countdownValue !== null && (
          <div className="flex flex-col items-center">
            <div className="text-gray-600 mb-2">Game starting in...</div>
            <div className="text-8xl font-bold text-blue-600 animate-pulse">
              {countdownValue}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
