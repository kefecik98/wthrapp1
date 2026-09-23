#!/usr/bin/env bash
#
# WeatherAlert server deploy script.
#
# This automates the manual "Updates (recurring)" steps from DEPLOY.md §5.
# It runs ON the app VM — invoked by the self-hosted GitHub Actions runner
# (see .github/workflows/ci.yml, the `deploy` job) after tests pass, or by
# hand if you ever need to deploy without CI.
#
# What it does, in order:
#   1. Sync the canonical app directory to the exact commit on origin/main.
#   2. Install dependencies and generate the Prisma client.
#   3. Apply any new database migrations (forward-only, safe to re-run).
#   4. Compile TypeScript to dist/.
#   5. Reload the app under PM2 with zero-downtime, then health-check it.
#
# It is idempotent: running it twice on the same commit is a no-op reload.
# Any failing step aborts the whole script (set -e), so a broken deploy
# turns the GitHub Actions job red instead of silently shipping.

set -euo pipefail

# The canonical clone the live app runs from. Overridable for testing, but in
# production this is the git checkout created during the one-time bootstrap
# (DEPLOY.md §2). NOTE: this is NOT the runner's own workspace — the runner
# just executes this script; the script operates on the real app directory.
DEPLOY_DIR="${DEPLOY_DIR:-/opt/weatheralert}"
PM2_APP="weatheralert-api"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/health}"

echo "==> Deploying to ${DEPLOY_DIR}"

# 1. Sync to origin/main exactly. `reset --hard` (not `pull`) guarantees the
#    working tree matches the commit regardless of local drift. Gitignored
#    files (.env, firebase-service-account.json) are untracked, so they are
#    left untouched.
git -C "${DEPLOY_DIR}" fetch --all --prune
git -C "${DEPLOY_DIR}" reset --hard origin/main
echo "==> Now at $(git -C "${DEPLOY_DIR}" rev-parse --short HEAD)"

cd "${DEPLOY_DIR}/server"

# 2. Dependencies. `npm ci` installs exactly what package-lock.json pins,
#    including devDependencies — the build (typescript) and migrations
#    (prisma CLI) need them.
echo "==> Installing dependencies"
npm ci
npx prisma generate

# 3. Migrations. `migrate deploy` only applies already-created migrations and
#    never generates or resets — the safe production command. Destructive
#    (non-additive) migrations still warrant a Proxmox snapshot first; see
#    DEPLOY.md §5.
echo "==> Applying database migrations"
npx prisma migrate deploy

# 4. Build.
echo "==> Building"
npm run build

# 5. Reload under PM2. `startOrReload` starts the app if it isn't running yet
#    and does a zero-downtime reload if it is. `--update-env` re-reads env.
#    SIGTERM → graceful shutdown handler in src/index.ts (stops cron, closes
#    Fastify, disconnects Prisma).
echo "==> Reloading PM2 app ${PM2_APP}"
pm2 startOrReload deploy/ecosystem.config.cjs --update-env
pm2 save

# 6. Health check — poll a few times so we don't race the app's startup.
echo "==> Health check ${HEALTH_URL}"
for attempt in 1 2 3 4 5; do
  if curl -fsS "${HEALTH_URL}" >/dev/null; then
    echo "==> Deploy OK (healthy on attempt ${attempt})"
    exit 0
  fi
  echo "    not healthy yet (attempt ${attempt}); retrying in 3s"
  sleep 3
done

echo "!!! Health check failed after reload — check 'pm2 logs ${PM2_APP}'" >&2
exit 1
