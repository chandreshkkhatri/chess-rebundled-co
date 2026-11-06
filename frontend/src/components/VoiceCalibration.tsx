'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChessBoard } from './ChessBoard';
import { useVoiceTrainingCapture } from '@/hooks/useVoiceTrainingCapture';
import { refreshGeminiAudioStatus, useGeminiAudioStatus } from '@/lib/speechAvailability';
import { trainingOutcome, trainingPlan, trainingSummary, type TrainingAttempt, type TrainingEngine, type TrainingExercise } from '@/lib/voiceTraining';

export interface VoiceCalibrationData { attempts: TrainingAttempt[] }
interface VoiceCalibrationProps {
  getIdToken: () => Promise<string | null>;
  onComplete: (data: VoiceCalibrationData) => Promise<void>;
  onCancel: () => void;
  saving?: boolean;
  saveError?: string | null;
}
const primary = 'px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed';
const secondary = 'px-4 py-2 rounded-lg border border-slate-600 hover:bg-slate-700 text-slate-200 text-sm disabled:opacity-40 disabled:cursor-not-allowed';
const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function VoiceCalibration({ getIdToken, onComplete, onCancel, saving = false, saveError }: VoiceCalibrationProps) {
  const [exercises, setExercises] = useState<TrainingExercise[]>([]);
  const [saved, setSaved] = useState<TrainingAttempt[]>([]);
  const [attempts, setAttempts] = useState<TrainingAttempt[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [engine, setEngine] = useState<TrainingEngine>('browser');
  const [stage, setStage] = useState<'setup' | 'drill' | 'summary'>('setup');
  const [mode, setMode] = useState<'diagnostic' | 'practice'>('diagnostic');
  const [plan, setPlan] = useState<ReturnType<typeof trainingPlan>>([]);
  const [index, setIndex] = useState(0);
  const [runId, setRunId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const current = stage === 'drill' ? plan[index] : undefined;
  const capture = useVoiceTrainingCapture(engine, current?.exercise.fen ?? startFen, getIdToken);
  const lastKeptResult = useRef<typeof capture.result>(null);
  const geminiStatus = useGeminiAudioStatus();
  const history = useMemo(() => [...saved, ...attempts], [saved, attempts]);
  const summary = useMemo(() => trainingSummary(history, exercises, engine), [history, exercises, engine]);
  const engineName = engine === 'browser' ? 'Browser speech' : 'Gemini audio';
  const busy = capture.phase !== 'idle';
  const cancelCapture = capture.cancel;

  useEffect(() => {
    const controller = new AbortController();
    void refreshGeminiAudioStatus();
    void (async () => {
      try {
        setLoadError(null);
        const token = await getIdToken();
        if (controller.signal.aborted) return;
        if (!token) throw new Error('Please sign in again to start voice training.');
        const response = await fetch(`${process.env.NEXT_PUBLIC_SOCKET_URL || ''}/api/user/voice-training`, {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store',
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load voice training.');
        if (!controller.signal.aborted) { setExercises(data.exercises); setSaved(data.attempts ?? []); }
      } catch (err) {
        if (!controller.signal.aborted) setLoadError(err instanceof Error ? err.message : 'Unable to load voice training.');
      }
    })();
    return () => controller.abort();
  }, [getIdToken, reload]);

  const start = useCallback((nextMode: 'diagnostic' | 'practice') => {
    cancelCapture(); setConfirmed(false);
    const queue = trainingPlan(exercises, history, engine, nextMode);
    if (!queue.length) return;
    setRunId(crypto.randomUUID()); setMode(nextMode); setPlan(queue); setIndex(0); setStage('drill');
  }, [cancelCapture, exercises, history, engine]);

  const advance = () => {
    capture.cancel(); setConfirmed(false);
    if (index + 1 >= plan.length) setStage('summary'); else setIndex(index + 1);
  };
  const keep = (retry: boolean) => {
    if (!capture.result || !current || !confirmed || attempts.length >= 100 || lastKeptResult.current === capture.result) return;
    lastKeptResult.current = capture.result;
    setAttempts(previous => [...previous, {
      id: crypto.randomUUID(), runId, exerciseId: current.exercise.id, engine, phase: mode,
      heard: capture.result!.transcription, parsedMove: capture.result!.move,
      confidence: capture.result!.confidence, latencyMs: capture.result!.latencyMs, timestamp: Date.now(),
    }]);
    if (retry) { capture.cancel(); setConfirmed(false); } else advance();
  };
  const outcome = capture.result && current ? trainingOutcome({ parsedMove: capture.result.move }, current.exercise) : null;
  const allowed = capture.supported && (engine !== 'gemini' || geminiStatus.available !== false);
  const baselineTotal = summary.reduce((sum, row) => sum + row.total, 0);
  const baselineCorrect = summary.reduce((sum, row) => sum + row.correct, 0);

  if (loadError) return <div className="space-y-3">
    <p role="alert" className="text-red-300 text-sm">{loadError}</p>
    <button className={primary} onClick={() => setReload(reload + 1)}>Retry loading</button>{' '}
    <button className={secondary} onClick={onCancel}>Close</button>
  </div>;
  if (!exercises.length) return <div className="space-y-3"><p role="status" className="text-slate-300 text-sm">Loading voice exercises…</p><button className={secondary} onClick={onCancel}>Close</button></div>;

  return <div className="space-y-5">
    {stage !== 'drill' && <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Training speech engine">
        {(['browser', 'gemini'] as const).map(value => <button key={value} disabled={saving} aria-pressed={engine === value}
          className={engine === value ? primary : secondary} onClick={() => { capture.cancel(); setEngine(value); }}>
          {value === 'browser' ? 'Browser speech' : 'Gemini audio'}
        </button>)}
      </div>
      {engine === 'gemini' && <p className="text-xs text-slate-400">Gemini sends each recording to Google for recognition. The app saves transcripts and scores, not audio.</p>}
      {!allowed && <p role="status" className="text-amber-300 text-sm">
        {engine === 'gemini' && geminiStatus.available === false ? geminiStatus.reason : 'This speech engine is not supported in this browser.'} Choose the other engine to continue.
      </p>}
    </>}

    {stage === 'setup' && <div className="space-y-3">
      <p className="text-slate-300 text-sm">Start with {exercises.length} short exercises covering coordinates, pieces, captures, castling, disambiguation, promotions, and check or mate.</p>
      <p className="text-slate-400 text-xs">Speak naturally. Confirm each result only if you said the displayed phrase. Retry a move to check whether a mistake repeats.</p>
      <button disabled={!allowed || saving} className={primary} onClick={() => start('diagnostic')}>Start diagnostic</button>
      {saved.length > 0 && <button className={`${secondary} ml-2`} onClick={() => setStage('summary')}>View saved results</button>}
    </div>}

    {current && <>
      <div className="flex justify-between text-xs text-slate-400">
        <span>{mode === 'diagnostic' ? 'Diagnostic' : 'Targeted practice'} · {engineName}</span><span>{index + 1} / {plan.length}</span>
      </div>
      <progress className="w-full h-2 accent-purple-500" value={index} max={plan.length} aria-label="Exercises completed" />
      <div className="text-center space-y-1">
        <p className="text-purple-300 text-xs uppercase tracking-wide">{current.exercise.categoryLabel}</p>
        <p className="text-2xl font-semibold text-white">{current.exercise.move}</p>
        <p className="text-slate-300">Say: “{current.phrase}”</p>
      </div>
      <div className="w-full max-w-64 mx-auto"><ChessBoard key={current.exercise.id} fen={current.exercise.fen} draggable={false} /></div>
      <p className="text-center text-xs text-slate-500">Position before the move · White to move</p>
      {!capture.result && <div className="text-center space-y-2">
        <button className={primary} disabled={busy || !allowed || attempts.length >= 100} onClick={() => { setConfirmed(false); capture.start(); }}>Record move</button>
        {busy && <button className={`${secondary} ml-2`} onClick={capture.cancel}>Cancel recording</button>}
        {busy && <p role="status" className="text-purple-300 text-sm">{capture.phase === 'listening' ? 'Listening… Say the phrase, then pause.' : 'Recognizing your move…'}</p>}
      </div>}
      {capture.error && <p role="alert" className="text-red-300 text-sm">{capture.error}</p>}
      {capture.result && <div className="rounded-xl bg-slate-900/60 border border-slate-700 p-4 space-y-3">
        <p role="status" className={outcome === 'correct' ? 'text-green-300 font-medium' : 'text-amber-300 font-medium'}>
          {outcome === 'correct' ? 'Correct move recognized' : outcome === 'wrong' ? 'A different move was recognized' : 'No move recognized'}
        </p>
        <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-slate-500">Heard</dt><dd className="text-slate-200 break-words">{capture.result.transcription || 'No speech detected'}</dd>
          <dt className="text-slate-500">Interpreted</dt><dd className="text-slate-200 font-mono">{capture.result.move || 'No move'}</dd>
          <dt className="text-slate-500">Time to result</dt><dd className="text-slate-200">{(capture.result.latencyMs / 1000).toFixed(1)}s</dd>
        </dl>
        <label className="flex gap-2 items-start text-sm text-slate-300"><input type="checkbox" className="mt-1 accent-purple-500" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I said the displayed phrase.</label>
        <div className="flex flex-wrap gap-2">
          <button className={primary} disabled={!confirmed || attempts.length >= 100} onClick={() => keep(false)}>Keep result & next</button>
          <button className={secondary} disabled={!confirmed || attempts.length >= 100} onClick={() => keep(true)}>Keep result & retry</button>
          <button className={secondary} onClick={() => { capture.cancel(); setConfirmed(false); }}>Discard recording</button>
        </div>
      </div>}
      {attempts.length >= 100 && <p role="status" className="text-amber-300 text-sm">This session has 100 observations. Finish and save before starting another.</p>}
      <div className="flex justify-between gap-2">
        <button className={secondary} onClick={advance}>Skip exercise</button>
        <button className={secondary} onClick={() => { capture.cancel(); setStage('summary'); }}>Finish & review</button>
      </div>
    </>}

    {stage === 'summary' && <div className="space-y-4">
      <div><h3 className="text-white font-semibold">{engineName} results</h3>
        <p className="text-sm text-slate-400">Latest diagnostic: {baselineCorrect}/{baselineTotal} correct on the first try. Unattempted exercises remain untested.</p></div>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Voice training results; scroll horizontally for more columns"><table className="w-full text-left text-xs">
        <caption className="text-left text-slate-400 pb-2">First-try diagnostic results are separate from practice. Time includes speaking and recognition. Scroll across to see all columns.</caption>
        <thead className="text-slate-400"><tr>{['Move type', 'First try', 'Wrong / no move', 'Retries', 'Time', 'Practice'].map(label => <th key={label} scope="col" className="p-2 font-medium whitespace-nowrap">{label}</th>)}</tr></thead>
        <tbody>{summary.map(row => <tr key={row.category} className="border-t border-slate-700 text-slate-300">
          <th scope="row" className="p-2 font-medium">{row.label}{row.weak && <span className="block text-amber-300 font-normal">Practice suggested</span>}</th>
          <td className="p-2">{row.total ? `${row.correct}/${row.total}` : 'Untested'}</td>
          <td className="p-2">{row.wrong} / {row.noMove}</td><td className="p-2">{row.retries}</td>
          <td className="p-2">{row.total ? `${(row.averageLatencyMs / 1000).toFixed(1)}s` : '—'}</td>
          <td className="p-2">{row.practiceTotal ? `${row.practiceCorrect}/${row.practiceTotal}` : '—'}</td>
        </tr>)}</tbody>
      </table></div>
      <p className="text-xs text-slate-400">Saving adds hints only for the same confirmed transcription mistake observed at least twice with this engine. One-off mistakes do not become hints. Existing calibration and the other engine’s results are kept.</p>
      <div className="flex flex-wrap gap-2">
        <button className={primary} disabled={saving || !attempts.length} onClick={() => { capture.cancel(); void onComplete({ attempts }); }}>{saving ? 'Saving…' : `Save ${attempts.length} new observations`}</button>
        <button className={secondary} disabled={saving || !allowed || attempts.length >= 100 || !summary.some(row => row.weak)} onClick={() => start('practice')}>Practice weak categories</button>
        <button className={secondary} disabled={saving || !allowed || attempts.length >= 100} onClick={() => start('diagnostic')}>New diagnostic</button>
      </div>
      {saveError && <p role="alert" className="text-red-300 text-sm">{saveError} Your observations are still here; retry saving.</p>}
    </div>}
    {stage !== 'drill' && <button className={secondary} disabled={saving} onClick={() => { capture.cancel(); onCancel(); }}>{attempts.length ? 'Close without saving' : 'Close'}</button>}
  </div>;
}
