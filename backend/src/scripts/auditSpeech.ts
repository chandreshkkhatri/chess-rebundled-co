import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Chess } from 'chess.js';
import { parseChessMoveWithAI } from '../services/aiMoveParser.js';
import { parseChessMoveFromAudio } from '../services/geminiAudioParser.js';
import { GEMINI_MODEL, GEMINI_TRANSCRIPTION_MODEL } from '../lib/genaiClient.js';

interface Sample {
  label: string;
  expectedMove: string;
  fen?: string;
  transcript?: string;
  audioFile?: string;
  mimeType?: string;
}

// Deliberately separate from gameplay: replay labeled samples without affecting
// games or user statistics. Calls the same parsers and uses backend/.env.
async function main() {
  const [manifest, output] = process.argv.slice(2);
  if (!manifest) throw new Error('Usage: pnpm --filter backend exec node --import tsx src/scripts/auditSpeech.ts MANIFEST.json [REPORT.json]');
  const manifestPath = resolve(manifest);
  const samples: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!Array.isArray(samples) || !samples.length) throw new Error('Manifest must contain a nonempty array of labeled samples');
  const rows = [];
  for (const sample of samples as Sample[]) {
    if (!sample || typeof sample.label !== 'string' || typeof sample.expectedMove !== 'string' ||
      (typeof sample.audioFile === 'string') === (typeof sample.transcript === 'string')) {
      throw new Error('Each sample needs label, expectedMove, and exactly one of audioFile or transcript');
    }
    const chess = sample.fen ? new Chess(sample.fen) : new Chess();
    const legalMoves = chess.moves();
    const canonical = (move: string) => move.replace(/[+#]/g, '');
    if (sample.expectedMove && !legalMoves.some(move => canonical(move) === canonical(sample.expectedMove))) {
      throw new Error(`Expected move is not legal for sample: ${sample.label}`);
    }
    let audio: Buffer | undefined;
    if (sample.audioFile) {
      if (!sample.mimeType?.startsWith('audio/')) throw new Error(`Missing audio MIME type: ${sample.label}`);
      audio = await readFile(resolve(dirname(manifestPath), sample.audioFile));
      if (audio.length > 5_000_000) throw new Error(`Audio exceeds 5 MB: ${sample.label}`);
    }
    const started = performance.now();
    const parsed = audio
      ? await parseChessMoveFromAudio(audio.toString('base64'), sample.mimeType!, chess.fen(), legalMoves)
      : await parseChessMoveWithAI(sample.transcript!, chess.fen(), legalMoves);
    const correct = canonical(parsed.move) === canonical(sample.expectedMove);
    rows.push({
      label: sample.label, expectedMove: sample.expectedMove, ...parsed,
      latencyMs: Math.round(performance.now() - started),
      outcome: correct ? 'correct' : parsed.move ? 'wrong' : 'abstained',
      wouldAutoSubmit: !!parsed.move && parsed.confidence >= 0.85 && parsed.alternatives.length === 0,
    });
  }
  const report = {
    model: GEMINI_MODEL, transcriptionModel: GEMINI_TRANSCRIPTION_MODEL,
    recordedAt: new Date().toISOString(), total: rows.length,
    correct: rows.filter(row => row.outcome === 'correct').length,
    wrong: rows.filter(row => row.outcome === 'wrong').length,
    abstained: rows.filter(row => row.outcome === 'abstained').length,
    wrongAutoSubmissions: rows.filter(row => row.outcome === 'wrong' && row.wouldAutoSubmit).length,
    samples: rows,
  };
  const json = JSON.stringify(report, null, 2) + '\n';
  if (output) await writeFile(resolve(output), json);
  process.stdout.write(json);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
