'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const generateRoomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleCreateRoom = () => {
    if (!playerName.trim()) {
      alert('Please enter your name');
      return;
    }
    const code = generateRoomCode();
    router.push(`/game/${code}?name=${encodeURIComponent(playerName)}`);
  };

  const handleJoinRoom = () => {
    if (!playerName.trim()) {
      alert('Please enter your name');
      return;
    }
    if (!roomCode.trim()) {
      alert('Please enter a room code');
      return;
    }
    router.push(`/game/${roomCode.toUpperCase()}?name=${encodeURIComponent(playerName)}`);
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            ♟️ Chess Rebundled
          </h1>
          <p className="text-slate-400">
            Test your chess memory with famous historical games
          </p>
        </div>

        {/* Main card */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          {/* Name input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your Name
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              maxLength={20}
            />
          </div>

          {/* Create/Join toggle */}
          <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setIsCreating(true)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                isCreating
                  ? 'bg-white shadow text-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Create Room
            </button>
            <button
              onClick={() => setIsCreating(false)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                !isCreating
                  ? 'bg-white shadow text-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Join Room
            </button>
          </div>

          {isCreating ? (
            /* Create room section */
            <button
              onClick={handleCreateRoom}
              className="w-full py-3 px-6 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-lg transition-all"
            >
              Create New Room
            </button>
          ) : (
            /* Join room section */
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Room Code
                </label>
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="Enter 6-digit code"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-mono text-center text-xl tracking-wider uppercase"
                  maxLength={6}
                />
              </div>
              <button
                onClick={handleJoinRoom}
                className="w-full py-3 px-6 bg-green-500 hover:bg-green-600 text-white font-bold rounded-lg transition-all"
              >
                Join Room
              </button>
            </div>
          )}
        </div>

        {/* How to play */}
        <div className="mt-8 text-center text-slate-400 text-sm">
          <h3 className="font-semibold mb-2">How to Play</h3>
          <ol className="space-y-1 text-left max-w-xs mx-auto">
            <li>1. Create or join a room with a friend</li>
            <li>2. Select a famous chess game to replay</li>
            <li>3. Speak the moves before time runs out</li>
            <li>4. Score points for correct moves!</li>
          </ol>
        </div>
      </div>
    </main>
  );
}
