'use client';

import { useGameStore } from '@/stores/gameStore';

interface GameSelectorProps {
  onSelectGame: (gameId: string) => void;
  onStartGame: () => void;
}

export function GameSelector({ onSelectGame, onStartGame }: GameSelectorProps) {
  const { availableGames, selectedGame, players, myPlayerId } = useGameStore();

  const isHost = players[0]?.id === myPlayerId;
  const canStart = selectedGame && players.length === 2;

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-bold mb-4">Select a Famous Game</h2>

      <div className="space-y-3">
        {availableGames.map((game) => (
          <button
            key={game.id}
            onClick={() => onSelectGame(game.id)}
            className={`
              w-full p-4 rounded-lg border-2 text-left transition-all
              ${
                selectedGame?.id === game.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }
            `}
          >
            <div className="font-bold">{game.title}</div>
            <div className="text-sm text-gray-600">
              {game.white.shortName} vs {game.black.shortName} ({game.year})
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {game.event} • {game.moves.length} moves •{' '}
              <span
                className={`
                  ${game.difficulty === 'beginner' ? 'text-green-600' : ''}
                  ${game.difficulty === 'intermediate' ? 'text-yellow-600' : ''}
                  ${game.difficulty === 'advanced' ? 'text-red-600' : ''}
                `}
              >
                {game.difficulty}
              </span>
            </div>
          </button>
        ))}
      </div>

      {isHost && (
        <button
          onClick={onStartGame}
          disabled={!canStart}
          className={`
            mt-6 w-full py-3 px-6 rounded-lg font-bold text-white
            transition-all
            ${
              canStart
                ? 'bg-green-500 hover:bg-green-600'
                : 'bg-gray-300 cursor-not-allowed'
            }
          `}
        >
          {!selectedGame
            ? 'Select a game to start'
            : players.length < 2
            ? 'Waiting for opponent...'
            : 'Start Game'}
        </button>
      )}

      {!isHost && (
        <div className="mt-6 text-center text-gray-500">
          Waiting for host to start the game...
        </div>
      )}
    </div>
  );
}
