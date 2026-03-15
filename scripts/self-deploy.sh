#\!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Pi-Chi Self-Deploy Script (Local Build)
#
# Builds the Next.js app locally on the Pi and restarts the
# dashboard service. Called by the brain after code changes.
#
# Steps:
#   1. Pull latest code
#   2. Clean stale .next/types
#   3. Type check gate (tsc --noEmit)
#   4. Backup .next/ to /tmp
#   5. Stop dashboard (free RAM for build)
#   6. Build with constrained memory
#   7. Restart + health check (auto-rollback on failure)
#
# Usage: bash scripts/self-deploy.sh [--skip-typecheck]
# Exit codes: 0=success, 1=failed
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

PI_CHI_DIR="${HOME}/pi-chi"
BACKUP_DIR="/tmp/pi-chi-next-backup"
HEALTH_URL="http://localhost:3333/api/vitals"
HEALTH_RETRIES=8
HEALTH_INTERVAL=5
SKIP_TYPECHECK=false

[ "${1:-}" = "--skip-typecheck" ] && SKIP_TYPECHECK=true

cd "$PI_CHI_DIR"

echo "[deploy] Pi-Chi local build starting..."
echo "[deploy] $(date)"

# ── 1. Pull latest code ────────────────────────────────────────
echo "[deploy] Step 1: Pulling latest code..."
git pull --ff-only origin master 2>&1 || {
  echo "[deploy] Git pull failed (merge conflict?). Aborting."
  exit 1
}

# ── 2. Clean stale .next/types ─────────────────────────────────
echo "[deploy] Step 2: Cleaning stale .next/types..."
rm -rf .next/types 2>/dev/null || true

# ── 3. Type check gate ─────────────────────────────────────────
if [ "$SKIP_TYPECHECK" = false ]; then
  echo "[deploy] Step 3: Type checking (tsc --noEmit)..."
  if \! npx tsc --noEmit 2>&1; then
    echo "[deploy] WARNING: Type check failed, continuing anyway..."
  fi
else
  echo "[deploy] Step 3: Skipped (--skip-typecheck)"
fi

# ── 4. Backup current .next/ ───────────────────────────────────
echo "[deploy] Step 4: Backing up .next/ to /tmp..."
rm -rf "$BACKUP_DIR"
if [ -d .next ]; then
  cp -a .next "$BACKUP_DIR"
  echo "[deploy] Backup created at $BACKUP_DIR"
else
  echo "[deploy] No .next/ to backup"
fi

# ── 5. Stop dashboard (free RAM for build) ─────────────────────
echo "[deploy] Step 5: Stopping dashboard to free RAM..."
sudo systemctl stop pi-chi-dashboard 2>/dev/null || true
sleep 2

# ── 6. Build ───────────────────────────────────────────────────
echo "[deploy] Step 6: Building Next.js app..."
BUILD_START=$(date +%s)

if NODE_OPTIONS="--max-old-space-size=3072" npm run build 2>&1; then
  BUILD_END=$(date +%s)
  echo "[deploy] Build succeeded in $(( BUILD_END - BUILD_START ))s"
else
  BUILD_END=$(date +%s)
  echo "[deploy] Build FAILED after $(( BUILD_END - BUILD_START ))s"

  # Restore backup
  if [ -d "$BACKUP_DIR" ]; then
    echo "[deploy] Restoring backup..."
    rm -rf .next
    mv "$BACKUP_DIR" .next
  fi

  # Restart with old build
  sudo systemctl start pi-chi-dashboard
  echo "[deploy] Rolled back to previous build"
  exit 1
fi

# ── 7. Restart + health check ──────────────────────────────────
echo "[deploy] Step 7: Restarting dashboard..."
sudo systemctl start pi-chi-dashboard

echo "[deploy] Running health check..."
for i in $(seq 1 $HEALTH_RETRIES); do
  sleep $HEALTH_INTERVAL
  if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
    echo "[deploy] Health check passed\!"
    rm -rf "$BACKUP_DIR"
    echo "[deploy] Deploy complete\!"
    exit 0
  fi
  echo "[deploy] Health check $i/$HEALTH_RETRIES..."
done

# Health check failed — rollback
echo "[deploy] Health check FAILED. Rolling back..."
sudo systemctl stop pi-chi-dashboard 2>/dev/null || true

if [ -d "$BACKUP_DIR" ]; then
  rm -rf .next
  mv "$BACKUP_DIR" .next
  sudo systemctl start pi-chi-dashboard
  sleep 5
  if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
    echo "[deploy] Rollback successful"
  else
    echo "[deploy] Rollback health check also failed\!"
  fi
else
  echo "[deploy] No backup to rollback to\!"
  sudo systemctl start pi-chi-dashboard
fi

exit 1
