#!/usr/bin/env bash
# Prepare the production checkout after installing Docker Engine/Compose.
# Usage: ./scripts/setup-oracle-vm.sh [git-repository-url]
set -Eeuo pipefail

repository_url="${1:-git@github.com:chandreshkkhatri/chess-rebundled-co.git}"
deploy_dir="$HOME/deployments/prod/chess-rebundled-co"
for command_name in git docker flock; do
  command -v "$command_name" >/dev/null || {
    printf 'Install %s before continuing; see docs/DEPLOYMENT.md.\n' "$command_name" >&2
    exit 1
  }
done
docker compose version
docker info >/dev/null

if [[ ! -d "$deploy_dir/.git" ]]; then
  mkdir -p -- "$(dirname -- "$deploy_dir")"
  git clone --branch main --single-branch "$repository_url" "$deploy_dir"
fi
cd "$deploy_dir"
# Never overwrite an operator's database URLs or credentials.
[[ -f .env ]] || cp .env.example .env
[[ -f backend/.env ]] || cp backend/.env.example backend/.env
printf 'Production checkout: %s\n' "$deploy_dir"
printf '%s\n' \
  'Configure .env and backend/.env, preserving your existing database URLs.' \
  'Then run: bash scripts/deploy-backend.sh' \
  'Docker uses Node.js 24 and the pinned pnpm version; host Node.js/PM2 is unnecessary.' \
  'Keep port 3001 on loopback and expose HTTPS through your reverse proxy.'
