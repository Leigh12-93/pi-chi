#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Pi-Chi Self-Deploy Script
#
# Downloads the latest standalone build artifact from GitHub Actions
# and deploys it to the local Pi. Called by the brain after pushing
# code changes.
#
# Usage: bash scripts/self-deploy.sh [--wait]
#   --wait: Poll until a new workflow run completes (default: use latest)
#
# Exit codes:
#   0 = success
#   1 = failed (artifact download, extraction, or health check)
#   2 = no artifact available
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

REPO="Leigh12-93/pi-chi"
PI_CHI_DIR="${HOME}/pi-chi"
DEPLOY_DIR="${PI_CHI_DIR}/.next/standalone"
DEPLOY_TMP="/tmp/pi-chi-deploy"
HEALTH_URL="http://localhost:3333/api/vitals"
MAX_POLL_ATTEMPTS=40       # 40 * 15s = 10 minutes max wait
POLL_INTERVAL=15
HEALTH_CHECK_RETRIES=5
HEALTH_CHECK_INTERVAL=5

# ── Extract GitHub token from git remote URL ───────────────────
extract_token() {
  local remote_url
  remote_url=$(cd "$PI_CHI_DIR" && git remote get-url origin 2>/dev/null || echo "")
  # Format: https://user:TOKEN@github.com/...
  echo "$remote_url" | sed -n 's|.*:\(gho_[^@]*\)@.*|\1|p' || \
  echo "$remote_url" | sed -n 's|.*:\(ghp_[^@]*\)@.*|\1|p' || \
  echo "$remote_url" | sed -n 's|.*:\([^@]*\)@github.com.*|\1|p'
}

TOKEN=$(extract_token)
if [ -z "$TOKEN" ]; then
  echo "[deploy] ERROR: Could not extract GitHub token from git remote"
  exit 1
fi

API="https://api.github.com"
AUTH="Authorization: token $TOKEN"

# ── Get the latest successful workflow run ──────────────────────
get_latest_run() {
  curl -sf -H "$AUTH" \
    "$API/repos/$REPO/actions/runs?status=completed&conclusion=success&per_page=1" \
    | python3 -c "import sys,json; runs=json.load(sys.stdin).get('workflow_runs',[]); print(runs[0]['id'] if runs else '')" 2>/dev/null
}

# ── Get the head SHA of the latest run ──────────────────────────
get_run_sha() {
  local run_id=$1
  curl -sf -H "$AUTH" \
    "$API/repos/$REPO/actions/runs/$run_id" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('head_sha',''))" 2>/dev/null
}

# ── Wait for a new workflow run to complete ─────────────────────
wait_for_run() {
  local head_sha
  head_sha=$(cd "$PI_CHI_DIR" && git rev-parse HEAD)
  echo "[deploy] Waiting for GitHub Actions build of $head_sha..."

  for i in $(seq 1 $MAX_POLL_ATTEMPTS); do
    local run_id
    # Check for any run matching our commit
    run_id=$(curl -sf -H "$AUTH" \
      "$API/repos/$REPO/actions/runs?head_sha=$head_sha&per_page=1" \
      | python3 -c "
import sys, json
runs = json.load(sys.stdin).get('workflow_runs', [])
if runs:
    r = runs[0]
    if r['status'] == 'completed':
        if r['conclusion'] == 'success':
            print(r['id'])
        else:
            print('FAILED:' + r['conclusion'])
    else:
        print('PENDING:' + r['status'])
else:
    print('NONE')
" 2>/dev/null)

    case "$run_id" in
      FAILED:*)
        echo "[deploy] Build failed: ${run_id#FAILED:}"
        return 1
        ;;
      PENDING:*|NONE)
        echo "[deploy] [$i/$MAX_POLL_ATTEMPTS] Build ${run_id}... (${i}/${MAX_POLL_ATTEMPTS})"
        sleep $POLL_INTERVAL
        ;;
      *)
        if [ -n "$run_id" ]; then
          echo "[deploy] Build completed! Run ID: $run_id"
          echo "$run_id"
          return 0
        fi
        sleep $POLL_INTERVAL
        ;;
    esac
  done

  echo "[deploy] Timed out waiting for build"
  return 1
}

