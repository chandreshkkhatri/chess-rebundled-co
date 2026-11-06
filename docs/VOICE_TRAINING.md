# Voice training and calibration

Open **Settings → Voice Training & Calibration → Start Voice Training**.
The existing calibration dialog now provides a position-aware diagnostic,
targeted practice, and separately saved browser/Gemini observations.

## Diagnostic and practice

Choose **Browser speech** or **Gemini audio**. Engines keep separate scores;
there is no silent fallback during a diagnostic. Unsupported recording or a
Gemini availability failure is shown before continuing. Gemini recordings are
sent to Google for recognition; this app stores transcripts and observations,
not audio recordings.

The diagnostic contains 22 exercises in seven categories:

| Category | Coverage |
| --- | --- |
| Pawns and coordinates | Bare letters, NATO alternatives, source/destination wording, and b/d or c/g confusions. |
| Piece moves | Knight, bishop, rook, queen, and king. |
| Captures | Pawn/piece captures and en passant. |
| Castling | Kingside and queenside, short/long wording. |
| Disambiguation | Which rook or knight, using the origin file. |
| Promotions | Queen promotion and capture underpromotion to a knight. |
| Check and mate | Spoken suffixes and equivalent moves without the suffix. |

Each exercise shows the board before the move, the intended SAN, and a suggested
phrase. Click **Record move**, speak naturally, then pause. The result shows the
actual transcript, interpreted move, and time from starting capture to the
result. Recognition errors, permission problems, and provider timeouts can be
retried; provider failures are not graded as speech mistakes.

Before retaining a result, confirm **I said the displayed phrase**. Choose:

- **Keep result & next** to record the observation and advance.
- **Keep result & retry** to retain a mistake and check whether it repeats.
- **Discard recording** when the recording does not represent the intended phrase.
- **Skip exercise** to leave a category untested; skips do not count as successes.
- **Finish & review** to stop early and inspect the results.

The results table uses the latest diagnostic's **first** observation for each
exercise. Retrying successfully does not replace a failed first try. Wrong
moves, unrecognized moves, retries, and average time are shown separately.
Practice observations have their own score. The table can scroll horizontally
on small screens and supports keyboard focus.

**Practice weak categories** includes categories scoring below 80% or with
untested exercises and switches to alternate phrasing, including NATO names.
You can switch engines on the results screen and run a separate diagnostic.

Choose **Save observations** to persist all new observations from this dialog.
Save failures leave them available for retry. Closing without saving discards
unsaved observations. The dialog permits up to 100 new observations; the profile
retains the newest 200 observations across engines and runs. Previously learned
hints remain until conflicting evidence invalidates them. Saved results can be
viewed when reopening training.

## What calibration learns

Only the same normalized, nonempty transcription mistake observed **at least
twice with the same engine** becomes a full-phrase hint. Correctly recognized
moves and empty/no-speech transcripts do not create hints. A sound observed for
multiple intended phrases cannot become an unambiguous correction. A double
click or repeated save request cannot turn one recording into two observations.

Browser hints and Gemini hints are stored and applied separately. Existing
legacy calibration remains available to both. Saving updates the shared
calibration cache/revision immediately, including the practice/multiplayer parse
cache revision. Practice, multiplayer, conversational AI, and training parse
requests all use the appropriate engine's hints.

These are interpretation hints, not acoustic model retraining. The scores are
personal observations, not guaranteed recognition probabilities. Training does
not change game statistics, rewards, or move history.

## Recognition boundary

The recognition hook knows only the selected engine and FEN. A clear final
browser phonetic match uses the same local matching path as gameplay. Uncertain
browser speech sends actual recognizer guesses for calibrated interpretation.
Gemini uses the same transcription-then-interpretation pipeline as gameplay.

The parse API accepts only the engine, FEN, and actual speech/audio fields.
It rejects `exerciseId`, `expectedMove`, `target`, or other unknown fields. The
expected answer is used only after recognition returns. The provider may see
normal board context and all legal moves when interpreting a transcript, but
never a drill's singled-out expected answer. All catalog positions have more
than one legal move.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/user/voice-training` | Authenticated, uncached exercise catalog and this user's saved observations. |
| `POST /api/user/voice-training/parse` | Authenticated, validated recognition request; cloud parses share the existing 1,000/day user allowance. No result persistence. |
| `POST /api/user/voice-training` | Authenticated save of 1–100 confirmed observations. Validates exercise IDs, legal moves, metadata, and bounds before merging. |

The server derives expected moves and target phrases from its own catalog when
learning. Saves deduplicate observation IDs and serialize per user within the
single supported backend process. The legacy calibration PUT endpoint retains
training metadata. No additional database service or environment variable is
required.

## Implementation and verification

- `backend/src/services/voiceTraining.ts`: authoritative legal positions,
  observation validation, and repeated-pattern learning.
- `backend/src/services/firestoreService.ts`: bounded history, engine hints,
  per-user save serialization, and cache updates.
- `backend/src/routes/userRoutes.ts`: authenticated catalog, parse, and save APIs.
- `frontend/src/lib/voiceTraining.ts`: outcome grading, first-try metrics, and
  targeted practice selection.
- `frontend/src/hooks/useVoiceTrainingCapture.ts`: one recording/request at a
  time, shared speech hooks, timeouts, aborts, and stale-result rejection.
- `frontend/src/components/VoiceCalibration.tsx`: diagnostic, board, confirmation,
  results comparison, and practice flow within Settings.

Run `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`. Regression tests
validate every exercise with chess.js; cover auth, quotas, expected-answer
rejection, learning thresholds, conflicting hints, engine separation, concurrent
saves, retry scoring, cancellation, duplicate clicks, and failed-save recovery.
A Chrome walkthrough with mocked speech/API responses checks recording, a wrong
answer, retry, targeted practice, saving, and mobile layout. It is not a live
microphone accuracy measurement.
