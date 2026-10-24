#!/usr/bin/env bash
# Run inside the production checkout, directly or through pnpm deploy:backend.
# Node.js and pnpm run in the Docker build; the VM only needs Docker/Compose.
set -Eeuo pipefail

if (($#)); then
  printf 'Usage: %s (run in the production checkout on the VM)\n' "$0" >&2
  exit 2
fi
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_dir"

command -v docker >/dev/null || { printf 'Docker Engine is required.\n' >&2; exit 1; }
docker compose version >/dev/null
[[ -f backend/.env ]] || {
  printf 'Configure backend/.env before deploying; see docs/DEPLOYMENT.md.\n' >&2
  exit 1
}

# SSH deploys hold this same lock while updating the checkout. Local/manual
# invocations acquire it here so builds cannot race another release.
if [[ "${CHESS_DEPLOY_LOCKED:-0}" != 1 ]]; then
  exec 9> "$(git rev-parse --git-path compose-deploy.lock)"
  flock -w 1800 9
fi

compose=(docker compose --project-directory "$repo_dir" -f "$repo_dir/compose.yaml")
# This stable local tag must match compose.yaml. No registry push is needed.
backend_image=chess-rebundled-backend:production
wait_seconds=180
"${compose[@]}" config --quiet
previous_container=$("${compose[@]}" ps --all --quiet backend)
previous_image=
if [[ -n "$previous_container" ]]; then
  previous_image=$(docker inspect --format '{{.Image}}' "$previous_container")
fi

# Build before replacing the running backend. Installs use the frozen pnpm
# workspace lockfile inside backend/Dockerfile; no host npm/PM2 is involved.
"${compose[@]}" build backend
if "${compose[@]}" up -d --no-build --wait --wait-timeout "$wait_seconds" backend; then
  "${compose[@]}" ps backend
  printf 'Production backend is healthy.\n'
  exit 0
fi

printf 'Deployment failed its startup/health checks.\n' >&2
"${compose[@]}" ps --all backend || true
if [[ -n "$previous_image" ]]; then
  printf 'Restoring the previous backend image.\n' >&2
  if docker image tag "$previous_image" "$backend_image" && \
      "${compose[@]}" up -d --no-build --no-deps --pull never \
        --wait --wait-timeout "$wait_seconds" backend; then
    printf 'Previous backend image is healthy; the deployment remains failed.\n' >&2
  else
    printf 'Rollback failed. Inspect docker compose ps and backend logs on the VM.\n' >&2
  fi
else
  printf 'No previous Compose backend image exists to restore.\n' >&2
fi
# Never stop the entire stack, remove volumes, or launch the frontend here.
exit 1
