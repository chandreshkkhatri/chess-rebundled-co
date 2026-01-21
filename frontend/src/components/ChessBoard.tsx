'use client';

import { useMemo } from 'react';
import { Chess } from 'chess.js';

interface ChessBoardProps {
  fen: string;
  orientation?: 'white' | 'black';
  lastMove?: { from: string; to: string };
}

const PIECE_UNICODE: Record<string, string> = {
  wK: '♔',
  wQ: '♕',
  wR: '♖',
  wB: '♗',
  wN: '♘',
  wP: '♙',
  bK: '♚',
  bQ: '♛',
  bR: '♜',
  bB: '♝',
  bN: '♞',
  bP: '♟',
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

// O(1) lookup maps instead of indexOf()
const FILE_INDEX: Record<string, number> = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5, g: 6, h: 7 };
const RANK_INDEX: Record<string, number> = { '8': 0, '7': 1, '6': 2, '5': 3, '4': 4, '3': 5, '2': 6, '1': 7 };

export function ChessBoard({ fen, orientation = 'white', lastMove }: ChessBoardProps) {
  const board = useMemo(() => {
    const chess = new Chess(fen);
    return chess.board();
  }, [fen]);

  const files = orientation === 'white' ? FILES : [...FILES].reverse();
  const ranks = orientation === 'white' ? RANKS : [...RANKS].reverse();

  const isHighlighted = (file: string, rank: string) => {
    if (!lastMove) return false;
    const square = file + rank;
    return square === lastMove.from || square === lastMove.to;
  };

  const getPiece = (file: string, rank: string) => {
    const fileIndex = FILE_INDEX[file];
    const rankIndex = RANK_INDEX[rank];
    const piece = board[rankIndex][fileIndex];
    if (!piece) return null;
    const key = piece.color + piece.type.toUpperCase();
    return PIECE_UNICODE[key];
  };

  const isLightSquare = (fileIndex: number, rankIndex: number) => {
    return (fileIndex + rankIndex) % 2 === 0;
  };

  return (
    <div className="relative w-full max-w-[min(100%,512px)]">
      {/* Board container - maintains square aspect ratio */}
      <div className="relative w-full aspect-square">
        {/* Board grid */}
        <div className="absolute inset-0 grid grid-cols-8 grid-rows-8 border-4 border-amber-900 rounded shadow-lg">
          {ranks.map((rank, rankIndex) =>
            files.map((file, fileIndex) => {
              const isLight = isLightSquare(fileIndex, rankIndex);
              const highlighted = isHighlighted(file, rank);
              const piece = getPiece(file, rank);

              return (
                <div
                  key={`${file}${rank}`}
                  className={`
                    flex items-center justify-center
                    select-none
                    transition-colors duration-200
                    ${highlighted ? 'bg-board-highlight' : (isLight ? 'bg-board-light' : 'bg-board-dark')}
                  `}
                >
                  {piece && (
                    <span
                      className={`
                        text-[clamp(1.5rem,8vw,3rem)]
                        ${piece.startsWith('♔') || piece.startsWith('♕') || piece.startsWith('♖') || piece.startsWith('♗') || piece.startsWith('♘') || piece.startsWith('♙') ? 'text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]' : 'text-gray-900'}
                      `}
                    >
                      {piece}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* File labels (bottom) */}
      <div className="flex justify-around mt-1 px-1">
        {files.map((file) => (
          <span key={file} className="text-xs text-slate-400 font-medium">
            {file}
          </span>
        ))}
      </div>

      {/* Rank labels (left side) */}
      <div className="absolute left-0 top-0 h-[calc(100%-1.5rem)] flex flex-col justify-around -ml-4 py-1">
        {ranks.map((rank) => (
          <span key={rank} className="text-xs text-slate-400 font-medium">
            {rank}
          </span>
        ))}
      </div>
    </div>
  );
}