# ── Download the deploy artifact from a run ─────────────────────
download_artifact() {
  local run_id=$1
  echo "[deploy] Downloading artifact from run $run_id..."

  # Get artifact ID
  local artifact_id
  artifact_id=$(curl -sf -H "$AUTH" \
    "$API/repos/$REPO/actions/runs/$run_id/artifacts" \
    | python3 -c "
import sys, json
arts = json.load(sys.stdin).get('artifacts', [])
for a in arts:
    if a['name'] == 'pi-chi-deploy' and not a.get('expired', False):
        print(a['id'])
        break
" 2>/dev/null)

  if [ -z "$artifact_id" ]; then
    echo "[deploy] ERROR: No pi-chi-deploy artifact found in run $run_id"
    return 1
  fi

  # Download artifact (GitHub returns a zip containing our tarball)
  rm -rf "$DEPLOY_TMP"
  mkdir -p "$DEPLOY_TMP"
  curl -sfL -H "$AUTH" \
    "$API/repos/$REPO/actions/artifacts/$artifact_id/zip" \
    -o "$DEPLOY_TMP/artifact.zip"

  # Unzip the outer wrapper (GitHub wraps artifacts in a zip)
  cd "$DEPLOY_TMP"
  unzip -qo artifact.zip
  rm artifact.zip

  if [ ! -f "pi-chi-deploy.tar.gz" ]; then
    echo "[deploy] ERROR: pi-chi-deploy.tar.gz not found in artifact"
    return 1
  fi

  echo "[deploy] Artifact downloaded successfully"
  return 0
}

# ── Deploy the artifact ─────────────────────────────────────────
deploy() {
  echo "[deploy] Deploying..."

  # Stop dashboard
  sudo systemctl stop pi-chi-dashboard 2>/dev/null || true
  sleep 2

  # Backup current standalone (if exists)
  if [ -d "$DEPLOY_DIR" ]; then
    rm -rf "${DEPLOY_DIR}.bak"
    mv "$DEPLOY_DIR" "${DEPLOY_DIR}.bak"
  fi

  # Extract new standalone
  mkdir -p "$DEPLOY_DIR"
  tar xzf "$DEPLOY_TMP/pi-chi-deploy.tar.gz" -C "$DEPLOY_DIR"

  # Copy env file if it exists
  if [ -f "$PI_CHI_DIR/.env.local" ]; then
    cp "$PI_CHI_DIR/.env.local" "$DEPLOY_DIR/.env.local"
  fi

  # Start dashboard
  sudo systemctl start pi-chi-dashboard
  echo "[deploy] Dashboard restarted"

  # Cleanup
  rm -rf "$DEPLOY_TMP"
}

# ── Health check ────────────────────────────────────────────────
health_check() {
  echo "[deploy] Running health check..."
  for i in $(seq 1 $HEALTH_CHECK_RETRIES); do
    sleep $HEALTH_CHECK_INTERVAL
    if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
      echo "[deploy] Health check passed!"
      return 0
    fi
    echo "[deploy] Health check attempt $i/$HEALTH_CHECK_RETRIES failed, retrying..."
  done

  echo "[deploy] Health check FAILED after $HEALTH_CHECK_RETRIES attempts"
  return 1
}

# ── Rollback on failure ─────────────────────────────────────────
rollback() {
  echo "[deploy] Rolling back to previous version..."
  if [ -d "${DEPLOY_DIR}.bak" ]; then
    sudo systemctl stop pi-chi-dashboard 2>/dev/null || true
    rm -rf "$DEPLOY_DIR"
    mv "${DEPLOY_DIR}.bak" "$DEPLOY_DIR"
    sudo systemctl start pi-chi-dashboard
    sleep 5
    if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
      echo "[deploy] Rollback successful"
    else
      echo "[deploy] Rollback also failed — manual intervention needed"
    fi
  else
    echo "[deploy] No backup available for rollback"
  fi
}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

echo "[deploy] Pi-Chi Self-Deploy starting..."
echo "[deploy] Token: ${TOKEN:0:8}..."

RUN_ID=""

if [ "${1:-}" = "--wait" ]; then
  # Wait for the build triggered by our push
  RUN_ID=$(wait_for_run)
  if [ -z "$RUN_ID" ] || [ "$RUN_ID" = "1" ]; then
    echo "[deploy] Failed to get completed run"
    exit 1
  fi
else
  # Use the latest successful run
  RUN_ID=$(get_latest_run)
  if [ -z "$RUN_ID" ]; then
    echo "[deploy] No successful runs found"
    exit 2
  fi
fi

# Download
if ! download_artifact "$RUN_ID"; then
  echo "[deploy] Artifact download failed"
  exit 1
fi

# Deploy
if ! deploy; then
  echo "[deploy] Deploy failed"
  rollback
  exit 1
fi

# Health check
if ! health_check; then
  echo "[deploy] Unhealthy after deploy"
  rollback
  exit 1
fi

# Clean up backup
rm -rf "${DEPLOY_DIR}.bak"

echo "[deploy] Self-deploy complete!"
exit 0
