#!/bin/bash
set -euo pipefail

STATE_FILE="${HOME:-/home/pi}/.pi-chi/display-mode.json"

compact() {
  local s="$1"
  local max="${2:-32}"
  if [ ${#s} -le "$max" ]; then
    printf '%s' "$s"
  else
    printf '%s...' "${s:0:$((max-3))}"
  fi
}

clear
tput civis 2>/dev/null || true
trap 'tput cnorm 2>/dev/null || true; clear' EXIT

while true; do
  IFS=$'\t' read -r MODE PROVIDER REASON MISSION DETAIL UPDATED THOUGHT <<< "$(python3 - "$STATE_FILE" <<'PY'
import json, pathlib, sys
path = pathlib.Path(sys.argv[1])
data = {}
if path.exists():
    try:
        data = json.loads(path.read_text())
    except Exception:
        data = {}
vals = []
for key in ('mode', 'provider', 'reason', 'missionTitle', 'detail', 'updatedAt', 'sinceThought'):
    val = data.get(key, '')
    if val is None:
        val = ''
    val = str(val).replace('\t', ' ').replace('\n', ' ')
    vals.append(val)
print('\t'.join(vals))
PY
)"

  NOW="$(date '+%H:%M:%S')"
  LOAD="$(uptime 2>/dev/null | sed 's/.*load average: //')"
  MEM="$(awk '/MemAvailable/ {printf "%.0fMB free", $2/1024}' /proc/meminfo 2>/dev/null || echo '?')"
  TEMP="$(vcgencmd measure_temp 2>/dev/null | sed 's/temp=//' || echo '?')"

  HEADER='PI-CHI CLAUDE MODE'
  STATUS='Claude active'
  if [ "$PROVIDER" = 'codex' ]; then
    HEADER='PI-CHI CODEX MODE'
    STATUS='Codex fallback active'
  fi
  if [ "$MODE" = 'fix-auth' ]; then
    HEADER='PI-CHI FIX AUTH'
    STATUS='Claude unavailable'
  fi

  printf '\033[H\033[2J\n'
  printf '  %s\n\n' "$HEADER"
  printf '  %s\n\n' "$STATUS"
  printf '  Reason: %s\n' "$(compact "${REASON:-Working}" 30)"
  if [ -n "${MISSION:-}" ]; then
    printf '  Goal:   %s\n' "$(compact "$MISSION" 30)"
  fi
  if [ -n "${DETAIL:-}" ]; then
    printf '  Detail: %s\n' "$(compact "$DETAIL" 30)"
  fi
  if [ -n "${THOUGHT:-}" ]; then
    printf '  Cycle:  #%s\n' "$THOUGHT"
  fi
  if [ -n "${UPDATED:-}" ]; then
    printf '  Since:  %s\n' "$(compact "$UPDATED" 22)"
  fi
  printf '  Time:   %s\n' "$NOW"
  printf '  Temp:   %s\n' "$TEMP"
  printf '  Memory: %s\n' "$MEM"
  printf '  Load:   %s\n\n' "${LOAD:-unknown}"

  if [ "$MODE" = 'fix-auth' ]; then
    printf '  Brain stays alive on Codex.\n'
    printf '  It will switch back to Claude automatically.\n'
  else
    printf '  Dashboard returns automatically when done.\n'
  fi
  printf '\n'
  sleep 5
done
