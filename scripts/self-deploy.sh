#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Pi-Chi Self-Deploy Script (NO LOCAL BUILD)
#
# The Pi does NOT build — it pulls code and restarts.
# Builds happen on the Windows dev machine via `npm run deploy`.
# If .next/ was shipped via tar, it is already in place.
#
# Steps:
#   1. Git pull (code only, .next comes from dev machine)
#   2. Restart dashboard + health check
#
# Usage: bash scripts/self-deploy.sh
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

PI_CHI_DIR="${HOME}/pi-chi"
HEALTH_URL="http://localhost:3333/api/vitals"
HEALTH_RETRIES=6
HEALTH_INTERVAL=5

cd "$PI_CHI_DIR"

echo "[deploy] Pi-Chi deploy (no-build mode)..."
echo "[deploy] $(date)"

# ── 1. Pull latest code ────────────────────────────────────────
echo "[deploy] Pulling latest code..."
git stash -q 2>/dev/null || true
git pull --rebase origin master 2>&1 || {
  echo "[deploy] Git pull failed. Aborting."
  exit 1
}

# ── 2. Restart services ───────────────────────────────────────
echo "[deploy] Restarting dashboard..."
sudo systemctl restart pi-chi-dashboard
# SMS now uses gammu directly — no separate service needed

echo "[deploy] Health check..."
for i in $(seq 1 $HEALTH_RETRIES); do
  sleep $HEALTH_INTERVAL
  if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
    echo "[deploy] Health check passed!"
    echo "[deploy] Deploy complete!"
    exit 0
  fi
  echo "[deploy] Health check $i/$HEALTH_RETRIES..."
done

echo "[deploy] WARNING: Health check failed but services restarted."
exit 1
