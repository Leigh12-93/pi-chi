#!/bin/bash
set -euo pipefail

STATE_FILE="${HOME:-/home/pi}/.pi-chi/display-mode.json"
BRAIN_STATE="${HOME:-/home/pi}/.pi-chi/brain-state.json"

compact() {
  local s="$1"
  local max="${2:-34}"
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
  IFS=$'\t' read -r MODE PROVIDER REASON MISSION DETAIL UPDATED THOUGHT LAST_THOUGHT A1 A2 A3 <<< "$(python3 - "$STATE_FILE" "$BRAIN_STATE" <<'PY'
import json, pathlib, sys
state_path = pathlib.Path(sys.argv[1])
brain_path = pathlib.Path(sys.argv[2])
state = {}
brain = {}
if state_path.exists():
    try: state = json.loads(state_path.read_text())
    except Exception: state = {}
if brain_path.exists():
    try: brain = json.loads(brain_path.read_text())
    except Exception: brain = {}
vals = []
for key in ('mode', 'provider', 'reason', 'missionTitle', 'detail', 'updatedAt', 'sinceThought'):
    val = state.get(key, '')
    if val is None: val = ''
    vals.append(str(val).replace('\t', ' ').replace('\n', ' '))
last_thought = str(brain.get('lastThought', '') or '').replace('\t', ' ').replace('\n', ' ')
vals.append(last_thought)
acts = []
for item in (brain.get('activityLog') or [])[-3:]:
    msg = str(item.get('message', '') or '').replace('\t', ' ').replace('\n', ' ')
    acts.append(msg)
while len(acts) < 3:
    acts.insert(0, '')
vals.extend(acts[-3:])
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
  printf '  %s\n' "$HEADER"
  printf '  %s\n\n' "$STATUS"

  printf '  NOW:    %s\n' "$(compact "${MISSION:-${REASON:-Working}}" 28)"
  printf '  DETAIL: %s\n' "$(compact "${DETAIL:-${LAST_THOUGHT:-Waiting}}" 28)"
  if [ -n "${THOUGHT:-}" ]; then
    printf '  CYCLE:  #%s\n' "$THOUGHT"
  fi
  printf '  TIME:   %s\n' "$NOW"
  printf '  TEMP:   %s\n' "$TEMP"
  printf '  MEM:    %s\n' "$MEM"
  printf '  LOAD:   %s\n\n' "${LOAD:-unknown}"

  printf '  RECENT:\n'
  [ -n "${A1:-}" ] && printf '   - %s\n' "$(compact "$A1" 30)"
  [ -n "${A2:-}" ] && printf '   - %s\n' "$(compact "$A2" 30)"
  [ -n "${A3:-}" ] && printf '   - %s\n' "$(compact "$A3" 30)"

  if [ "$MODE" = 'fix-auth' ]; then
    printf '\n  Brain stays alive on Codex.\n'
    printf '  Auto-switches back when Claude recovers.\n'
  fi
  sleep 5
done
