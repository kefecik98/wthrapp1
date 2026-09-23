#!/usr/bin/env bash
#
# WeatherAlert server deploy script.
#
# Runs ON the app VM — invoked by the self-hosted GitHub Actions runner (see
# .github/workflows/ci.yml, the `deploy` job) after tests pass and the image
# has been published, or by hand if you ever need to deploy without CI.
#
# Unlike the old PM2 version, this script does NOT build anything. CI builds
# the image on GitHub's runners and pushes it to GHCR; the rack only pulls a
# tagged artifact and restarts. That is what makes rollback trivial: point
# IMAGE_TAG at an older commit SHA and run this again.
#
# What it does, in order:
#   1. Sync the repo checkout (for compose files and the Caddyfile only).
#   2. Pull the exact image tag being deployed.
#   3. Apply database migrations as a one-shot container, before the new app
#      starts — so a failed migration aborts the deploy with the old version
#      still serving.
#   4. Recreate the stack.
#   5. Health-check, and roll the app back to the previous image if it fails.

set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/weatheralert}"
COMPOSE_DIR="${DEPLOY_DIR}/server/deploy"
COMPOSE_FILE="${COMPOSE_DIR}/docker-compose.prod.yml"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/health}"

compose() { docker compose -f "${COMPOSE_FILE}" "$@"; }

echo "==> Deploying to ${DEPLOY_DIR}"

# 1. Sync the checkout. Only the compose file, Caddyfile and frpc.toml are
#    read from here — the application itself ships as an image. `reset --hard`
#    guarantees the tree matches the commit regardless of local drift;
#    deploy/.env and firebase-service-account.json are untracked and survive.
git -C "${DEPLOY_DIR}" fetch --all --prune
git -C "${DEPLOY_DIR}" reset --hard origin/main
echo "==> Repo now at $(git -C "${DEPLOY_DIR}" rev-parse --short HEAD)"

cd "${COMPOSE_DIR}"

if [[ ! -f .env ]]; then
  echo "!!! ${COMPOSE_DIR}/.env is missing — copy .env.example and fill it in" >&2
  exit 1
fi

# Remember what we were running, so a failed health check can go back to it.
PREVIOUS_TAG="$(grep -E '^IMAGE_TAG=' .env | cut -d= -f2- || true)"
echo "==> Previously deployed tag: ${PREVIOUS_TAG:-<none>}"

# 2. The tag to deploy. CI passes the commit SHA; a manual run uses whatever
#    is already pinned in .env.
if [[ -n "${IMAGE_TAG:-}" ]]; then
  echo "==> Pinning IMAGE_TAG=${IMAGE_TAG}"
  if grep -qE '^IMAGE_TAG=' .env; then
    sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${IMAGE_TAG}|" .env
  else
    echo "IMAGE_TAG=${IMAGE_TAG}" >> .env
  fi
fi

echo "==> Pulling images"
compose pull

# 3. Migrations first, as a one-shot. --no-deps keeps this from starting the
#    app; the db service is brought up explicitly because migrations obviously
#    need it. `migrate deploy` is forward-only and safe to re-run.
echo "==> Applying database migrations"
compose up -d db
compose run --rm --no-deps app npx prisma migrate deploy

# 4. Start/refresh everything else.
echo "==> Starting stack"
compose up -d --remove-orphans

# 5. Health check against the loopback-published app port.
echo "==> Health check ${HEALTH_URL}"
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "${HEALTH_URL}" >/dev/null 2>&1; then
    echo "==> Deploy OK (healthy on attempt ${attempt})"
    compose ps
    exit 0
  fi
  echo "    not healthy yet (attempt ${attempt}); retrying in 3s"
  sleep 3
done

echo "!!! Health check failed after deploy" >&2

# Roll the application back. Migrations are NOT rolled back — they are
# forward-only by design, which is why non-additive ones want a Proxmox
# snapshot first (DEPLOY.md §6).
if [[ -n "${PREVIOUS_TAG}" && -n "${IMAGE_TAG:-}" && "${PREVIOUS_TAG}" != "${IMAGE_TAG}" ]]; then
  echo "!!! Rolling app back to ${PREVIOUS_TAG}" >&2
  sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${PREVIOUS_TAG}|" .env
  compose up -d app
  echo "!!! Rolled back. Investigate with: docker compose -f ${COMPOSE_FILE} logs app" >&2
fi

exit 1
