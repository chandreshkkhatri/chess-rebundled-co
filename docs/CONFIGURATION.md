# Environment configuration

Use the examples committed in the repository; keep actual credentials in ignored
environment files. See [deployment](DEPLOYMENT.md) for Compose commands and
[dependencies](DEPENDENCIES.md) for supported Node.js/pnpm versions.

## Environment files

| File | Used by | Purpose |
| --- | --- | --- |
| `backend/.env` | Backend development/startup and Compose backend `env_file` | Firebase Admin credentials, Gemini settings, HTTP CORS, and local database settings. |
| `frontend/.env.local` | Local Next.js development/build | Browser Firebase configuration and backend base URL. Next.js also recognizes `frontend/.env` if present. |
| Root `.env` | Docker Compose interpolation | Host bindings, database URL overrides, and optional frontend build arguments. |

Create files without replacing existing settings:

```bash
cp -n backend/.env.example backend/.env
cp -n frontend/.env.example frontend/.env.local
# Only needed for Compose overrides or its optional frontend build:
cp -n .env.example .env
```

Compose does not load `frontend/.env.local` into frontend build arguments. Put
those public settings in the root `.env` when using the frontend profile.
Backend credentials are supplied at runtime, not as frontend build arguments.

## Backend variables

| Variable | Current behavior |
| --- | --- |
| `NODE_ENV` | The backend example sets `development`; Compose forces `production`. Controls HTTP CORS behavior and Redis key prefixes. |
| `HOST`, `PORT` | Default listener is `0.0.0.0:3001`; Compose fixes these inside the container. |
| `CLIENT_URL` | Frontend origin allowed by Fastify HTTP CORS outside development; defaults to `http://localhost:3000`. |
| `MONGODB_URI` | Defaults to `mongodb://localhost:27017/chess-rebundled` for native execution. Compose supplies its internal MongoDB URL unless overridden in the root `.env`. |
| `REDIS_URL` | Optional for native execution. Connected Redis stores sessions/counters; otherwise a process-local fallback is used. Compose supplies its internal Redis URL by default. |
| `FIREBASE_PROJECT_ID` | Firebase project used by Admin initialization; also a fallback Vertex project ID. |
| `FIREBASE_CLIENT_EMAIL` | Firebase service-account email. |
| `FIREBASE_PRIVATE_KEY` | Firebase service-account private key; the loader converts escaped `\n` to newlines. |
| `GOOGLE_API_KEY` | Gemini Developer API key by default, or a Vertex express-mode key when Vertex mode is enabled. |
| `GEMINI_MODEL` | Model override; current code defaults to `gemini-3.1-flash-lite`. |
| `GOOGLE_GENAI_USE_VERTEXAI` | Set to `true` to use Vertex instead of the Developer API. |
| `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION` | Project and location for Vertex service-account/ADC mode; the project can fall back to `FIREBASE_PROJECT_ID`. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Optional Google SDK Application Default Credentials file; container paths must refer to files available inside the container. |
| `ELEVENLABS_API_KEY` | Used only by the optional narration/voice-listing scripts, which load `backend/.env`. |

Firebase Admin credentials are required by normal backend startup even when a
player uses guest practice. The Admin module initializes authentication and
Firestore clients at import time; it is not an optional no-Firebase backend.
Enable the authentication providers you use in the Firebase project and configure
its authorized frontend domains.

## Gemini and Vertex modes

The backend imports its shared GenAI client during startup. Configure the
selected mode before starting the server, rather than leaving its credentials
unset until the first AI request.

The shared [GenAI client](../backend/src/lib/genaiClient.ts) selects its backend:

1. **Developer API:** set `GOOGLE_API_KEY`, leaving Vertex mode unset/false.
2. **Vertex express mode:** set `GOOGLE_GENAI_USE_VERTEXAI=true` and a compatible
   `GOOGLE_API_KEY`. The client omits project/location when constructing this mode.
3. **Vertex service-account mode:** enable Vertex, leave the API key unset, and
   provide a project/location and credentials with access to Vertex. The client
   reuses `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`, or falls back to ADC.

The conversational AI setup currently checks for an API key or Vertex mode with
Firebase service-account variables. ADC-only detection is not implemented there.
The Firebase Admin requirement above still applies independently of GenAI's ADC
support. Model availability and credentials must match the selected deployment.

## Frontend variables

These values are public browser configuration and are embedded at build time.
Changing them for a production frontend requires rebuilding it.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SOCKET_URL` | Base URL for Socket.io **and** backend HTTP requests such as profile/config/history. Use `http://localhost:3001` for separate local servers. |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase web application API key. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase web authentication domain. |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID. |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase web application's storage bucket setting. |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase web application's messaging sender ID. |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase web application ID. |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Optional Firebase Analytics measurement ID. |
| `NEXT_PUBLIC_VOICE_PARSING_MODE` | Initial practice preference: `gemini-audio` or legacy-named `webspeech-haiku`. Existing stored preferences can override it. Multiplayer has its own stored preference. |

`webspeech-haiku` is a compatibility value in settings; text AI interpretation
uses Gemini. It does not configure an Anthropic account or model.

## Backend URLs and CORS

For a frontend hosted separately, set `NEXT_PUBLIC_SOCKET_URL` to the backend's
browser-reachable origin and `CLIENT_URL` to the frontend's origin. Include the
scheme and port where relevant. Docker service names such as `backend` work for
container-to-container networking, not as public browser addresses.

An empty `NEXT_PUBLIC_SOCKET_URL` uses the frontend origin. That setup requires a
reverse proxy to forward **both** `/api/*` and `/socket.io/*` to the backend.
The development-only Next.js rewrite forwards `/socket.io/*`; it does not proxy
`/api/*`. Use the explicit local backend URL for the usual two-server setup.

Fastify applies `CLIENT_URL` to HTTP CORS outside development. Socket.io has its
own CORS setup; session/game ownership is enforced by its handlers rather than
by the HTTP CORS configuration. Preserve WebSocket forwarding through your proxy.

For production HTTPS, the API certificate must cover the exact public hostname.
A wrong certificate blocks both HTTP requests and sockets before authentication.
See [public API HTTPS setup](DEPLOYMENT.md#public-api-https-and-browser-access).
Keep `CLIENT_URL` set to the deployed frontend origin, not the local development
origin. Backend environment changes require recreating the backend container.

Microphone features need browser support, permission, and a secure context such
as HTTPS or localhost. Text/tap input remains available without microphone access.

## Compose precedence

Compose provides `NODE_ENV`, `HOST`, `PORT`, `MONGODB_URI`, and `REDIS_URL` in the
backend service's `environment`, overriding those names in `backend/.env`.
Database URL overrides come from the root `.env` or shell interpolation. Other
backend settings, including `CLIENT_URL` and Firebase/Gemini credentials, come
from `backend/.env`.

`BIND_ADDRESS`, `BACKEND_PORT`, and `FRONTEND_PORT` control host publication, not
the listeners inside containers. Defaults are loopback ports 3001 and 3000.
MongoDB and Redis do not publish host ports.
