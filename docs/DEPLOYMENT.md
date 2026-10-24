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

Then run the deployment helper from the production checkout. The helper builds
with pnpm inside Docker, waits for health checks, and attempts image rollback
on a failed update:

```bash
bash scripts/deploy-backend.sh
# Equivalent when pnpm is installed on the host:
pnpm deploy:backend
```

For a direct Compose invocation without the helper's rollback handling:

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
bash scripts/deploy-backend.sh
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

## Production CI/CD

The single [GitHub workflow](../.github/workflows/deploy-backend.yml) validates
pull requests into `main`, relevant pushes to `main`, and manual runs. There is
no development deployment workflow. Manual releases must select `main`; other
refs can validate but cannot deploy.

The **Validate** job installs the pinned pnpm version and Node.js from `.nvmrc`,
uses `pnpm install --frozen-lockfile`, runs tests, lint, both TypeScript checks,
and both package builds, tests the deployment helper, validates Compose, and
builds the backend Docker image. This job uses no deployment or cloud secrets.
Frontend compilation is a validation check; it does not deploy the frontend.

The **Deploy production** job runs only after validation succeeds for `main`.
It uses SSH to update `~/deployments/prod/chess-rebundled-co` to the exact tested
commit, rather than deploying whichever commit happens to be newest later.
Push filters include backend/frontend files, root workspace manifests/lockfile,
Node settings, Docker context/Compose files, and deployment scripts/tests.

Production jobs are serialized and an in-progress deployment is never cancelled
by a newer deployment. A VM file lock also serializes checkout updates and
manual helper runs. Pending validation jobs can be replaced by newer commits.
The workflow declares the GitHub `production` environment; configure any desired
environment branch restrictions or approval rules in repository settings.

Configure these repository secrets, or secrets on the `production` environment:

| Secret | Value |
| --- | --- |
| `HOST` | Production VM hostname or IP, reachable on SSH port 22. |
| `USERNAME` | VM user owning the production checkout and able to use Docker. |
| `SSH_KEY` | Private key authorized for that VM user. |
| `SSH_KNOWN_HOSTS` | Verified SSH host-key record matching `HOST`, for example `api.example.com ssh-ed25519 AAAA...`. Obtain/verify the public host key through the VM console or another trusted channel. |

Host-key checking is strict. SSH credentials are written only to temporary
runner files with restricted permissions and removed after the step. Runtime
Firebase/Gemini credentials and database URLs stay in the VM's environment files.
The VM's Git remote must also have permission to fetch this repository.

For a new VM, install Docker Engine with the Compose plugin, Git, and `flock`,
and grant the deployment user access to Docker. The
[Docker Engine installation guide](https://docs.docker.com/engine/install/)
has OS-specific instructions. Then prepare the checkout:

```bash
bash scripts/setup-oracle-vm.sh
```

This clones `main` into the production path if absent and creates missing
example environment files. It does not install Node/PM2, alter firewall rules,
start containers, or replace existing configuration. Edit `.env` and
`backend/.env`, then run the deployment helper on the VM for the first release.
Host Node.js/pnpm is optional; application installs/builds use the Docker stages.

## Updates, failures, and rollback

The helper uses the stable local image tag `chess-rebundled-backend:production`.
A build failure leaves the running backend untouched. Startup waits up to 180
seconds for the backend and database health checks. If startup fails and a prior
Compose backend container exists, the helper retags its immutable image ID and
recreates **only the backend** using that image. A recovered deployment still
returns failure so Actions reports the unsuccessful release. If rollback also
fails, inspect `docker compose ps --all` and the VM's backend logs.

This rollback restores the application image using the current Compose settings
and environment files; it does not roll back database contents, config changes,
or the checkout. A first deployment has no previous image to restore. Deployment
never runs `down`, deletes volumes, prunes images, or starts the frontend.

## Migrating the previous PM2 production deployment

Before enabling the first Compose release:

1. Back up the existing game database and configure root `.env` overrides to
   reach that **same database** from inside Docker. The default Compose volumes
   create a separate catalog; they do not copy the existing player/game data.
   Keep the existing production Redis endpoint where active sessions must survive.
2. Preserve Firebase/Gemini credentials and the correct `CLIENT_URL` in
   `backend/.env`. Confirm `HOST`, `USERNAME`, `SSH_KEY`, and `SSH_KNOWN_HOSTS`.
3. Stop the old `chess-backend` PM2 process once ready to switch, freeing the
   backend port, then run `bash scripts/deploy-backend.sh` on the VM. Check health
   and the existing HTTPS/WebSocket proxy before removing the old PM2 entry.

Migration is an operator step. The workflow does not automatically stop PM2,
move databases, change DNS/firewalls, or deploy the frontend.
