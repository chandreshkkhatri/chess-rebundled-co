# Gameplay reliability

## Session ownership and reconnection

Practice allows guests. Signed-in sessions require the original Firebase UID
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

## Socket request boundaries and AI quotas

Practice and multiplayer listeners use `backend/src/lib/socketRequest.ts` to
validate identifiers, string sizes, practice options, clocks, and audio metadata.
Every listener catches asynchronous failures and responds on the mode's existing
error channel. Practice retains signed-in ownership and guest reconnect checks.
Multiplayer text/audio parsing requires membership in an active game before
returning cached results or calling Gemini.

Text cache misses and audio requests share a limit of **1,000 Gemini parses per
UTC day** across practice and multiplayer. Signed-in users are keyed by Firebase
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

`GET /api/user/profile` always includes `gamification`, including XP, level,
streaks, achievements, and completed games. New users and older profiles without
this field receive default gamification data. Existing stored values are
returned unchanged. A signed-out profile page redirects after authentication
resolves without waiting for a profile fetch.

## Verification

Run from the repository root:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Backend regression tests exercise concurrent multiplayer operations, fallen
flags, unauthorized parsing, malformed payloads, async failures, quotas, and the
authenticated profile endpoint. They use local stores, Fastify injection, and
mocked Firebase/Gemini operations; no cloud credentials are required.

Frontend regressions exercise bot replies through component handlers/effects,
signed-out profile navigation, original-position grading for both colors, and
worker message ordering, cancellation, failures, and timeouts. Component tests
use a small hook harness; full browser behavior is a separate integration check.

For live verification, use the services and credentials in [README](../README.md).
Play several moves as each color in bot mode, submit a wrong move in both-side
and one-side practice, visit `/profile` signed out, and check XP/streaks after
signing in. In two browser sessions, confirm multiplayer moves, time expiry,
and reconnection behavior. Run development and production builds sequentially:
both use the same Next.js `.next` directory.
