'use client';

import { Chessboard } from 'react-chessboard';
import type { Arrow } from 'react-chessboard';

interface ChessBoardProps {
  fen: string;
  orientation?: 'white' | 'black';
  lastMove?: { from: string; to: string };
}

export function ChessBoard({ fen, orientation = 'white', lastMove }: ChessBoardProps) {
  // Convert lastMove to arrows format for react-chessboard
  const arrows: Arrow[] = lastMove
    ? [{ startSquare: lastMove.from, endSquare: lastMove.to, color: 'rgba(255, 170, 0, 0.8)' }]
    : [];

  return (
    <div className="w-full max-w-[min(100%,480px)] md:max-w-[min(100%,512px)]">
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          allowDragging: false,
          arrows,
          boardStyle: {
            borderRadius: '4px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          },
          darkSquareStyle: { backgroundColor: '#769656' },
          lightSquareStyle: { backgroundColor: '#eeeed2' },
          squareStyles: lastMove
            ? {
                [lastMove.from]: { backgroundColor: 'rgba(255, 255, 0, 0.4)' },
                [lastMove.to]: { backgroundColor: 'rgba(255, 255, 0, 0.4)' },
              }
            : {},
        }}
      />
    </div>
  );
}
