'use client';

interface PracticeProgressBarProps {
  currentMove: number;
  totalMoves: number;
  correctMoves?: number;
}

export function PracticeProgressBar({
  currentMove,
  totalMoves,
  correctMoves,
}: PracticeProgressBarProps) {
  const progress = totalMoves > 0 ? (currentMove / totalMoves) * 100 : 0;
  const accuracy =
    correctMoves !== undefined && currentMove > 0
      ? ((correctMoves / currentMove) * 100).toFixed(0)
      : null;

  return (
    <div className="bg-slate-800 rounded-lg p-3 mb-2">
      <div className="flex justify-between text-xs text-slate-400 mb-2">
        <span>
          Move {currentMove} of {totalMoves}
        </span>
        <span className="flex items-center gap-3">
          {accuracy !== null && (
            <span className="text-green-400">{accuracy}% correct</span>
          )}
          <span>{Math.round(progress)}% complete</span>
        </span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-purple-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
