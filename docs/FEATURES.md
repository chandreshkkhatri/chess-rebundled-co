# Features and routes

For setup, see the [README](../README.md). Configuration, storage boundaries, and
operational limits are described in [configuration](CONFIGURATION.md),
[architecture](ARCHITECTURE.md), and [reliability](RELIABILITY.md).

## Application focus

The home page highlights speech practice and conversational AI play. Human
multiplayer, the coordinate trainer, and speech/input settings remain available
as secondary links. The online lobby contains only Find Game, Create Invite,
and Join Invite; its bot setup has been removed.

Leagues, XP/levels, daily reward streaks, achievements, cosmetic purchases, and
the scripted caster/chat simulation have been removed. Practice results report
accuracy, correct moves, timings, and move history. The board uses one standard
appearance and a short move/capture sound.

The historical player/game database, player selection, imports, and seeds remain
intact. No data migration or deletion is part of this cleanup. Existing legacy
reward fields in Firestore and old cosmetic browser keys are left in place but
are no longer read, displayed, or updated by reward logic.

## Historical practice

Choose a game, request a random game, or select a historical player at
`/practice`. Practice both sides or only White/Black. New MongoDB catalogs are
seeded with five games; larger catalogs depend on imports performed by the
operator.

The game page shows the board, expected move, move history, progress, and
historical trivia. Answers can use text, staged piece/destination selection,
browser speech recognition, or recorded audio interpreted by Gemini. Board
arrows and legal-destination highlights support move selection. Settings control
input behavior and automatic submission. The board keeps one orientation for the
session (White in both-side mode, the player's color in one-side mode) and has a
manual flip control. Staged options scroll inside the input panel when they do
not fit.

Finished sessions can be replayed on the board from the results screen or from
`/history/[sessionId]`: step through the historical game, flip the board, and
jump to any move. Each practiced move is marked as found or missed.

Correctness means matching the historical move. On an incorrect answer, the
sequence advances along the historical game and the app can compare the
expected move with the submitted legal alternative using browser Stockfish.
Analysis reconstructs the position before submission and scores from the
original side's perspective:

| Loss relative to the expected move | Label |
| --- | --- |
| At least 150 centipawns | Blunder |
| At least 50 centipawns | Mistake |
| At least 20 centipawns | Inaccuracy |
| Below 20 centipawns | Playable alternative |
| Submitted move is illegal | Illegal move; no engine comparison |

These labels compare against the historical move, which is not necessarily the
engine's best move. Stockfish analysis runs through a cancellable request queue;
leaving the page or receiving a new result prevents stale feedback.

The setup page requires sign-in. The practice socket protocol also supports
guest sessions that reconnect using a per-tab credential. Signed-in completed
sessions are saved for `/history`, including move results, accuracy,
and timings. See [session ownership](RELIABILITY.md#session-ownership-and-reconnection).

Sources: [practice setup](../frontend/src/app/practice/page.tsx),
[game page](../frontend/src/app/practice/[sessionId]/page.tsx),
[evaluation](../frontend/src/lib/practiceEvaluation.ts),
[practice service](../backend/src/services/practiceService.ts).

## Voice and notation input

Two stored parsing modes are supported:

- `webspeech-haiku`: the legacy setting name for browser speech recognition with
  local move parsing and Gemini text interpretation when needed. It does not
  select an Anthropic/Haiku service.
- `gemini-audio`: microphone recording submitted to Gemini for transcription and
  move interpretation.

The input panel shows listening/recording feedback and can offer alternative
parses. Voice calibration records speech confusions and stores them in a
signed-in user's Firestore profile. Saved calibration takes effect immediately
in subsequent server parsing requests, including when the prior cache was empty. Browser speech and microphone support vary;
use HTTPS or localhost, grant microphone access, and retain text/tap fallback.

Practice, multiplayer, and conversational AI move parsing share the
[daily parsing allowance](RELIABILITY.md#socket-request-boundaries-and-ai-quotas).

Sources: [input panel](../frontend/src/components/UniversalInputPanel.tsx),
[browser speech](../frontend/src/hooks/useVoiceRecognition.ts),
[audio capture](../frontend/src/hooks/useGeminiVoice.ts),
[calibration](../frontend/src/components/VoiceCalibration.tsx).

## Online multiplayer

At `/play`, signed-in players can join matchmaking or create/join a private
invitation. Matches support untimed play or a time control with increments. Moves
are validated on the server; players can resign or offer/respond to a draw.
Active games support reconnection and a disconnect grace period.

Game mutations and clock ticks are serialized per game in one backend process.
Clock expiry is checked before accepting a move or adding its increment. Stored
SAN history is replayed for repetition detection. This is not a horizontally
scaled multiplayer deployment; see [reliability](RELIABILITY.md#multiplayer-mutations-and-clocks).

Sources: [lobby](../frontend/src/app/play/page.tsx),
[game page](../frontend/src/app/play/[gameId]/page.tsx),
[service](../backend/src/services/multiplayerService.ts).

## Stockfish bot

The standalone `/bot` route remains available by direct URL, with optional
`difficulty=easy|medium|hard|expert` and `color=white|black` query parameters.
There is no bot tab or configuration in `/play`. Stockfish runs in a browser
worker using assets under `frontend/public/stockfish/`; the same engine also
supports practice feedback. Human turns support staged notation input and board
dragging.

| Difficulty | Skill level | Search depth | Move-time limit |
| --- | --- | --- | --- |
| Easy | 0 | 5 | 1 second |
| Medium | 10 | 10 | 2 seconds |
| Hard | 15 | 15 | 3 seconds |
| Expert | 20 | 20 | 5 seconds |

Requests wait for engine readiness. Searches run sequentially and support
cancellation, worker failure handling, and a 30-second timeout. A failed engine
can be initialized again by reloading the page.

Sources: [bot page](../frontend/src/app/bot/page.tsx),
[difficulty configuration](../frontend/src/hooks/useStockfish.ts),
[worker client](../frontend/src/lib/stockfishClient.ts).

## Conversational AI games

Signed-in players choose Rook Rodriguez, Professor Petrova, or Blitz Bogdan at
`/play-ai`, then choose White, Black, or a random color. Gemini generates opponent
moves and conversation; server-side chess validation and legal-move fallbacks
keep play valid. Opponents are described by playing style; the former unmeasured
rating badges are no longer displayed.

The game page uses the shared speech/notation panel, alongside board clicks and
dragging. Input mode, browser speech/Gemini audio selection, and auto-submit
follow the existing speech/input settings. Only the connected player's turn
accepts input; speaking a move does not send a chat message. Chat remains typed.
Unclear speech can be retried or replaced with text/tap input. Parsing uses the
same per-user allowance and calibration as practice, and late responses for an
older position are ignored.

Play is quiet by default. Open the optional conversation panel to send typed
messages; replies are separate from move generation and arrive on the player's
turn. Messages sent while the opponent thinks are queued until after its move.
The opponent does not produce automatic table talk or repeated filler lines.
Quiet games also skip generated farewell messages.

The opponent chooses a legal move and records a concise explanation in the same
structured LLM response: the chosen move's purpose, up to two legal alternatives,
the main threat, and its next positional goal. These summaries stay on the
backend during play. They are generated explanations, not a transcript of the
model's internal reasoning, and are not verified by an engine. Legal move
validation does not guarantee tactical strength.

The game page resynchronizes after reconnecting. Completed games can be reviewed
at `/play-ai/[gameId]/review`, with the board, move timeline, decision summaries,
and any conversation. Earlier saved games retain their legacy notes. Fallback
moves are identified and never receive an invented AI explanation. Completed AI
games are saved in the user's Firestore `aiGames` collection so review can outlive session expiry. AI game creation and LLM turns
have separate daily limits from voice parsing. A provider failure or exhausted
allowance produces a status notice outside chat while a simple chess fallback
keeps the game playable. A successful later LLM move clears the notice.

Move timing includes the actual model request plus a small position-dependent
reading pause. Forced moves have a shorter minimum than positions with checks or
tactical choices. Conversation never adds a delay to playing the selected move.

Sources: [setup](../frontend/src/app/play-ai/page.tsx),
[move input](../frontend/src/hooks/useAiMoveInput.ts),
[AI service](../backend/src/services/aiGameService.ts),
[personas](../backend/src/data/aiPersonas.ts),
[limits](../backend/src/services/aiUsageLimiter.ts).

## Coordinate trainer

`/trainer` offers two 30-second exercises: click the requested square, or name the
highlighted square. Board orientation can be White, Black, or random, with pieces
or an empty board. Name-square exercises support typed/tap answers and browser
speech recognition, including phonetic coordinates. Score, answer streaks, audio
feedback, and the high score are handled in the browser; the high score is stored
under `chess_trainer_highscore` in local storage.

Source: [trainer page](../frontend/src/app/trainer/page.tsx).

## Profiles and progress

Signed-in completed practice sessions update accuracy and move/session totals.
The home dashboard shows accuracy and completed sessions. `/profile` contains
identity editing and practice statistics; `/history` lists saved sessions and
move results, including the final submitted move. The profile API returns stats
and preferences, without the removed `gamification` payload. New users receive
zeroed statistics. A signed-out profile visit redirects after authentication
resolves.

Session saves update only aggregate `stats.*` fields on existing user documents.
Stored preferences, voice calibration, and any legacy reward data are preserved.

Sources: [profile](../frontend/src/app/profile/page.tsx),
[history](../frontend/src/app/history/page.tsx),
[replay](../frontend/src/components/PracticeReplay.tsx),
[Firestore persistence](../backend/src/services/firestoreService.ts).

## PWA and blog

Production Webpack builds generate the PWA service worker and install experience
through `next-pwa`; PWA generation is disabled in development. Installing the app
does not make backend-dependent practice, multiplayer, or Gemini requests work
offline.

Blog posts are local MDX files with metadata and reading-time estimates. The
optional frontend Docker image copies public/static assets and blog content
alongside the standalone Next.js server.

Sources: [Next.js configuration](../frontend/next.config.mjs),
[install prompt](../frontend/src/components/PWAInstallPrompt.tsx),
[blog loader](../frontend/src/lib/mdx.ts).
