'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { ChessBoard } from './ChessBoard';
import { HistoricalGame, PracticeMoveResult } from '@/types';

interface ReplayPly {
  san: string;
  from: string;
  to: string;
  fenAfter: string;
}

interface PracticeReplayProps {
  game: HistoricalGame;
  moveResults: PracticeMoveResult[];
  initialOrientation?: 'white' | 'black';
  onBack: () => void;
}

// Precomputes every position of the historical game for board replay.
export function buildReplayPlies(moves: string[]): { startFen: string; plies: ReplayPly[] } {
  const chess = new Chess();
  const startFen = chess.fen();
  const plies: ReplayPly[] = [];
  for (const san of moves) {
    try {
      const move = chess.move(san);
      plies.push({ san: move.san, from: move.from, to: move.to, fenAfter: chess.fen() });
    } catch {
      break; // Stop at the first move chess.js cannot apply; earlier positions stay valid.
    }
  }
  return { startFen, plies };
}

// Steps through a finished session's game on the board, marking the moves the player was graded on.
export function PracticeReplay({ game, moveResults, initialOrientation = 'white', onBack }: PracticeReplayProps) {
  const { startFen, plies } = useMemo(() => buildReplayPlies(game.moves), [game.moves]);
  // ply = number of half-moves played; 0 is the starting position.
  const [ply, setPly] = useState(plies.length);
  const [orientation, setOrientation] = useState<'white' | 'black'>(initialOrientation);
  const activeMoveRef = useRef<HTMLButtonElement | null>(null);

  const resultsByIndex = useMemo(() => {
    const map = new Map<number, PracticeMoveResult>();
    for (const result of moveResults) map.set(result.moveIndex, result);
    return map;
  }, [moveResults]);

  const goTo = useCallback((next: number) => {
    setPly(Math.max(0, Math.min(plies.length, next)));
  }, [plies.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'ArrowLeft') goTo(ply - 1);
      else if (event.key === 'ArrowRight') goTo(ply + 1);
      else if (event.key === 'Home') goTo(0);
      else if (event.key === 'End') goTo(plies.length);
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goTo, ply, plies.length]);

  useEffect(() => {
    activeMoveRef.current?.scrollIntoView({ block: 'nearest' });
  }, [ply]);

  const current = ply > 0 ? plies[ply - 1] : null;
  const currentResult = ply > 0 ? resultsByIndex.get(ply - 1) : undefined;
  const fen = current ? current.fenAfter : startFen;

  const rows = useMemo(() => {
    const pairs: { number: number; white?: number; black?: number }[] = [];
    plies.forEach((_, index) => {
      const number = Math.floor(index / 2) + 1;
      if (index % 2 === 0) pairs.push({ number, white: index });
      else pairs[pairs.length - 1].black = index;
    });
    return pairs;
  }, [plies]);

  const renderMove = (index: number | undefined) => {
    if (index === undefined) return <span className="flex-1" />;
    const result = resultsByIndex.get(index);
    const isActive = index === ply - 1;
    return (
      <button
        ref={isActive ? activeMoveRef : undefined}
        onClick={() => goTo(index + 1)}
        className={`flex-1 text-left px-1.5 py-0.5 rounded-sm font-mono text-sm transition-colors ${
          isActive ? 'bg-purple-600 text-white' : 'text-slate-200 hover:bg-slate-700'
        }`}
      >
        {plies[index].san}
        {result && (
          <span className={`ml-1 ${isActive ? 'text-white' : result.isCorrect ? 'text-green-400' : 'text-red-400'}`}>
            {result.isCorrect ? '✓' : '✗'}
          </span>
        )}
      </button>
    );
  };

  const navButton = 'flex-1 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors';
  const topIsWhite = orientation === 'black';

  return (
    <main className="h-dvh flex flex-col p-2 lg:p-4 overflow-hidden">
      <div className="max-w-6xl mx-auto w-full flex flex-col flex-1 min-h-0 gap-2">
        {/* Header */}
        <div className="bg-slate-800 rounded-lg py-1 px-2 flex items-center gap-2">
          <button
            onClick={onBack}
            className="py-1 px-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-sm transition-colors text-sm"
            title="Back to results"
          >
            ←
          </button>
          <div className="flex-1 min-w-0 text-center">
            <div className="text-white text-sm font-semibold truncate">{game.title}</div>
            <div className="text-slate-400 text-xs truncate">
              {game.white.shortName} vs {game.black.shortName} · {game.result}
            </div>
          </div>
          <button
            onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
            className="p-1.5 rounded-sm text-slate-400 hover:text-white transition-colors"
            title="Flip board"
            aria-label="Flip board"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 4v16" />
              <path d="M3 8l4-4 4 4" />
              <path d="M17 20V4" />
              <path d="M21 16l-4 4-4-4" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col lg:flex-row gap-2 lg:gap-4 flex-1 min-h-0">
          {/* Board */}
          <div className="flex justify-center shrink-0 lg:flex-[1.15]">
            <div className="w-full max-w-[min(100%,calc(100dvh-330px))] lg:max-w-[min(70vh,680px)] flex flex-col">
              <div className="px-1 py-1 text-white text-sm font-semibold truncate">
                {topIsWhite ? '♔' : '♚'} {topIsWhite ? game.white.name : game.black.name}
              </div>
              <ChessBoard
                fen={fen}
                orientation={orientation}
                lastMove={current ? { from: current.from, to: current.to } : undefined}
              />
              <div className="px-1 py-1 text-white text-sm font-semibold truncate">
                {topIsWhite ? '♚' : '♔'} {topIsWhite ? game.black.name : game.white.name}
              </div>
            </div>
          </div>

          {/* Controls and moves */}
          <div className="flex flex-col gap-2 flex-1 min-h-0 lg:w-[360px] lg:flex-initial">
            <div className="flex gap-1">
              <button onClick={() => goTo(0)} disabled={ply === 0} className={navButton} aria-label="First move">⏮</button>
              <button onClick={() => goTo(ply - 1)} disabled={ply === 0} className={navButton} aria-label="Previous move">◀</button>
              <button onClick={() => goTo(ply + 1)} disabled={ply === plies.length} className={navButton} aria-label="Next move">▶</button>
              <button onClick={() => goTo(plies.length)} disabled={ply === plies.length} className={navButton} aria-label="Last move">⏭</button>
            </div>

            {/* Current move details */}
            <div className="bg-slate-800 rounded-lg px-2 py-1.5 text-xs min-h-[44px] flex flex-col justify-center">
              {current ? (
                <>
                  <div className="text-slate-300">
                    <span className="text-slate-500">{Math.floor((ply - 1) / 2) + 1}{(ply - 1) % 2 === 0 ? '.' : '...'}</span>{' '}
                    <span className="font-mono font-semibold text-white">{current.san}</span>
                  </div>
                  {currentResult ? (
                    currentResult.isCorrect ? (
                      <div className="text-green-400">✓ You found this move</div>
                    ) : (
                      <div className="text-red-400">
                        ✗ You played <span className="font-mono">{currentResult.submittedMove}</span>
                      </div>
                    )
                  ) : (
                    <div className="text-slate-500">Not practiced</div>
                  )}
                </>
              ) : (
                <div className="text-slate-400">Starting position</div>
              )}
            </div>

            {/* Move list */}
            <div className="bg-slate-800 rounded-lg p-1.5 flex-1 min-h-0 overflow-y-auto overscroll-contain">
              <div className="space-y-0.5">
                {rows.map((row) => (
                  <div key={row.number} className="flex items-center gap-1">
                    <span className="w-7 shrink-0 text-xs text-slate-500 font-mono">{row.number}.</span>
                    {renderMove(row.white)}
                    {renderMove(row.black)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
