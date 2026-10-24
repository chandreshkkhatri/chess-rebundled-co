# Dependency maintenance

This is a pnpm workspace with one authoritative `pnpm-lock.yaml` at the repository
root. Run installs from that root. `packageManager` pins pnpm 10.18.1 for local
development and Docker builds. The legacy SSH/GitHub deployment paths still use
npm; they are not the current Compose deployment workflow.

Use Node.js 24 LTS (`nvm install` and `nvm use` read `.nvmrc`). Node.js 22.13+ on
the 22.x line is also supported. See the root manifest's `engines` for the exact
allowed range and prefer these LTS lines for development and production.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

## Installation recovery

The reported `Cannot read properties of null (reading 'matches')` error occurs
inside npm Arborist's link deduplication code while processing the frontend's
dependency tree. This workspace's installed links and lockfile are managed by
pnpm. Use pnpm consistently instead of running npm inside a workspace package.
If a previous npm run altered generated `node_modules` directories, remove those
generated directories and reinstall with the command above. Keep the root
lockfile and your environment files.

## Workspace commands

| Command from the repository root | Behavior |
| --- | --- |
| `pnpm dev` | Starts native frontend and backend development servers. |
| `pnpm --filter frontend dev` | Runs Next.js on port 3000 by default. |
| `pnpm --filter backend dev` | Runs the backend with `tsx watch`. |
| `pnpm test` | Runs backend regressions, then frontend regressions with local fixtures/mocks. |
| `pnpm lint` | Runs frontend ESLint flat config; backend lint is not configured. |
| `pnpm typecheck` | Runs TypeScript checks in both workspaces. |
| `pnpm build` | Builds the frontend with Webpack, then compiles the backend. |
| `pnpm start` | Starts the compiled backend only. |
| `pnpm --filter frontend start` | Starts Next.js using the local production build. |
| `pnpm deploy:backend` | Runs the legacy SSH/PM2 script; it is not a Compose alias. |

Use `pnpm --filter frontend ...` or `pnpm --filter backend ...` to target a
workspace. `pnpm -w` selects the root; it does not select a workspace by name.
For example, add a runtime package with `pnpm --filter backend add <package>`.

## Upgrade decisions

The dependency upgrade used the npm registry's stable release metadata.
Next.js and its ESLint configuration move together; React and React DOM also
share a version. Fastify 5 uses the matching CORS plugin major. Firebase, Firebase
Admin, Gemini, Redis, MongoDB, Socket.io, and Zustand are upgraded alongside the
build tooling and SDKs.

ESLint remains on the latest 9.x release because Next.js's React, accessibility,
and import plugins declare peer support only through ESLint 9. TypeScript
remains on the latest 6.0.x release supported by the TypeScript ESLint parser
(`<6.1`), rather than installing unsupported 7.x. Node typings stay on the
22.x baseline so compile-time APIs remain compatible with the supported runtime.
Packages with no newer stable release at the time of that upgrade remained on
their current release line. The manifests and root lockfile are authoritative;
this guide does not replace a future release/compatibility check.

The deprecated `elevenlabs` package is replaced with
`@elevenlabs/elevenlabs-js`; narration scripts use `textToSpeech.convert` and the
current camelCase SDK fields. Unused NextAuth/MongoDB adapter and Google TTS
dependencies are removed. The separate adm-zip type package is removed because
adm-zip now includes its types. Tailwind 4 supplies vendor prefixing, so a direct
autoprefixer dependency is no longer needed.

## Framework migrations

- Next.js 16 removes `next lint`. `pnpm lint` runs ESLint's flat configuration.
  Existing hook dependency and rules-of-hooks checks remain enabled. New React
  Compiler diagnostics for effect state, render-time refs/purity, and recursive
  callbacks are deferred because this application does not enable the compiler.
- Development and production builds explicitly use Webpack, preserving the
  existing `next-pwa` integration. Standalone output supports the optional Docker
  frontend image.
- Next.js-generated TypeScript configuration uses `react-jsx` and includes both
  production and development route types. Do not edit `next-env.d.ts` manually.
- Tailwind 4 uses `@tailwindcss/postcss`, a CSS import, and an explicit `@config`
  directive for the existing theme. Renamed utilities and preflight compatibility
  styles preserve the prior appearance.
- Zustand 5 retains the existing whole-store subscriptions and persistence
  adapters; new selectors must return stable references.
- Firebase Admin 14 uses modular app/auth/Firestore imports in both server setup
  and tests; its removed namespace methods are no longer used.

See the official [Next.js migration guide](https://nextjs.org/docs/app/guides/upgrading/version-16),
[Tailwind migration guide](https://tailwindcss.com/docs/upgrade-guide),
[Fastify migration guide](https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/),
and [TypeScript ESLint compatibility](https://typescript-eslint.io/users/dependency-versions/).
See [Docker deployment](DEPLOYMENT.md) for the default backend-only stack.

## Verification scope

Regression tests use mocked AI/Firebase operations and local session stores.
They do not establish live MongoDB/Redis connectivity, microphone compatibility,
or access to cloud models. See [manual checks](RELIABILITY.md#verification).

The dependency/deployment update was verified with frozen pnpm installation,
tests, lint, typechecks, production builds, both Docker image builds, and isolated
image smoke tests. Browser checks covered the mobile landing page, profile
redirect, MDX blog, and consecutive Stockfish turns. Live cloud integrations and
a deployed Compose stack were not part of that verification.
