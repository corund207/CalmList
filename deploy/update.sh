#!/bin/sh
# Deploys the latest main on macserver: fast-forwards this checkout (~/apps/calmlist) and rebuilds
# the calmlist service of the apps project when it moved. cron runs this every two minutes;
# `npm run deploy` runs it over Tailscale SSH. Pass --force to rebuild even when main hasn't moved.
set -eu
cd "$(dirname "$0")/.."
APPS_DIR=${APPS_DIR:-$HOME/apps}

before=$(git rev-parse HEAD)
git fetch --quiet origin main
git merge --ff-only --quiet origin/main
if [ "$(git rev-parse HEAD)" = "$before" ] && [ "${1:-}" != "--force" ]; then
  exit 0
fi

echo "$(date -Is) deploying $(git log -1 --format='%h %s')"
docker compose -f "$APPS_DIR/compose.yml" up -d --build calmlist
docker image prune -f >/dev/null
