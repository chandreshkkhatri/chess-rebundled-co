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

## Public API HTTPS and browser access

The API hostname must resolve to the intended VM, and Nginx must have a
`server_name` and certificate covering that **exact hostname**. Otherwise Nginx
can serve another site's default certificate, causing
`ERR_CERT_COMMON_NAME_INVALID` for both `/api/*` and Socket.IO. A wildcard such
as `*.rebundled.co` does not cover `api.chess.rebundled.co`.

The current production API is `https://api.chess.rebundled.co`, proxied to
`127.0.0.1:3001`. Its Nginx vhost is
`/etc/nginx/sites-available/chess-api.conf`, enabled through `sites-enabled`.
It forwards WebSocket upgrade headers and uses a Let's Encrypt certificate for
`api.chess.rebundled.co`. The frontend stays hosted separately at
`https://chess.rebundled.co`.

For a **new** Debian/Ubuntu Nginx vhost, after installing Nginx and Certbot's
Nginx plugin, use the [HTTP bootstrap template](../deploy/nginx/chess-api.http-bootstrap.conf).
Back up existing Nginx configuration first, confirm these target files are not
already managing a TLS site, then run:

```bash
sudo install -m 0644 deploy/nginx/chess-api.http-bootstrap.conf /etc/nginx/sites-available/chess-api.conf
sudo ln -s /etc/nginx/sites-available/chess-api.conf /etc/nginx/sites-enabled/chess-api.conf
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx --non-interactive --agree-tos --redirect --cert-name api.chess.rebundled.co -d api.chess.rebundled.co
sudo certbot renew --dry-run --cert-name api.chess.rebundled.co
```

Certbot reuses an existing ACME account; on a new installation, supply your
account email with `--email` when first registering. It adds HTTPS and an HTTP
redirect to the vhost. Keep the resulting Certbot-managed configuration on the
VM rather than reapplying the HTTP bootstrap template. Confirm that the
`certbot.timer` renewal service is active. See the
[Certbot guide](https://eff-certbot.readthedocs.io/en/stable/using.html#nginx) and
[Nginx WebSocket instructions](https://nginx.org/en/docs/http/websocket.html).

A valid certificate is only one browser requirement. Set
`CLIENT_URL=https://chess.rebundled.co` in the VM's `backend/.env`; leaving it as
`http://localhost:3000` makes production HTTP responses fail browser CORS checks.
Apply an environment-only change with
`docker compose up -d --no-build --wait backend`. The frontend's
`NEXT_PUBLIC_SOCKET_URL` must use the HTTPS API hostname. Neither changing the
backend CORS setting nor configuring Nginx requires deploying the frontend.

To verify the deployed route without bypassing certificate checks:

```bash
curl --fail https://api.chess.rebundled.co/health
curl --fail -D - -H 'Origin: https://chess.rebundled.co' https://api.chess.rebundled.co/api/config
curl --fail 'https://api.chess.rebundled.co/socket.io/?EIO=4&transport=polling'
```

The config response must allow `https://chess.rebundled.co`, and the socket
request should return an Engine.IO handshake. Verify secure WebSockets in a
browser as well. On 2026-10-24, the missing API vhost/certificate and a localhost
CORS origin were repaired on `oci-dev-host`. The pre-repair Nginx configuration
and restricted-permission environment backup are under
`~/backups/chess-rebundled/tls-20261024_111054/`.

The frontend already sets `Cross-Origin-Opener-Policy: same-origin-allow-popups`
for Firebase popup authentication. A `window.closed` policy warning alone does
not diagnose a failed login; inspect the actual Firebase error separately from
API certificate or CORS failures.

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

## Recovering an existing player/game catalog

Do not infer the old database name solely from the current `.env` file. Inspect
the existing MongoDB server for the actual chess database before importing new
PGNs or changing connection settings. A connection URI without a database path
can point at the default database even when an imported catalog lives elsewhere.

For a one-time copy into Compose, keep the source database intact and back up
both source and destination with `mongodump --archive --gzip`. Restore the source
archive into uniquely named **staging collections** in the destination database
using `mongorestore --nsFrom`/`--nsTo`, then check counts, schema, and existing-ID
conflicts before merging. Preserve BSON `_id` values, as saved history may refer
to those game IDs. Copy migration records as well as games.

A merge with `whenMatched: "keepExisting"` and `whenNotMatched: "insert"` preserves
existing records and can be repeated without inserting the same IDs twice.
Verify every staged record against the result before removing staging. Compare
canonical Extended JSON values: aggregation may change BSON field order even
when the data is identical. Never use a database drop or overwrite the current
catalog as a shortcut. See MongoDB's [namespace restore examples](https://www.mongodb.com/docs/database-tools/mongorestore/mongorestore-examples/).

On `oci-dev-host`, the 2026-10-24 recovery copied the legacy
`chess-rebundled-local` catalog into Compose's `chess-rebundled` database. The
legacy source had 28,453 games; retaining the five existing sample records
produced 28,458 games and 5,907 distinct player names. The original migration
history and game IDs were preserved. The app continues to use the Compose
MongoDB volume; no host database connection or new PGN download is required.

Recovery artifacts are outside the checkout at
`~/backups/chess-rebundled/catalog-20261024_090546/`: the legacy source archive,
the pre-recovery Compose archive, SHA-256 checksums, and the merge/verification
script. Ordinary deploys do not touch this directory or the MongoDB volume.

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
