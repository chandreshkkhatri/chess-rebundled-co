# Docker Compose deployment

Run commands from the repository root. Docker Engine and the Compose plugin are
the only host build dependencies; application builds use Node.js 24 and the
project's pinned pnpm version inside multi-stage images.

## Backend deployment (default)

Create the environment files without overwriting any existing configuration:

```bash
cp -n .env.example .env
cp -n backend/.env.example backend/.env
```

Edit `backend/.env` to set Firebase Admin credentials, the Gemini configuration,
and `CLIENT_URL` to the URL of your existing frontend. Keep the Firebase private
key quoted, with escaped `\n` characters as in local configuration. Secrets are
provided to the backend at runtime and excluded from Docker build contexts.

Then build and start the backend stack:

```bash
docker compose up -d --build --wait backend
docker compose ps
curl --fail http://127.0.0.1:3001/health
```

This starts **backend, MongoDB, and Redis only**. The frontend has the `frontend`
profile and is neither built nor started by the default command. A plain
`docker compose up -d --build` also excludes the frontend unless you explicitly
enable its profile.

The backend waits for database health checks. MongoDB and Redis have named data
volumes, restart automatically, and have no host ports. Backend and frontend
images run as the unprivileged `node` user and contain production dependencies.

`/health` is a liveness endpoint after startup; it does not continuously check
cloud providers or database readiness. Firebase Authentication/Firestore and
Gemini are external services and are not provisioned by this Compose stack.

The backend binds to host loopback on port 3001 by default. Point your existing
reverse proxy at `http://127.0.0.1:3001` and enable WebSocket forwarding for
Socket.io. Provide HTTPS at that proxy for browser microphone access. To expose
the backend on another interface or port, edit `BIND_ADDRESS` and `BACKEND_PORT`
in the root `.env` file. `CLIENT_URL` remains the browser's frontend origin.

## Database configuration

Compose supplies internal MongoDB and Redis URLs by default, overriding those
two values in `backend/.env`. This creates a new, initially seeded game database;
it does not import an existing database automatically.

To retain externally managed databases, set `MONGODB_URI` and `REDIS_URL` in the
root `.env` file before starting. Container URLs must use addresses reachable
from inside Docker; `localhost` refers to the container itself. The local
database services still start as dependencies. If those local services are
unwanted, create an environment-specific Compose configuration that removes
both services and their backend `depends_on` entries; changing only the URLs
does not stop them from starting.

Run only one backend container. Multiplayer clock timers, queues, and Socket.io
rooms currently belong to one process; Redis persistence alone does not support
multiple backend workers.

## Optional frontend deployment

Fill in the `NEXT_PUBLIC_FIREBASE_*` settings in the root `.env`, and set
`NEXT_PUBLIC_SOCKET_URL` to the backend URL reachable by the **browser**, such as
`https://api.example.com`. Do not use the Docker service name `backend` there.
Ensure `CLIENT_URL` in `backend/.env` matches the frontend's public origin.

Explicitly enable and build the frontend:

```bash
docker compose --profile frontend up -d --build --wait
```

The frontend listens on host loopback port 3000 by default. Its browser settings
are embedded during the Next.js build: rebuild the frontend after changing any
`NEXT_PUBLIC_*` values. Server credentials must never be placed in these build
arguments. Its image uses Next.js standalone output and includes the static
assets, PWA worker, and blog content.

## Updates and operations

After updating the checkout, rebuild the backend without starting the frontend:

```bash
docker compose up -d --build --wait backend
docker compose logs --tail=100 -f backend
```

Useful commands:

```bash
docker compose restart backend
docker compose stop backend
docker compose down
```

`down` preserves the named volumes. Back up MongoDB before changing its image
version or moving environments. Removing volumes deletes the stored game data
and sessions, so ordinary deployment/update commands do not remove them.

If you enabled the frontend profile, use `docker compose --profile frontend down`
when stopping the entire stack.

To inspect the default and optional service sets without starting anything:

```bash
docker compose config --services
docker compose --profile frontend config --services
```

## Build-only validation

These commands build images without deploying the application:

```bash
docker compose build backend
docker compose --profile frontend build frontend
```

The image builds use the frozen root pnpm lockfile. Development dependencies are
used in build stages; the backend runtime copies production dependencies and the
frontend runtime uses Next.js standalone output.

## Legacy deployment paths

The root `pnpm deploy:backend` script still invokes
[deploy-backend.sh](../scripts/deploy-backend.sh), an SSH/PM2 deployment helper.
The [production](../.github/workflows/deploy-backend.yml) and
[development](../.github/workflows/deploy-backend-dev.yml) GitHub workflows also
remain SSH/PM2 paths. They are not Compose commands and have not been migrated
automatically. The VM setup scripts still refer to Node.js 20 and these older
paths run npm installs, so do not use them as the current Node.js/pnpm setup
instructions. Use the Compose procedure above for the new deployment mechanism.
