#!/usr/bin/env bash
# Exercise release behavior with a fake Docker executable; no containers run.
set -Eeuo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT
checkout="$fixture/production checkout"
mkdir -p "$fixture/bin" "$checkout/scripts" "$checkout/backend"
git init --quiet "$checkout"
cp "$repo_dir/scripts/deploy-backend.sh" "$checkout/scripts/"
cp "$repo_dir/compose.yaml" "$checkout/compose.yaml"
printf 'CLIENT_URL=https://frontend.example.test\n' > "$checkout/backend/.env"

cat > "$fixture/bin/docker" <<'DOCKER'
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "$1" == inspect ]]; then
  printf 'inspect\n' >> "$DEPLOY_TEST_LOG"
  printf 'sha256:previous-image\n'
  exit 0
fi
if [[ "$1" == image && "$2" == tag ]]; then
  printf 'tag %s %s\n' "$3" "$4" >> "$DEPLOY_TEST_LOG"
  [[ "$DEPLOY_TEST_CASE" != rollback-tag-fails ]]
  exit
fi
[[ "$1" == compose ]] || exit 90
shift
while [[ "${1:-}" == --project-directory || "${1:-}" == -f ]]; do shift 2; done
printf 'compose %s\n' "$*" >> "$DEPLOY_TEST_LOG"
case "$1" in
  version) exit 0 ;;
  config) [[ "$DEPLOY_TEST_CASE" != invalid-config ]] ;;
  ps)
    if [[ "$*" == *--quiet* && "$DEPLOY_TEST_CASE" != first-deploy-fails ]]; then
      printf 'previous-container\n'
    fi
    ;;
  build) [[ "$DEPLOY_TEST_CASE" != build-fails ]] ;;
  up)
    if [[ "$*" == *--no-deps* ]]; then
      [[ "$DEPLOY_TEST_CASE" != rollback-start-fails ]]
    else
      [[ "$DEPLOY_TEST_CASE" == success ]]
    fi
    ;;
  *) exit 91 ;;
esac
DOCKER
chmod +x "$fixture/bin/docker"
export DEPLOY_TEST_LOG="$fixture/docker.log"

for scenario in success invalid-config build-fails unhealthy first-deploy-fails rollback-tag-fails rollback-start-fails; do
  export DEPLOY_TEST_CASE="$scenario"
  : > "$DEPLOY_TEST_LOG"
  result=0
  PATH="$fixture/bin:$PATH" bash "$checkout/scripts/deploy-backend.sh" > "$fixture/output" 2>&1 || result=$?
  case "$scenario" in
    success)
      [[ "$result" == 0 ]]
      grep -Eq '^compose build backend$' "$DEPLOY_TEST_LOG"
      grep -Eq '^compose up -d --no-build --wait --wait-timeout 180 backend$' "$DEPLOY_TEST_LOG"
      ! grep -Eq '^tag ' "$DEPLOY_TEST_LOG"
      ;;
    invalid-config|build-fails)
      [[ "$result" != 0 ]]
      ! grep -Eq '^compose up |^tag ' "$DEPLOY_TEST_LOG"
      ;;
    first-deploy-fails)
      [[ "$result" != 0 ]]
      ! grep -Eq '^tag ' "$DEPLOY_TEST_LOG"
      grep -Eq 'No previous Compose backend image' "$fixture/output"
      ;;
    unhealthy|rollback-start-fails)
      [[ "$result" != 0 ]]
      grep -Eq '^tag sha256:previous-image chess-rebundled-backend:production$' "$DEPLOY_TEST_LOG"
      grep -Eq '^compose up -d --no-build --no-deps --pull never --wait --wait-timeout 180 backend$' "$DEPLOY_TEST_LOG"
      ;;
    rollback-tag-fails)
      [[ "$result" != 0 ]]
      grep -Eq '^tag ' "$DEPLOY_TEST_LOG"
      ! grep -Eq '^compose up .*--no-deps' "$DEPLOY_TEST_LOG"
      ;;
  esac
  # A failed deploy must not report success, deploy frontend, or destroy data.
  ! grep -Eq 'compose (down|rm)|frontend|--volumes' "$DEPLOY_TEST_LOG"
  printf 'PASS: %s\n' "$scenario"
done
# Missing secrets/config must fail before any build or startup.
rm "$checkout/backend/.env"
: > "$DEPLOY_TEST_LOG"
if PATH="$fixture/bin:$PATH" bash "$checkout/scripts/deploy-backend.sh" > "$fixture/output" 2>&1; then exit 1; fi
! grep -Eq 'compose (build|up)' "$DEPLOY_TEST_LOG"
printf 'PASS: missing backend environment\n'
