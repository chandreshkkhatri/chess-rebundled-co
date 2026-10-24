# Project instructions

## Workspace and tools

Use pnpm from the repository root. The root `package.json` pins pnpm 10.18.1,
`.nvmrc` selects Node.js 24, and Node.js 22.13+ on the 22.x line is also supported.
The root `pnpm-lock.yaml` is the workspace's only lockfile.

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm lint
pnpm typecheck
pnpm build

# Target an individual workspace
pnpm --filter frontend build
pnpm --filter backend build
pnpm --filter frontend add <package-name>
pnpm --filter backend add -D <package-name>
```

`pnpm lint` uses ESLint flat config, and `pnpm typecheck` checks both packages.
Next.js development and production builds explicitly use Webpack for `next-pwa`.
Stop the frontend development server before building into the same `.next` path.

## Structure and configuration

- `frontend/`: Next.js 16, React 19, Tailwind CSS 4, Zustand 5, Firebase web SDK.
- `backend/`: Fastify 5, Socket.io, MongoDB, Redis, Firebase Admin, Gemini services.
- `docs/`: [documentation index](docs/README.md), including architecture,
  configuration, dependencies, deployment, and reliability guides.

Backend credentials live in `backend/.env`; native frontend settings normally
live in `frontend/.env.local`. Docker Compose uses the root `.env` for overrides
and optional frontend build arguments. See [configuration](docs/CONFIGURATION.md)
for the exact precedence and browser/backend URL requirements.

## Deployment

The default Compose stack is backend, MongoDB, and Redis. The frontend is
opt-in through the `frontend` profile. Use one backend process; multiplayer's
rooms, clocks, queues, and matchmaking are not distributed.

```bash
docker compose up -d --build --wait backend
```

See [deployment](docs/DEPLOYMENT.md) before running deployment commands. The
existing SSH/PM2 scripts and GitHub workflows are separate legacy paths, not
aliases for this Compose deployment.
