#!/bin/bash
set -euo pipefail

PI_HOME="${HOME:-/home/pi}"
REPO_DIR="${PI_HOME}/pi-chi"
DASHBOARD_URL="${PI_CHI_DASHBOARD_URL:-http://127.0.0.1:3333}"

export XDG_SESSION_TYPE=wayland
export XDG_CURRENT_DESKTOP=cage
export MOZ_ENABLE_WAYLAND=1
export LIBSEAT_BACKEND=logind

if command -v chromium-browser >/dev/null 2>&1; then
  CHROMIUM_BIN="chromium-browser"
elif command -v chromium >/dev/null 2>&1; then
  CHROMIUM_BIN="chromium"
else
  echo "[pi-chi-kiosk] Chromium not found."
  exit 1
fi

for _ in $(seq 1 60); do
  if curl -fsS "${DASHBOARD_URL}" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

cd "${REPO_DIR}"

exec cage -- "${CHROMIUM_BIN}" \
  --kiosk \
  --app="${DASHBOARD_URL}" \
  --ozone-platform=wayland \
  --enable-features=UseOzonePlatform \
  --disable-session-crashed-bubble \
  --disable-infobars \
  --disable-background-networking \
  --disable-background-timer-throttling \
  --disable-breakpad \
  --disable-component-update \
  --disable-default-apps \
  --disable-features=Translate,MediaRouter,OptimizationHints,ProcessPerSiteUpToMainFrameThreshold \
  --disable-renderer-backgrounding \
  --disable-sync \
  --disable-translate \
  --enable-low-end-device-mode \
  --force-device-scale-factor=1 \
  --memory-pressure-off \
  --no-default-browser-check \
  --no-first-run \
  --password-store=basic \
  --disk-cache-size=33554432 \
  --media-cache-size=33554432
