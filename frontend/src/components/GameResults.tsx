'use client';

import { useGameStore } from '@/stores/gameStore';

interface GameResultsProps {
  onPlayAgain: () => void;
}

export function GameResults({ onPlayAgain }: GameResultsProps) {
  const { players, myPlayerId, winnerId, selectedGame, trivia } = useGameStore();

  const myPlayer = players.find((p) => p.id === myPlayerId);
  const opponent = players.find((p) => p.id !== myPlayerId);

  const isWinner = winnerId === myPlayerId;
  const isTie = winnerId === null;

  const formatScore = (score: number) => {
    return (score * 100).toFixed(1);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-md mx-auto">
      {/* Result header */}
      <div className="text-center mb-6">
        {isTie ? (
          <>
            <div className="text-4xl mb-2">🤝</div>
            <h2 className="text-2xl font-bold text-gray-700">It's a Tie!</h2>
          </>
        ) : isWinner ? (
          <>
            <div className="text-4xl mb-2">🏆</div>
            <h2 className="text-2xl font-bold text-green-600">You Won!</h2>
          </>
        ) : (
          <>
            <div className="text-4xl mb-2">😔</div>
            <h2 className="text-2xl font-bold text-gray-600">You Lost</h2>
          </>
        )}
      </div>

      {/* Final scores */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Final Scores</h3>
        <div className="space-y-2">
          {myPlayer && (
            <div className="flex justify-between items-center">
              <span className="font-medium">{myPlayer.name} (You)</span>
              <span className="text-xl font-bold text-blue-600">
                {formatScore(myPlayer.score)}%
              </span>
            </div>
          )}
          {opponent && (
            <div className="flex justify-between items-center">
              <span className="font-medium">{opponent.name}</span>
              <span className="text-xl font-bold text-gray-600">
                {formatScore(opponent.score)}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Trivia */}
      {trivia.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">
            Did You Know? 💡
          </h3>
          <div className="space-y-2">
            {trivia.slice(0, 3).map((fact, index) => (
              <div key={index} className="text-sm text-gray-700 bg-yellow-50 p-3 rounded-lg">
                {fact}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Game info */}
      {selectedGame && (
        <div className="text-center text-sm text-gray-500 mb-6">
          You played: <strong>{selectedGame.title}</strong>
          <br />
          {selectedGame.white.shortName} vs {selectedGame.black.shortName} ({selectedGame.year})
        </div>
      )}

      {/* Play again button */}
      <button
        onClick={onPlayAgain}
        className="w-full py-3 px-6 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-lg transition-all"
      >
        Play Again
      </button>
    </div>
  );
}
