'use client';

import { useState, useCallback, useMemo } from 'react';
import { Chess } from 'chess.js';

interface MultiplayerVoiceInputProps {
  fen: string;
  isMyTurn: boolean;
  isSubmitting: boolean;
  onMoveSubmit: (move: string) => void;
  disabled: boolean; // Game over or paused
  statusMessage?: string;
}

export function MultiplayerVoiceInput({
  fen,
  isMyTurn,
  isSubmitting,
  onMoveSubmit,
  disabled,
  statusMessage,
}: MultiplayerVoiceInputProps) {
  const [selectedMove, setSelectedMove] = useState<string | null>(null);

  const legalMoves = useMemo(() => {
    try {
      const chess = new Chess(fen);
      return chess.moves();
    } catch {
      return [];
    }
  }, [fen]);

  // Group moves by piece type for the grid
  const movesByPiece = useMemo(() => {
    const groups: Record<string, string[]> = {
      'K': [], // King
      'Q': [], // Queen
      'R': [], // Rook
      'B': [], // Bishop
      'N': [], // Knight
      'P': [], // Pawns
      'O': [], // Castling
    };

    for (const move of legalMoves) {
      if (move === 'O-O' || move === 'O-O-O') {
        groups['O'].push(move);
      } else if (move[0] >= 'A' && move[0] <= 'Z') {
        // Piece move (N, B, R, Q, K)
        const piece = move[0];
        if (groups[piece]) {
          groups[piece].push(move);
        }
      } else {
        // Pawn move (starts with lowercase)
        groups['P'].push(move);
      }
    }

    return groups;
  }, [legalMoves]);

  const handleMoveSelect = useCallback((move: string) => {
    setSelectedMove(move);
  }, []);

  const handleSubmit = useCallback(() => {
    if (selectedMove) {
      onMoveSubmit(selectedMove);
      setSelectedMove(null);
    }
  }, [selectedMove, onMoveSubmit]);

  const handleDirectSubmit = useCallback((move: string) => {
    onMoveSubmit(move);
    setSelectedMove(null);
  }, [onMoveSubmit]);

  // Clear selection when turn changes
  const isInputActive = isMyTurn && !disabled && !isSubmitting;

  if (!isInputActive) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[200px]">
        <div className={`text-center p-4 ${disabled ? 'text-slate-500' : 'text-slate-400'}`}>
          {statusMessage || (
            disabled ? 'Game over' : (
              isSubmitting ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin h-4 w-4 border-2 border-purple-500 border-t-transparent rounded-full"></div>
                  <span>Submitting move...</span>
                </div>
              ) : "Opponent's turn..."
            )
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Status */}
      <div className="text-center text-sm font-medium text-purple-300">
        Your turn — select a move
      </div>

      {/* Move grid */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {Object.entries(movesByPiece).map(([piece, moves]) => {
          if (moves.length === 0) return null;
          const pieceLabel = piece === 'P' ? 'Pawn' : piece === 'O' ? 'Castle' :
            piece === 'K' ? 'King' : piece === 'Q' ? 'Queen' :
            piece === 'R' ? 'Rook' : piece === 'B' ? 'Bishop' : 'Knight';

          return (
            <div key={piece}>
              <div className="text-xs text-slate-500 font-medium mb-1">{pieceLabel}</div>
              <div className="flex flex-wrap gap-1.5">
                {moves.map((move) => (
                  <button
                    key={move}
                    onClick={() => {
                      if (selectedMove === move) {
                        handleSubmit();
                      } else {
                        handleMoveSelect(move);
                      }
                    }}
                    onDoubleClick={() => handleDirectSubmit(move)}
                    className={`px-2.5 py-1.5 text-sm font-mono rounded-md transition-all ${
                      selectedMove === move
                        ? 'bg-purple-500 text-white ring-2 ring-purple-300'
                        : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                    }`}
                  >
                    {move}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Submit button */}
      <div className="flex gap-2">
        {selectedMove && (
          <button
            onClick={() => setSelectedMove(null)}
            className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-all text-sm"
          >
            Clear
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={!selectedMove || isSubmitting}
          className="flex-1 py-2.5 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-lg transition-all disabled:bg-slate-600 disabled:text-slate-400 text-sm"
        >
          {selectedMove ? `Submit ${selectedMove}` : 'Select a move'}
        </button>
      </div>

      <p className="text-xs text-slate-500 text-center">
        Tap to select, tap again or use Submit to confirm
      </p>
    </div>
  );
}
