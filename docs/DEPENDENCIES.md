# Dependency maintenance

This is a pnpm workspace with one authoritative `pnpm-lock.yaml` at the repository
root. Run installs from that root. `packageManager` pins pnpm 10.18.1 for local
development, CI, and Docker builds.

Use Node.js 24 LTS (`nvm use` reads `.nvmrc`). Node.js 22.13+ on the 22.x line is
also supported. The project targets these LTS runtime lines rather than Node.js
23, which was used for the reported npm installation attempt.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

## Why `npm install` failed

The reported `Cannot read properties of null (reading 'matches')` error occurs
inside npm Arborist's link deduplication code while processing the frontend's
dependency tree. This workspace's installed links and lockfile are managed by
pnpm. Use pnpm consistently instead of running npm inside a workspace package.
If a previous npm run altered generated `node_modules` directories, remove those
generated directories and reinstall with the command above. Keep the root
lockfile and your environment files.

## Upgrade decisions

Direct packages are updated from the npm registry's stable release metadata.
Next.js and its ESLint configuration move together; React and React DOM also
share a version. Fastify 5 uses the matching CORS plugin major. Firebase, Firebase
Admin, Gemini, Redis, MongoDB, Socket.io, and Zustand are upgraded alongside the
build tooling and SDKs.

ESLint remains on the latest 9.x release because Next.js's React, accessibility,
and import plugins declare peer support only through ESLint 9. TypeScript
remains on the latest 6.0.x release supported by the TypeScript ESLint parser
(`<6.1`), rather than installing unsupported 7.x. Node typings stay on the
22.x baseline so compile-time APIs remain compatible with the supported runtime.
Packages with no newer stable release remain on their current release line.

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
