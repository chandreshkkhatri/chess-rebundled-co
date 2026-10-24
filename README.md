# Chess Rebundled

Learn chess notation through speech practice with historical games and
conversational Gemini opponents. The player/game database supports choosing a
historical player or game to study. Text and tap input, multiplayer, and a
coordinate trainer support that core workflow.

## Documentation

Start with the [documentation index](docs/README.md).

- [Features and routes](docs/FEATURES.md)
- [Architecture and data storage](docs/ARCHITECTURE.md)
- [Environment configuration](docs/CONFIGURATION.md)
- [Docker Compose deployment](docs/DEPLOYMENT.md)
- [Dependencies and verification](docs/DEPENDENCIES.md)
- [Gameplay reliability and limits](docs/RELIABILITY.md)

## Local development

### Requirements

- Node.js 24 LTS recommended; the Node.js 22.13+ line is also supported.
- pnpm 10.18.1, pinned in [package.json](package.json).
- MongoDB for the historical game catalog.
- Firebase Authentication and Firestore, with a backend Admin service account.
- A Gemini API key or the supported Vertex AI configuration for AI modes.
- Redis is optional locally; without it, active session state uses process memory.

If using nvm, run `nvm install` and `nvm use` to select [.nvmrc](.nvmrc).
Install dependencies from the repository root:

```bash
corepack enable
pnpm install --frozen-lockfile
```

Use pnpm consistently. If `npm install` failed with
`Cannot read properties of null (reading 'matches')`, follow the
[installation recovery instructions](docs/DEPENDENCIES.md#installation-recovery).

Create local environment files without overwriting existing ones:

```bash
cp -n backend/.env.example backend/.env
cp -n frontend/.env.example frontend/.env.local
```

Fill in Firebase and Gemini settings. For separate local servers, use
`MONGODB_URI=mongodb://localhost:27017/chess-rebundled` in `backend/.env` and
`NEXT_PUBLIC_SOCKET_URL=http://localhost:3001` in `frontend/.env.local`.
See [configuration](docs/CONFIGURATION.md) for all environment variables and
Vertex AI alternatives. MongoDB, Firebase, and Gemini credentials are not
provisioned by `pnpm install`.

With MongoDB available, start both development servers:

```bash
pnpm dev
```

Open <http://localhost:3000>. The backend listens on port 3001 by default.
The practice setup, online multiplayer, conversational AI games, and saved
profile/history pages require sign-in. The practice socket protocol also supports
guest sessions with a per-tab reconnect credential. Enable your chosen
email/password, Google, or GitHub provider in Firebase Authentication.

### Checks

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Tests use local fixtures and mocked cloud operations. Live microphone, Firebase,
Gemini, MongoDB, and Redis behavior needs a configured environment. Lint runs
ESLint directly; development and production builds use Webpack for the existing
PWA integration. Stop the development server before building because both use
the frontend's `.next` directory.

`pnpm start` starts the compiled backend only. The frontend's
`pnpm --filter frontend start` script starts Next.js from a local build; the
Docker image uses the generated standalone server instead.

## Docker deployment

Docker Compose runs **backend, MongoDB, and Redis by default**. The frontend is
optional and requires the explicit `frontend` profile.

After preparing environment files and credentials as described in the
[deployment guide](docs/DEPLOYMENT.md):

```bash
docker compose up -d --build --wait backend
```

The backend binds to `127.0.0.1:3001` by default, databases have no host ports,
and named volumes preserve their data. This stack uses its own database unless
you configure external database URLs in the root `.env`. Use one backend
container; multiplayer rooms, clocks, and mutation queues are process-local.
The legacy SSH/PM2 scripts and GitHub deployment workflows are separate paths;
adding Compose does not migrate an existing deployment.

## Playing and practicing

| Route | Purpose |
| --- | --- |
| `/practice` | Choose a historical game, random game, or player and a practice side. |
| `/practice/[sessionId]` | Follow historical moves with voice, text, or staged selection. |
| `/play` | Human matchmaking and private invitations. |
| `/play/[gameId]` | An authenticated multiplayer game with optional clocks. |
| `/bot` | Standalone browser Stockfish; accessible directly, outside the online lobby. |
| `/play-ai` | Choose a conversational Gemini opponent and color. |
| `/play-ai/[gameId]/review` | Review a completed AI game. |
| `/trainer` | Thirty-second square recognition exercises. |
| `/profile`, `/history`, `/settings` | Practice statistics, completed sessions, and speech/input preferences. |
| `/blog` | Articles from local MDX content. |

In historical practice, the expected answer is the move played in that game.
A different legal move can receive engine feedback while still counting as a
missed historical move. Say "knight f3", "echo four", "bishop takes d5", or
"castle kingside"; typed and tap input remain available when voice processing
is unavailable or quota-limited.

An empty MongoDB catalog is seeded with five games: The Immortal Game, The Opera
Game, The Game of the Century, Kasparov vs Topalov, and the Evergreen Game.
Additional PGN imports are available through the backend scripts described in
[architecture](docs/ARCHITECTURE.md#game-catalog-and-content).

## Repository layout

```text
frontend/       Next.js application, components, hooks, stores, and browser assets
backend/        Fastify routes, Socket.io handlers, services, data, and scripts
docs/           Setup, deployment, feature, architecture, and reliability guides
scripts/        Legacy VM deployment helpers and ElevenLabs narration utilities
compose.yaml    Default backend stack and optional frontend profile
pnpm-lock.yaml  Shared dependency lockfile for the workspace
```
