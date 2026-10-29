# Gameplay reliability

## Session ownership and reconnection

The practice protocol supports guests; the setup page requires sign-in. Signed-in sessions require the original Firebase UID
for resume, move submission, abandonment, and voice parsing. New guest sessions
use a random per-tab credential carried in the socket handshake; only its hash
is stored on the backend. The credential survives reconnects and authentication
token updates through session storage. If that storage is unavailable, it lasts
only for the page load. Legacy guest sessions without a credential are limited
to their original socket and must restart after disconnecting.

Multiplayer and conversational AI games require sign-in. The AI game page
rejoins its room and reloads authoritative state whenever its connection is
restored, including a disconnect during the opponent's thinking phase. Stored
SAN history is replayed for multiplayer/AI threefold-repetition detection.
Missing AI games clear the current game identity before returning to setup,
while retaining the connection and opponent preference. Review requests are
retried after reconnecting and when the review URL changes. Errors offer a retry.

## Bot turns and engine requests

The bot page derives whose turn it is from chess.js. A change to the position
starts one engine request regardless of the UI's thinking indicator. Cancelling
the effect aborts that request, and late results cannot change another position.
Human inputs are accepted only on the human player's turn.

`frontend/src/lib/stockfishClient.ts` owns the Stockfish worker's message handler.
Requests wait for the UCI readiness handshake and run sequentially. Cancelling an
active search sends `stop` and drains its `bestmove` before starting the next
request. Cancelling queued work removes it without contacting the engine.
Worker errors, unmounting, and a 30-second startup/search timeout reject pending
requests and terminate the worker. Reload the page to initialize a failed engine
again. `useStockfish` provides the React lifecycle and stable search callbacks.

## Practice feedback

The displayed board advances when a result arrives. Wrong-move grading therefore
replays the historical SAN moves up to the result's `moveIndex` to reconstruct
the position before submission. It evaluates the expected and submitted moves
from that same position, using the original side to move for centipawn loss.
This also handles one-side practice, where displayed positions skip a ply.
Illegal submissions are identified without an engine comparison. A new result
or leaving the page cancels the previous analysis and suppresses stale feedback.

## Practice and AI mutations

Practice submit/resume/abandon requests share a queue per session. Browser move
submissions include the expected move index; stale requests cannot advance the
next historical turn. Completion history and aggregate totals commit in one
Firestore transaction. An existing saved session makes repeated saves a no-op,
so one completed session cannot increment totals twice. User preferences and
legacy profile fields remain intact.

AI player moves, chat writes, resignation, and bot state commits share a queue
per game. Bot generation runs outside that queue so chat and resignation remain
available. The bot rechecks the position and completed status before committing;
a late generated result cannot revive a resigned game. AI game starts are also
serialized per user within the backend process. These queues are process-local;
the deployment still requires one backend instance.

## Microphone recovery and calibration

After silence or the maximum recording duration, audio monitoring resumes even
if the audio was too short or quiet to send. Stop/unmount invalidates pending
permission prompts, recorder events, and audio reads; late callbacks cannot send
input for an abandoned position. Recording chooses a supported format, including
MP4 for browsers that provide it, rather than assuming WAV recording support.

Practice, multiplayer, and AI parsing share the Firestore calibration cache.
Successful saves replace cached empty or older patterns immediately. An older
in-flight read cannot replace newly saved data. Cached text parses are scoped
to the user and calibration revision, so calibration updates also invalidate
old interpretations.

## Socket request boundaries and AI quotas

Practice and multiplayer listeners use `backend/src/lib/socketRequest.ts` to
validate identifiers, string sizes, practice options, clocks, and audio metadata.
Every listener catches asynchronous failures and responds on the mode's existing
error channel. Practice retains signed-in ownership and guest reconnect checks.
Multiplayer text/audio parsing requires membership in an active game before
returning cached results or calling Gemini. Conversational AI parsing requires
the original UID, the player's turn, and the exact current FEN. Requests carry
an ID; both server and browser reject results for superseded positions. Browser
parse state clears on disconnect, turn/position changes, and a 15-second timeout.
Parsing does not make a move; normal server move validation still applies.

Text cache misses and audio requests share a limit of **1,000 Gemini parses per
UTC day** across practice, multiplayer, and conversational AI move input. Signed-in users are keyed by Firebase
UID. Guests are keyed by a SHA-256 hash of the socket peer's IP, so replacing a
guest reconnect token does not reset the allowance. Cached text results do not
consume quota. Typed moves remain available when voice quota is exhausted.

