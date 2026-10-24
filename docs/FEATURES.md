# Features and routes

For setup, see the [README](../README.md). Configuration, storage boundaries, and
operational limits are described in [configuration](CONFIGURATION.md),
[architecture](ARCHITECTURE.md), and [reliability](RELIABILITY.md).

## Historical practice

Choose a game, request a random game, or select a historical player at
`/practice`. Practice both sides or only White/Black. New MongoDB catalogs are
seeded with five games; larger catalogs depend on imports performed by the
operator.

The game page shows the board, expected move, move history, progress, and
historical trivia. Answers can use text, staged piece/destination selection,
browser speech recognition, or recorded audio interpreted by Gemini. Board
arrows and legal-destination highlights support move selection. Settings control
input behavior and automatic submission.

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

Guests can practice and reconnect using their per-tab credential. Signed-in
completed sessions are saved for `/history`, including move results, accuracy,
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
signed-in user's Firestore profile. Browser speech and microphone support vary;
use HTTPS or localhost, grant microphone access, and retain text/tap fallback.

Practice and multiplayer Gemini text cache misses and audio requests share the
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

The bot setup in `/play` opens `/bot` with a difficulty and color. Stockfish runs
in a browser worker using assets under `frontend/public/stockfish/`; it is
separate from the conversational Gemini opponent. Human turns support staged
notation input and board dragging.

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
keep play valid. Persona rating labels describe the selected characters, not a
measured matchmaking rating.

The game page resynchronizes after reconnecting. Completed games can be reviewed
at `/play-ai/[gameId]/review`, with moves, chat, thinking text, and generated
commentary. Completed AI games are saved in the user's Firestore `aiGames`
collection so review can outlive session expiry. AI game creation and LLM turns
have separate daily limits from voice parsing.

Sources: [setup](../frontend/src/app/play-ai/page.tsx),
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

Signed-in completed practice sessions update accuracy, move/session totals, XP,
levels, streaks, and achievement unlocks. The profile endpoint includes
`gamification`, using defaults for new or older profiles. The home dashboard
shows loaded profile totals; `/profile` contains progress widgets and
`/history` lists saved practice sessions. Signed-out profile visits redirect to
sign-in after authentication resolves.

Sources: [profile](../frontend/src/app/profile/page.tsx),
[history](../frontend/src/app/history/page.tsx),
[gamification](../backend/src/services/gamificationService.ts),
[Firestore persistence](../backend/src/services/firestoreService.ts).

## Browser-local customization and simulations

These components use local browser state rather than shared competition or
server-authoritative purchases:

- **Cosmetics shop:** skins, sound packs, and badges use local storage. Available
  spending balance is the fetched lifetime XP minus browser-local `chess_spent_xp`;
  purchases do not deduct Firestore XP. Cosmetics are not synchronized across
  devices, and their storage keys are not scoped to a Firebase UID. Purchased
  badges are separate from backend-awarded achievements.
- **League display:** nine generated competitors surround the user's XP. The
  cycle lasts three days; the division is derived from lifetime XP. Promotion and
  demotion zones are display markers, with no server-managed end-of-cycle
  promotion/demotion or real shared leaderboard.
- **Caster panel:** named commentator styles select local reaction templates,
  browser text-to-speech, and generated chat messages. User chat receives scripted
  replies. This panel does not connect to a real stream or call Gemini; it is
  separate from the conversational opponent.

Clearing browser storage resets these local selections and standings. Board
skins and synthesized move sounds propagate through the
`active_cosmetics_changed` browser event.

Sources: [shop](../frontend/src/components/AestheticShop.tsx),
[league](../frontend/src/components/LeagueLeaderboard.tsx),
[caster](../frontend/src/components/AICasterPanel.tsx),
[board](../frontend/src/components/ChessBoard.tsx).

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
