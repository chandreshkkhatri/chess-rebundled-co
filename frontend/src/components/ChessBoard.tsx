'use client';

import { Component, ReactNode, useEffect, useRef, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import type { Arrow } from 'react-chessboard';

interface ChessBoardProps {
  fen: string;
  orientation?: 'white' | 'black';
  lastMove?: { from: string; to: string };
  draggable?: boolean;
  onPieceDrop?: (sourceSquare: string, targetSquare: string, piece: string) => boolean;
  highlightSquares?: string[];
  onSquareClick?: (square: string, piece: string | undefined) => void;
  customSquareStyles?: Record<string, any>;
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
        <div className="w-full h-full aspect-square bg-slate-700 rounded-sm flex items-center justify-center">
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
  onPieceDrop,
  highlightSquares,
  onSquareClick,
  customSquareStyles
}: ChessBoardProps) {
  const prevFenRef = useRef<string>(fen);

  // A short audio cue provides feedback when a move is made.
  const playMoveSound = useCallback((isCapture: boolean) => {
    if (typeof window === 'undefined') return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const duration = isCapture ? 0.18 : 0.1;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(isCapture ? 160 : 220, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.onended = () => { void ctx.close().catch(() => {}); };
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (error) {
      console.warn('Audio Context failed to play move sound:', error);
    }
  }, []);

  useEffect(() => {
    // Check if the FEN changed from a previous value (skip initial render sounds)
    if (prevFenRef.current && prevFenRef.current !== fen) {
      // Determine if a capture occurred by counting pieces in FEN
      const prevPieces = (prevFenRef.current.split(" ")[0].match(/[rnbqkp]/gi) || []).length;
      const currentPieces = (fen.split(" ")[0].match(/[rnbqkp]/gi) || []).length;
      const isCapture = currentPieces < prevPieces;

      playMoveSound(isCapture);
    }
    prevFenRef.current = fen;
  }, [fen, playMoveSound]);

  // Convert lastMove to arrows format for react-chessboard
  const arrows: Arrow[] = lastMove
    ? [{ startSquare: lastMove.from, endSquare: lastMove.to, color: 'rgba(255, 170, 0, 0.8)' }]
    : [];

  const highlightStyles: Record<string, any> = {};
  if (highlightSquares) {
    for (const sq of highlightSquares) {
      highlightStyles[sq] = {
        background: 'radial-gradient(circle, rgba(168, 85, 247, 0.6) 20%, transparent 20%)',
        borderRadius: '50%',
      };
    }
  }

  return (
    <ChessBoardErrorBoundary>
      <div className="w-full h-full aspect-square mx-auto">
        <Chessboard
          options={{
            position: fen,
            boardOrientation: orientation,
            allowDragging: draggable,
            arrows,
            // react-chessboard v5 passes a single args object; adapt to the
            // positional signature this component's props document.
            onPieceDrop: onPieceDrop
              ? ({ piece, sourceSquare, targetSquare }: any) =>
                  targetSquare
                    ? onPieceDrop(sourceSquare, targetSquare, piece?.pieceType ?? '')
                    : false
              : undefined,
            onSquareClick: onSquareClick
              ? ({ square, piece }: any) => onSquareClick(square, piece?.pieceType)
              : undefined,
            boardStyle: {
              borderRadius: '4px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            },
            darkSquareStyle: { backgroundColor: '#769656' },
            lightSquareStyle: { backgroundColor: '#eeeed2' },
            squareStyles: {
              ...(lastMove
                ? {
                    [lastMove.from]: { backgroundColor: 'rgba(255, 255, 0, 0.4)' },
                    [lastMove.to]: { backgroundColor: 'rgba(255, 255, 0, 0.4)' },
                  }
                : {}),
              ...highlightStyles,
              ...customSquareStyles,
            },
          }}
        />
      </div>
    </ChessBoardErrorBoundary>
  );
}
