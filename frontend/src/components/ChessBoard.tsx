'use client';

import { Component, ReactNode } from 'react';
import { Chessboard } from 'react-chessboard';
import type { Arrow } from 'react-chessboard';

interface ChessBoardProps {
  fen: string;
  orientation?: 'white' | 'black';
  lastMove?: { from: string; to: string };
  draggable?: boolean;
  onPieceDrop?: (sourceSquare: string, targetSquare: string, piece: string) => boolean;
}

// Error boundary to catch invalid FEN or other rendering errors
interface ErrorBoundaryState {
  hasError: boolean;
}

class ChessBoardErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('[ChessBoard] Render error:', error.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full aspect-square bg-slate-700 rounded flex items-center justify-center">
          <div className="text-center text-slate-400 p-4">
            <p className="text-sm">Unable to display board</p>
            <p className="text-xs mt-1">Invalid position data</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function ChessBoard({ 
  fen, 
  orientation = 'white', 
  lastMove,
  draggable = false,
  onPieceDrop
}: ChessBoardProps) {
  // Convert lastMove to arrows format for react-chessboard
  const arrows: Arrow[] = lastMove
    ? [{ startSquare: lastMove.from, endSquare: lastMove.to, color: 'rgba(255, 170, 0, 0.8)' }]
    : [];

  return (
    <ChessBoardErrorBoundary>
      <div className="w-full h-full aspect-square mx-auto">
        <Chessboard
          options={{
            position: fen,
            boardOrientation: orientation,
            allowDragging: draggable,
            arrows,
            onPieceDrop: onPieceDrop as any,
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
    </ChessBoardErrorBoundary>
  );
}
