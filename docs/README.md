# Documentation

The guides describe the current repository. Package manifests and the root
lockfile define dependency versions; `compose.yaml` defines deployment defaults.

| Guide | Covers |
| --- | --- |
| [Project README](../README.md) | Local setup, verification, routes, and quick deployment. |
| [Features](FEATURES.md) | Practice, multiplayer, bots, voice, progress, and local simulations. |
| [Architecture](ARCHITECTURE.md) | Application boundaries, storage, HTTP/socket interfaces, and content. |
| [Configuration](CONFIGURATION.md) | Environment files, Firebase, Gemini, browser URLs, and Compose precedence. |
| [Deployment](DEPLOYMENT.md) | Default backend-only Compose stack, optional frontend, operations, and legacy paths. |
| [Dependencies](DEPENDENCIES.md) | Supported tools, upgrade decisions, installation recovery, and checks. |
| [Reliability](RELIABILITY.md) | Ownership, reconnection, quotas, game mutations, worker cancellation, and tests. |
| [Narration script](marketing/NARRATION_SCRIPT.md) | Promotional narration source for the ElevenLabs utility; not a setup guide. |

## Common tasks

- Start local development: [README](../README.md#local-development).
- Deploy only the backend stack: [deployment](DEPLOYMENT.md#backend-deployment-default).
- Explicitly include the frontend: [deployment](DEPLOYMENT.md#optional-frontend-deployment).
- Configure a separate hosted frontend: [configuration](CONFIGURATION.md#backend-urls-and-cors).
- Recover from a mixed npm/pnpm install: [dependencies](DEPENDENCIES.md#installation-recovery).
- Check game/session behavior: [reliability](RELIABILITY.md#verification).

Saved progress requires Firebase sign-in. Cosmetics, simulated standings, and
trainer high scores are browser-local; see [features](FEATURES.md#browser-local-customization-and-simulations).