Redis increments and counter expiry use one atomic Lua operation. If that Redis
operation fails, the AI request is denied. When Redis is unavailable, local
counters expire after 26 hours and reset on backend restart. The guest limit
uses the actual socket peer address; behind a reverse proxy, guest connections
may share its allowance. Untrusted forwarded-IP headers are not used.

## Conversational AI allowances

Conversational AI games have separate UTC-day counters: up to 10 game starts and
400 LLM calls per signed-in user. Bot turns, chat-only replies, and generated
farewells can consume the LLM allowance. Bot turns can use a legal-move fallback
when generation is unavailable. These limits are independent of the 1,000 voice
parses described above.

## Multiplayer mutations and clocks

All mutations of an existing multiplayer game run through a per-game queue:
joins, moves, ticks, resignations, draws, disconnects, reconnects, abandonment,
and cleanup. Independent games can continue concurrently, and failed operations
release their queue entry. A clock tick cannot overwrite a player move, and two
requests based on the same turn cannot both be accepted.

Elapsed time is charged before accepting a move or terminal action. If the
active player's time has reached zero, the server persists and broadcasts a
timeout without applying the move or increment. Disconnecting charges elapsed
time before pausing the clock.

The queue, Socket.io rooms, and clock timers assume **one backend process**.
Redis session persistence does not make multiplayer safe to distribute across
multiple workers. Multiple backend workers require coordinated game ownership,
distributed state transitions, and a Socket.io adapter.

## Profile contract and authentication

`GET /api/user/profile` returns identity, practice statistics, and preferences.
New users receive zeroed statistics and default preferences. The removed
`gamification` payload is no longer returned. Legacy reward fields already in
Firestore are left intact; completed sessions update only aggregate statistics
and preserve calibration/preferences. Saved move history uses the completed
results, including the final submitted move. A signed-out profile page redirects
after authentication resolves without waiting for a profile fetch.

## Verification

Run from the repository root:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Backend regression tests exercise concurrent multiplayer operations, fallen
flags, unauthorized parsing, malformed payloads, async failures, quotas, the
authenticated profile endpoint, concurrent AI/practice requests, duplicate
completion saves, immediate calibration updates, and complete saved practice
history without mutating legacy reward data. They use local stores, Fastify injection, and
mocked Firebase/Gemini operations; no cloud credentials are required. AI opponent
regressions cover legal structured decisions, rejected provider settings, retry
allowances, request cancellation, quiet fallback behavior, queued chat, move
emission before conversation, interrupted-turn recovery, and review ownership.
Live move/reconnect payloads are checked for hidden-summary leakage. Gemini audio
health pauses the engine after three provider failures in a row and the public
status endpoint hides provider error details. Text parse
payloads accept up to five recognizer guesses; the Gemini request lists them and
can only answer with one of the position's legal moves or nothing.

Frontend regressions exercise bot replies through component handlers/effects,
signed-out profile navigation, online matchmaking/invitation controls without
bot setup, original-position grading for both colors, and worker message
ordering, cancellation, failures, and timeouts. Additional regressions exercise
quiet AI play, optional conversation, fallback notices/recovery, structured review,
microphone noise/max-duration recovery, late permission/read cancellation,
MP4 recording, AI missing-game/review recovery, and correlated voice results.
A spoken-move corpus checks that common ways of saying moves match the legal
move confidently, that b/d and incomplete speech stay unconfident, and that the
speech hook forwards every recognizer guess and never commits an interim result
that may be the start of a longer move.
Component tests use a small hook harness; full browser behavior is a separate integration check.

For live verification, use the services and credentials in [README](../README.md).
Play several moves as each color in bot mode, submit a wrong move in both-side
and one-side practice, visit `/profile` signed out, and check accuracy, session
totals, and the final saved move after signing in. Confirm the historical player
list is available in practice setup and the online lobby offers only matchmaking
and invitations. In two browser sessions, confirm multiplayer moves, time expiry,
and reconnection behavior. Run development and production builds sequentially:
both use the same Next.js `.next` directory.

On 2026-10-24, the new opponent request code was also verified against the
production Gemini model using disposable opening and developed positions,
without creating or modifying user games. Both returned legal moves and
structured decision summaries; separate chat and farewell requests succeeded.
The provider requires an HTTP deadline of at least ten seconds; shorter local
chat/retry deadlines are enforced by cancellation instead. This provider check
is separate from automated tests and does not establish a measured Elo rating.

The production frontend was checked in Chrome at desktop and mobile widths
against a disposable local Socket.IO fixture. Checks covered quiet setup,
opening/closing conversation, the thinking indicator, absence of live summaries,
fallback status and recovery, structured review, and horizontal overflow. This
browser check used fixture game data; authenticated production gameplay was not
part of it. A mobile grid overflow found during the check was corrected before
the final build.
