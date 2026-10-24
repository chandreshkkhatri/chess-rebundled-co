# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.18.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/package.json

FROM base AS build
RUN --mount=type=cache,id=chess-pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter backend...
COPY backend/tsconfig.json ./backend/tsconfig.json
COPY backend/src ./backend/src
RUN pnpm --filter backend build

FROM base AS production-deps
RUN --mount=type=cache,id=chess-pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod --filter backend...

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001
WORKDIR /app/backend
COPY --from=production-deps --chown=node:node /app/node_modules /app/node_modules
COPY --from=production-deps --chown=node:node /app/backend/node_modules ./node_modules
COPY --from=production-deps --chown=node:node /app/backend/package.json ./package.json
COPY --from=build --chown=node:node /app/backend/dist ./dist
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health', {signal: AbortSignal.timeout(3000)}).then(r => {if (!r.ok) process.exit(1)}).catch(() => process.exit(1))"
CMD ["node", "dist/index.js"]
