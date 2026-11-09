# Speech recognition audit

Audited on 2026-11-06 against `e6d9a61`, following the report that Chrome
recognized spoken **d4** as **Nf3** in both browser-speech and Gemini-audio use.
The recent hardening improved cancellation, permissions, calibration caching,
and game recovery, but left several accuracy problems in the capture and parsing
paths. The changes below are local fixes; deployment is a separate step.

## Findings and corrections

| Priority | Finding | Correction |
| --- | --- | --- |
| High | Even with explicit no-guess instructions, the combined audio/chess prompt returned e4 at 0.9 confidence for generated digital silence. Chess context allowed the model to invent both a transcription and a matching move. | Transcribe in a separate request without FEN, legal moves, calibration substitutions, or worked chess examples. Only detected words reach the calibrated text parser. Both stages share the existing 12-second audio deadline. |
| High | Practice inherited `allowGuessOnUnclear: true`. The text prompt explicitly suggested common chess patterns, so an unclear utterance could become an unrelated legal opening move. Multiplayer and AI games already opted out. | Both parsers now default to abstention. Prompts forbid replacing spoken moves with popular moves, and require empty results for noise, silence, or incomplete input. |
| High | Browser recognition submitted interim hypotheses after 300 ms using hard-coded local confidence. A final corrected transcript could then be ignored. | Interim results only update previews. Final results are processed once, including multiple changed results in one event. Stop/unmount discards pending results. |
| High | Local parsing and Gemini each scheduled their own auto-submission. A local answer could commit before contextual parsing or calibration finished. | Clear final phonetic matches use only the local path; uncertain matches use only contextual parsing. Both paths share one auto-submit effect. Competing browser alternatives or model alternatives require manual confirmation. |
| High | Audio recording began only after a volume threshold was crossed. Initial consonants could be lost. Clips under 3,000 bytes were discarded, although compressed commands can be smaller. The 400 ms silence cutoff could split file/rank phrases. | Recording starts before speech detection. Whole containers rotate during idle silence, and detected speech gets its own maximum-duration window. RMS waveform amplitude replaces average spectral magnitude. At least 120 ms of detected signal is required, without a codec-dependent byte minimum; trailing silence is 700 ms. |
| Medium | Local parsing failed on `bee four`, `see four`, `e4.`, `Nf3`, source/destination phrases, and promotion speech. Every b/d file was treated as ambiguous, including explicit NATO words, and an illegal d-file move could be replaced with a b-file move. | Normalize spoken coordinates and punctuation, preserve SAN case, handle promotion suffixes and castling variants, and resolve omitted capture/disambiguation details only against unique legal candidates. No automatic b/d substitution. |
| Medium | The hook requested three speech alternatives but read only the first. | Consider final alternatives and recover a unique legal interpretation. Disagreement blocks automatic submission, even if Gemini later reports high confidence. |
| Medium | Model JSON was cast directly to application types. Illegal moves survived at low confidence; malformed confidence and alternatives were not consistently checked. | Shared validation canonicalizes legal SAN, rejects illegal moves, validates finite numeric confidence, filters/deduplicates alternatives, and rejects contradictions with an explicit SAN transcript. Actual alternatives cap confidence at 0.7. |
| Medium | A JSGF grammar was described as improving accuracy, but modern recognition services ignore `SpeechGrammarList`. | Remove that misleading integration. See [MDN's grammar documentation](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/grammars). |
| Medium | Browser start/stop callbacks changed identity whenever listening changed. The panel's mode-switch effect depended on stop, so ordinary listening transitions could clear a selection. | Stable callbacks use lifecycle refs. |

During integration with newer speech changes, the final-only lifecycle was
combined with phonetic legal-move matching, forwarding all recognizer guesses,
the legal-move response schema, and the voice-engine toggle. Gemini availability
accounting distinguishes provider/malformed-response failures from successful
transcriptions with no speech.

Relevant implementation:
[browser hook](../frontend/src/hooks/useVoiceRecognition.ts),
[audio hook](../frontend/src/hooks/useGeminiVoice.ts),
[local parser](../frontend/src/lib/voiceParser.ts),
[shared input panel](../frontend/src/components/UniversalInputPanel.tsx),
[text inference](../backend/src/services/aiMoveParser.ts),
[audio inference](../backend/src/services/geminiAudioParser.ts), and
[result validation](../backend/src/lib/validateParsedMove.ts).

## Evidence and limits

The ten labeled opening transcripts in `frontend/tests/speechAccuracy.test.cjs`
produce the correct notation in **4/10 cases before** and **10/10 after** the
changes. Correct results at the local 0.85 threshold improve from 2/10 to 10/10.
These are selected regression cases, not an acoustic benchmark or an estimate of
real-world accuracy. Additional cases cover promotions, castling, captures,
ambiguous pieces, final corrections, conflicting alternatives, and the panel's
submission policy. Audio tests cover short compressed commands, pauses, idle
rotation, speech near a rotation deadline, and resource cancellation. Backend
tests explicitly reject a result of Nf3 when the supplied transcript is d4.

Two user-authorized 12-second microphone recordings were captured through the
host PulseAudio/PipeWire source, then tested after explicit consent to upload to
Google Gemini. The user clarified that they **did not speak**. These recordings
are noise controls, not labeled spoken moves. The source was unmuted at 43%
volume (-21.91 dB); initial activation included a clipped transient, followed by
low-level noise. This is not evidence of a faulty microphone or low speech gain.

The configured model during the live audit was `gemini-3.5-flash-lite`:

| Experiment | Observed result |
| --- | --- |
| Combined audio/chess prompt, digital silence | Invented e4, confidence 0.9, eligible for auto-submit. |
| Combined prompt, three segments of the first noise recording | Invented Nf3, e4, and f3; Nf3 met the auto-submit threshold. These were initially labeled with intended phrases before the user clarified they had not spoken. |
| Separate transcription, digital silence and four views of the second noise recording | Returned no move in all five evaluations; zero automatic submissions. Overlapping segments and their full recording are not independent samples. |
| Separate transcription, synthetic d four / delta four / knight f three WAV and d four at 24 kbps WebM Opus | 3/4 correct; low-bitrate d four was transcribed G4 and wrongly accepted as g4. |
| Synthetic d four and delta four at 128 kbps WebM Opus, plus a repeated d four WAV trial | All three returned d4. Recording now requests 128 kbps explicitly. This small test does not prove that bitrate alone caused the earlier error. |
| Gemini 3.5 Flash for both stages, four synthetic commands plus digital silence and recorded noise | 6/6 correct with no wrong auto-submissions, including the 24 kbps command Flash-Lite misheard. Speech cases took approximately 5.1–5.8 seconds. |
| Final configuration: Flash transcription and existing Flash-Lite text interpretation, same six controls | 6/6 correct move outcomes; zero wrong auto-submissions. Four speech cases took approximately 3.3–4.0 seconds. Noise/silence still sometimes received invented non-chess words, which the text stage rejected. |

Audio transcription now defaults independently to `gemini-3.5-flash` through
`GEMINI_TRANSCRIPTION_MODEL`; text interpretation retains the existing
`GEMINI_MODEL`. This targets the measured acoustic weakness without changing
the model for chat, game analysis, or other text tasks. It adds a provider call
for detected speech and uses a stronger model; evaluate quota/cost and latency
with the replay runner. Google documents audio input support for
[Gemini 3.5 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash).

Synthetic speech used local libflite, not the user's voice. These are smoke tests,
not an accent/voice accuracy benchmark. No real spoken sample was captured.
Recordings, synthetic controls, and reports stay outside the repository under
`/tmp/chess-speech-*`. The same pipeline can still consistently mishear a short
utterance, as the low-bitrate control demonstrated.

Calibration currently stores transcript confusions and inserts them into Gemini
prompts. It does not train an acoustic recognizer or alter Chrome's recognizer.
Browser recognition is fixed to `en-US`. The displayed confidence values are
heuristics or model estimates, not measured probabilities. A model can still
mishear audio consistently in both its transcription and selected move; legal
move checks alone cannot detect that.

The 0.02 RMS threshold, 120 ms signal minimum, 700 ms silence gap, browser locale,
and audio processing constraints need evaluation with labeled recordings before
claiming an accuracy improvement for a particular microphone or accent.
Practice and multiplayer also lack the AI game's FEN/request-ID correlation for
parse responses; delayed results after a position change remain a follow-up
reliability concern.

## Replaying labeled samples

The developer runner calls the same production text/audio parsers, with the
models/provider configured in `backend/.env`, without creating games or changing
user statistics. Cloud calls use provider quota/billing. It does not load a
user's Firestore calibration automatically. Use a separate recording per move,
and include silence/noise controls with an empty expected move. Explicitly
authorize any voice recordings sent to the configured provider.

Save a manifest outside the repo; audio paths resolve relative to the manifest:

```json
[
  { "label": "literal d4", "expectedMove": "d4", "transcript": "d4" },
  { "label": "spoken d4", "expectedMove": "d4", "audioFile": "d4.wav", "mimeType": "audio/wav" },
  { "label": "silence", "expectedMove": "", "audioFile": "silence.wav", "mimeType": "audio/wav" }
]
```

An omitted `fen` uses the initial chess position. For castling, captures,
disambiguation and promotions, provide a FEN where the expected move is legal.

```bash
pnpm --filter backend exec node --import tsx src/scripts/auditSpeech.ts \
  /tmp/speech-samples.json /tmp/speech-report.json
```

The JSON report includes both models, transcription, chosen move, alternatives,
confidence, latency, correct/wrong/abstained counts, and wrong answers that would
auto-submit at the default 0.85 threshold. Inspect parser errors separately from
acoustic abstentions. Repeat the same labeled recordings across model/settings
changes; a low wrong-auto-submission rate matters more than always returning a
move. Compare bare letters and NATO phrases using each speaker's recordings.

For browser speech, test in Chrome and retain all final transcript alternatives
alongside the expected move. The browser engine cannot be faithfully benchmarked
by supplying text fixtures or by replaying a WAV through the Gemini parser.

For model comparisons, override `GEMINI_TRANSCRIPTION_MODEL` for audio and
`GEMINI_MODEL` for text interpretation explicitly. Avoid changing both when
trying to isolate an acoustic problem.

## Latency

Added on 2026-11-09. In the replay runner, the final configuration above took
about 3.3–4.0 seconds per spoken move. A player also waits for the silence gap
and the upload. Where the time goes, from the end of speech:

1. The recorder waits for 700 ms of quiet. Kept: shorter gaps split file/rank
   phrases.
2. Upload. Recording previously ran continuously and rotated containers every
   8 seconds of silence, so a move said after a pause uploaded that pause as
   well (128 kbps: up to ~170 KB of base64). The recorder now hears the
   microphone through a 300 ms delay and starts when speech is detected, so a
   clip holds 300 ms before the speech, the speech, and 400 ms after it. This
   also removes the rotation gap in which the start of a move could be lost.
3. Transcription (`GEMINI_TRANSCRIPTION_MODEL`, Gemini 3.5 Flash).
4. Interpretation (`GEMINI_MODEL`). Skipped when the transcription is literal
   legal SAN and the speaker's calibration does not name those words as another
   move: `validateParsedMove` would only accept that same move from it.

Each Gemini call logs one line with its model, duration and token counts:

```bash
docker compose logs backend | grep "timing"
# [Gemini Audio Parser] transcription timing {"model":"gemini-3.5-flash","ms":…,"thoughtTokens":…,"outputTokens":…,"inputTokens":…}
# [AI Parser] timing {"model":"gemini-3.1-flash-lite","ms":…,"thoughtTokens":…,"outputTokens":…,"inputTokens":…}
```

`thoughtTokens` shows how much of a call was thinking. Thinking is generated
before the answer, so it usually dominates a slow call; transcription and
choosing from a short list need little of it. Both calls take a thinking level
from `GEMINI_TRANSCRIPTION_THINKING_LEVEL` and `GEMINI_MOVE_PARSER_THINKING_LEVEL`
(unset keeps the model's own). These are unchanged by default because no
labeled recordings of real speech have been replayed with them yet. To compare,
replay the same labeled samples once per setting:

```bash
pnpm --filter backend exec node --import tsx src/scripts/auditSpeech.ts \
  /tmp/speech-samples.json /tmp/speech-default.json
GEMINI_TRANSCRIPTION_THINKING_LEVEL=minimal pnpm --filter backend exec \
  node --import tsx src/scripts/auditSpeech.ts /tmp/speech-samples.json /tmp/speech-minimal.json
```

Reports record the thinking settings, per-sample `timing` (transcription and
interpretation milliseconds, transcription thinking tokens) and the median
latency. Adopt a lower level only if `wrong` and `wrongAutoSubmissions` do not
rise. The same applies to trying `gemini-3.5-flash-lite` for transcription now
that recording uses 128 kbps, which was the configuration Flash-Lite misheard.
The panel shows end-of-speech-to-answer time beside each Gemini result, for
checking a setting on a real device and network.
