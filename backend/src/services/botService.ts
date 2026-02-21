import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';

export type BotDifficulty = 'easy' | 'medium' | 'hard';

export interface BotConfig {
  skillLevel: number;
  depth: number;
  moveTime?: number;
}

const DIFFICULTY_MAP: Record<BotDifficulty, BotConfig> = {
  easy: { skillLevel: 0, depth: 5, moveTime: 1000 },
  medium: { skillLevel: 10, depth: 10, moveTime: 2000 },
  hard: { skillLevel: 20, depth: 15, moveTime: 3000 },
};

export class BotService {
  private static instance: BotService;
  private enginePath: string;

  private constructor() {
    // Resolve path to the stockfish binary installed via npm
    this.enginePath = path.resolve(process.cwd(), 'node_modules/.bin/stockfish');
  }

  public static getInstance(): BotService {
    if (!BotService.instance) {
      BotService.instance = new BotService();
    }
    return BotService.instance;
  }

  /**
   * Spawns a new Stockfish process, calculates the best move for the given FEN
   * at the specified difficulty, and returns the move in SAN or LAN format.
   * 
   * Note: This implementation creates a short-lived process per move to avoid
   * managing a pool of stateful engines. For higher throughput, a pool would be better.
   */
  public async getBestMove(fen: string, difficulty: BotDifficulty): Promise<string> {
    const config = DIFFICULTY_MAP[difficulty];

    return new Promise((resolve, reject) => {
      const engine = spawn(this.enginePath, []);
      let bestMoveStr = '';
      let errorStr = '';

      // Timeout safety (give it max config time + 5s buffer)
      const timeoutMs = (config.moveTime || 5000) + 5000;
      const timeoutId = setTimeout(() => {
        engine.kill();
        reject(new Error(`Stockfish timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      engine.stdout.on('data', (data) => {
        const output = data.toString();
        
        // Stockfish outputs lines, we need to find the one starting with 'bestmove'
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.startsWith('bestmove ')) {
            // format: 'bestmove e2e4 ponder e7e5' or just 'bestmove e2e4'
            const parts = line.split(' ');
            if (parts.length >= 2) {
              bestMoveStr = parts[1]; // e.g. e2e4
              
              // We have our move!
              clearTimeout(timeoutId);
              engine.kill();
              resolve(bestMoveStr);
              return;
            }
          }
        }
      });

      engine.stderr.on('data', (data) => {
        errorStr += data.toString();
      });

      engine.on('error', (err) => {
        clearTimeout(timeoutId);
        reject(new Error(`Failed to start Stockfish process: ${err.message}`));
      });

      engine.on('close', (code) => {
        if (!bestMoveStr) {
          clearTimeout(timeoutId);
          reject(new Error(`Stockfish exited with code ${code} before reporting bestmove. Stderr: ${errorStr}`));
        }
      });

      // Initialize and configure engine
      engine.stdin.write('uci\n');
      engine.stdin.write('isready\n');
      engine.stdin.write(`setoption name Skill Level value ${config.skillLevel}\n`);
      
      // Some engines need this to behave weaker with skill levels
      engine.stdin.write('setoption name UCI_LimitStrength value true\n');
      
      engine.stdin.write(`position fen ${fen}\n`);
      
      if (config.moveTime) {
        engine.stdin.write(`go depth ${config.depth} movetime ${config.moveTime}\n`);
      } else {
        engine.stdin.write(`go depth ${config.depth}\n`);
      }
    });
  }
}

export const botService = BotService.getInstance();
