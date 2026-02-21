import { spawn } from 'child_process';
import path from 'path';

const enginePath = path.resolve('./node_modules/.bin/stockfish');
const engine = spawn(enginePath, []);

engine.stdout.on('data', (data) => {
  const output = data.toString();
  console.log('Stockfish says:', output);
  if (output.includes('bestmove')) {
    console.log('DONE!');
    engine.kill();
    process.exit(0);
  }
});

engine.stderr.on('data', (data) => {
  console.error('Stockfish error:', data.toString());
});

engine.stdin.write('uci\n');
engine.stdin.write('position startpos\n');
engine.stdin.write('go depth 10\n');
