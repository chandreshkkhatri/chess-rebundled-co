'use client';

import { useMemo, useRef, useEffect } from 'react';
import { PracticeMoveResult, PracticeMode } from '@/types';

interface MoveDisplay {
  expectedMove: string;
  submittedMove: string;
  isCorrect: boolean;
}

interface MovePair {
  moveNumber: number;
  whiteMove?: MoveDisplay;
  blackMove?: MoveDisplay;
}

interface MoveHistoryProps {
  moves: PracticeMoveResult[];
  mode: PracticeMode;
  playerColor: 'white' | 'black' | null;
  variant?: 'compact' | 'full';
  theme?: 'dark' | 'light';
  maxHeight?: string;
  autoScroll?: boolean;
  className?: string;
}

function groupMovesIntoPairs(moves: PracticeMoveResult[]): MovePair[] {
  const pairsMap = new Map<number, MovePair>();

  for (const move of moves) {
    const moveNumber = Math.floor(move.moveIndex / 2) + 1;

    let pair = pairsMap.get(moveNumber);
    if (!pair) {
      pair = { moveNumber };
      pairsMap.set(moveNumber, pair);
    }

    const display: MoveDisplay = {
      expectedMove: move.expectedMove,
      submittedMove: move.submittedMove,
      isCorrect: move.isCorrect,
    };

    if (move.side === 'white') {
      pair.whiteMove = display;
    } else {
      pair.blackMove = display;
    }
  }

  return Array.from(pairsMap.values()).sort((a, b) => a.moveNumber - b.moveNumber);
}

function MoveCell({
  move,
  placeholder,
  variant,
  theme,
}: {
  move?: MoveDisplay;
  placeholder?: string;
  variant: 'compact' | 'full';
  theme: 'dark' | 'light';
}) {
  const textSize = variant === 'compact' ? 'text-xs' : 'text-sm';
  const isDark = theme === 'dark';

  // Placeholder for opponent moves in one-side mode
  if (!move && placeholder) {
    return (
      <span className={`flex-1 min-w-0 ${textSize} ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>
        {placeholder}
      </span>
    );
  }

  // Empty cell (game ended before this move)
  if (!move) {
    return <span className="flex-1 min-w-0" />;
  }

  if (move.isCorrect) {
    return (
      <span className={`flex-1 min-w-0 ${textSize} ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>
        {move.expectedMove}
        <span className={`ml-1 ${isDark ? 'text-green-400' : 'text-green-600'}`}>&#10003;</span>
      </span>
    );
  }

  // Incorrect move
  return (
    <span className={`flex-1 min-w-0 ${textSize}`}>
      <span className={`line-through ${isDark ? 'text-red-400' : 'text-red-600'}`}>
        {move.submittedMove}
      </span>
      <span className={`ml-1 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
        ({move.expectedMove})
      </span>
    </span>
  );
}

export function MoveHistory({
  moves,
  mode,
  playerColor,
  variant = 'compact',
  theme = 'dark',
  maxHeight,
  autoScroll = true,
  className = '',
}: MoveHistoryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pairs = useMemo(() => groupMovesIntoPairs(moves), [moves]);

  // Auto-scroll to bottom when moves change
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [moves.length, autoScroll]);

  const isDark = theme === 'dark';
  const textSize = variant === 'compact' ? 'text-xs' : 'text-sm';
  const padding = variant === 'compact' ? 'py-0.5 px-1' : 'py-1 px-2';
  const spacing = variant === 'compact' ? 'space-y-0.5' : 'space-y-1';

  if (moves.length === 0) {
    return (
      <p className={`${textSize} italic ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
        No moves yet
      </p>
    );
  }

  const showWhitePlaceholder = mode === 'one-side' && playerColor === 'black';
  const showBlackPlaceholder = mode === 'one-side' && playerColor === 'white';

  return (
    <div
      ref={containerRef}
      className={`overflow-y-auto ${maxHeight || ''} ${className}`}
    >
      <div className={spacing}>
        {pairs.map((pair) => {
          const hasIncorrect =
            (pair.whiteMove && !pair.whiteMove.isCorrect) ||
            (pair.blackMove && !pair.blackMove.isCorrect);

          return (
            <div
              key={pair.moveNumber}
              className={`flex items-center font-mono rounded border-l-2 ${padding} ${
                isDark ? 'bg-slate-700/30' : 'bg-gray-50'
              } ${
                hasIncorrect
                  ? isDark
                    ? 'border-red-500/50'
                    : 'border-red-400/50'
                  : isDark
                    ? 'border-green-500/50'
                    : 'border-green-400/50'
              }`}
            >
              {/* Move number */}
              <span
                className={`flex-shrink-0 w-6 ${textSize} ${
                  isDark ? 'text-slate-500' : 'text-gray-500'
                }`}
              >
                {pair.moveNumber}.
              </span>

              {/* White move */}
              <MoveCell
                move={pair.whiteMove}
                placeholder={showWhitePlaceholder ? '...' : undefined}
                variant={variant}
                theme={theme}
              />

              {/* Black move */}
              <MoveCell
                move={pair.blackMove}
                placeholder={showBlackPlaceholder ? '...' : undefined}
                variant={variant}
                theme={theme}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
