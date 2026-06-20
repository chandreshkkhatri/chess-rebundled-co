'use client';

import { Component, ReactNode, useState, useEffect, useRef, useCallback } from 'react';
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
  onPieceDrop,
  highlightSquares,
  onSquareClick,
  customSquareStyles
}: ChessBoardProps) {
  const [boardSkin, setBoardSkin] = useState<string>('forest');
  const [soundPack, setSoundPack] = useState<string>('wood');
  const prevFenRef = useRef<string>(fen);

  const loadCosmetics = () => {
    if (typeof window !== 'undefined') {
      const activeSkin = localStorage.getItem('active_board_skin');
      const activeSound = localStorage.getItem('active_sound_pack');
      if (activeSkin) setBoardSkin(activeSkin);
      if (activeSound) setSoundPack(activeSound);
    }
  };

  useEffect(() => {
    loadCosmetics();
    
    // Listen to changes in cosmetics selection
    window.addEventListener('active_cosmetics_changed', loadCosmetics);
    return () => {
      window.removeEventListener('active_cosmetics_changed', loadCosmetics);
    };
  }, []);

  // Play synthesized audio move sounds based on active sound pack
  const playMoveSound = useCallback((isCapture: boolean) => {
    if (typeof window === "undefined") return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (soundPack === "clicky") {
        // High click sound
        osc.type = "sine";
        osc.frequency.setValueAtTime(isCapture ? 1200 : 1800, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
        
        if (isCapture) {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.type = "sine";
          osc2.frequency.setValueAtTime(1000, ctx.currentTime + 0.06);
          gain2.gain.setValueAtTime(0.06, ctx.currentTime + 0.06);
          gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
          osc2.start(ctx.currentTime + 0.06);
          osc2.stop(ctx.currentTime + 0.12);
        }
      } else if (soundPack === "retro") {
        // Retro arcade beep
        osc.type = "square";
        if (isCapture) {
          osc.frequency.setValueAtTime(500, ctx.currentTime);
          osc.frequency.linearRampToValueAtTime(120, ctx.currentTime + 0.2);
          gain.gain.setValueAtTime(0.05, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
          osc.start();
          osc.stop(ctx.currentTime + 0.2);
        } else {
          osc.frequency.setValueAtTime(330, ctx.currentTime);
          osc.frequency.setValueAtTime(440, ctx.currentTime + 0.06);
          gain.gain.setValueAtTime(0.04, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
          osc.start();
          osc.stop(ctx.currentTime + 0.12);
        }
      } else {
        // Classic wood
        osc.type = "triangle";
        osc.frequency.setValueAtTime(isCapture ? 160 : 220, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);

        if (isCapture) {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.type = "triangle";
          osc2.frequency.setValueAtTime(120, ctx.currentTime + 0.05);
          gain2.gain.setValueAtTime(0.09, ctx.currentTime + 0.05);
          gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
          osc2.start(ctx.currentTime + 0.05);
          osc2.stop(ctx.currentTime + 0.18);
        }
      }
    } catch (e) {
      console.warn("Audio Context failed to play move sound:", e);
    }
  }, [soundPack]);

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

  // Get board skin square colors
  const getSkinColors = () => {
    switch (boardSkin) {
      case 'cyberpunk':
        return { dark: '#312e81', light: '#818cf8' }; // Deep Indigo / Neon Light Indigo
      case 'gold':
        return { dark: '#78350f', light: '#fef3c7' }; // Amber Mahogany / Royal Gold
      case 'glass':
        return { dark: '#1e293b', light: '#334155' }; // Slate-900 / Slate-700
      case 'forest':
      default:
        return { dark: '#769656', light: '#eeeed2' }; // Standard Chess.com Green / Cream
    }
  };

  const colors = getSkinColors();

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
            onPieceDrop: onPieceDrop as any,
            onSquareClick: onSquareClick as any,
            boardStyle: {
              borderRadius: '4px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            },
            darkSquareStyle: { backgroundColor: colors.dark },
            lightSquareStyle: { backgroundColor: colors.light },
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
