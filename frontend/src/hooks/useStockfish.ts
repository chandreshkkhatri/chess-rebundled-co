import { useState, useEffect, useCallback, useRef } from 'react';

export type BotDifficulty = 'easy' | 'medium' | 'hard';

export interface BotConfig {
  skillLevel: number;
  depth: number;
  moveTime?: number;
}

export const DIFFICULTY_MAP: Record<BotDifficulty, BotConfig> = {
  easy: { skillLevel: 0, depth: 5, moveTime: 1000 },
  medium: { skillLevel: 10, depth: 10, moveTime: 2000 },
  hard: { skillLevel: 20, depth: 15, moveTime: 3000 },
};

export function useStockfish() {
  const [isReady, setIsReady] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  
  // We'll store the resolve function for the currently computing move
  const resolveMoveRef = useRef<((move: string) => void) | null>(null);

  useEffect(() => {
    // Determine the path to the stockfish worker script.
    // In stockfish.js 18+, we usually load a worker script that internalizes WASM loading.
    // We need to copy `stockfish.js` and `stockfish.wasm` to our public directory 
    // We've copied `stockfish.js`, `stockfish.wasm.js`, and `stockfish.wasm` to `public/stockfish/`
    try {
      const worker = new Worker('/stockfish/stockfish.js');
      workerRef.current = worker;

      worker.onmessage = (e) => {
        const msg = e.data;
        // console.log("Stockfish worker says:", msg);

        if (msg === 'uciok') {
          setIsReady(true);
        } else if (msg.startsWith('bestmove ')) {
          const parts = msg.split(' ');
          if (parts.length >= 2) {
            const bestMove = parts[1];
            if (resolveMoveRef.current) {
              resolveMoveRef.current(bestMove);
              resolveMoveRef.current = null;
            }
          }
        }
      };

      worker.postMessage('uci');
      
      return () => {
        worker.terminate();
      };
    } catch (err) {
      console.error("Failed to initialize Stockfish worker:", err);
    }
  }, []);

  const findBestMove = useCallback(
    (fen: string, difficulty: BotDifficulty): Promise<string> => {
      return new Promise((resolve, reject) => {
        const worker = workerRef.current;
        if (!worker || !isReady) {
          reject(new Error('Stockfish is not ready initialized.'));
          return;
        }

        if (resolveMoveRef.current) {
          reject(new Error('Stockfish is already computing a move.'));
          return;
        }

        const config = DIFFICULTY_MAP[difficulty];
        resolveMoveRef.current = resolve;

        // Configure engine
        worker.postMessage('isready');
        worker.postMessage(`setoption name Skill Level value ${config.skillLevel}`);
        worker.postMessage('setoption name UCI_LimitStrength value true');
        worker.postMessage(`position fen ${fen}`);
        
        if (config.moveTime) {
          worker.postMessage(`go depth ${config.depth} movetime ${config.moveTime}`);
        } else {
          worker.postMessage(`go depth ${config.depth}`);
        }
      });
    },
    [isReady]
  );

  return { isReady, findBestMove };
}
