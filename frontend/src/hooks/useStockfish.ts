import { useState, useEffect, useCallback, useRef } from 'react';
import { StockfishClient } from '@/lib/stockfishClient';

export type BotDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface BotConfig {
  skillLevel: number;
  depth: number;
  moveTime?: number;
}

export const DIFFICULTY_MAP: Record<BotDifficulty, BotConfig> = {
  easy:   { skillLevel: 0,  depth: 5,  moveTime: 1000 },
  medium: { skillLevel: 10, depth: 10, moveTime: 2000 },
  hard:   { skillLevel: 15, depth: 15, moveTime: 3000 },
  expert: { skillLevel: 20, depth: 20, moveTime: 5000 },
};

export function useStockfish() {
  const [isReady, setIsReady] = useState(false);
  const clientRef = useRef<StockfishClient | null>(null);

  useEffect(() => {
    setIsReady(false);
    try {
      const client = new StockfishClient(new Worker('/stockfish/stockfish.js'), setIsReady);
      clientRef.current = client;
      return () => {
        clientRef.current = null;
        client.dispose();
      };
    } catch (error) {
      console.error('Failed to initialize Stockfish worker:', error);
    }
  }, []);

  const findBestMove = useCallback(async (fen: string, difficulty: BotDifficulty, signal?: AbortSignal) => {
    const client = clientRef.current;
    if (!client) throw new Error('Stockfish is unavailable');
    const config = DIFFICULTY_MAP[difficulty];
    if (!config) throw new Error('Invalid bot difficulty');
    return (await client.search({ fen, ...config, signal })).move;
  }, []);

  const evaluatePosition = useCallback(async (fen: string, depth = 10, signal?: AbortSignal) => {
    const client = clientRef.current;
    if (!client) throw new Error('Stockfish is unavailable');
    return (await client.search({ fen, depth, signal })).score;
  }, []);

  return { isReady, findBestMove, evaluatePosition };
}
