#!/bin/bash
set -euo pipefail

STATE_FILE="${HOME:-/home/pi}/.pi-chi/display-mode.json"
BRAIN_STATE="${HOME:-/home/pi}/.pi-chi/brain-state.json"

RESET='\033[0m'
BOLD='\033[1m'
WHITE='\033[1;97m'
CYAN='\033[1;96m'
GREEN='\033[1;92m'
YELLOW='\033[1;93m'
RED='\033[1;91m'
DIM='\033[2m'

scroll_text() {
  local s="$1"
  local max="${2:-28}"
  if [ ${#s} -le "$max" ]; then
    printf '%s' "$s"
    return
  fi
  local pad='   •   '
  local scroll="${s}${pad}"
  local full="${scroll}${scroll}"
  local len=${#scroll}
  local off=$(( ( $(date +%s) / 2 ) % len ))
  printf '%s' "${full:$off:$max}"
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
vals.append(str(brain.get('lastThought', '') or '').replace('\t', ' ').replace('\n', ' '))
acts = []
for item in (brain.get('activityLog') or [])[-3:]:
    acts.append(str(item.get('message', '') or '').replace('\t', ' ').replace('\n', ' '))
while len(acts) < 3:
    acts.insert(0, '')
vals.extend(acts[-3:])
print('\t'.join(vals))
PY
)"

  NOW="$(date '+%H:%M:%S')"
  LOAD="$(uptime 2>/dev/null | sed 's/.*load average: //')"
  MEM="$(awk '/MemAvailable/ {printf "%.0fMB FREE", $2/1024}' /proc/meminfo 2>/dev/null || echo '?')"
  TEMP="$(vcgencmd measure_temp 2>/dev/null | sed 's/temp=//' || echo '?')"

  HEADER='PI-CHI CLAUDE MODE'
  HCOL="$CYAN"
  STATUS='Claude active'
  if [ "$PROVIDER" = 'codex' ]; then
    HEADER='PI-CHI CODEX MODE'
    HCOL="$YELLOW"
    STATUS='Codex fallback active'
  fi
  if [ "$MODE" = 'fix-auth' ]; then
    HEADER='PI-CHI FIX AUTH'
    HCOL="$RED"
    STATUS='Claude unavailable'
  fi

  printf '\033[H\033[2J'
  printf "\n  ${BOLD}${HCOL}%s${RESET}\n" "$HEADER"
  printf "  ${WHITE}%s${RESET}\n\n" "$STATUS"
  printf "  ${BOLD}${WHITE}NOW${RESET}    %s\n" "$(scroll_text "${MISSION:-${REASON:-Working}}" 27)"
  printf "  ${BOLD}${WHITE}LAST${RESET}   %s\n" "$(scroll_text "${DETAIL:-${LAST_THOUGHT:-Waiting}}" 27)"
  if [ -n "${THOUGHT:-}" ]; then
    printf "  ${BOLD}${WHITE}CYCLE${RESET}  #%s\n" "$THOUGHT"
  fi
  printf "  ${BOLD}${WHITE}TIME${RESET}   %s\n" "$NOW"
  printf "  ${BOLD}${WHITE}TEMP${RESET}   %s\n" "$TEMP"
  printf "  ${BOLD}${WHITE}MEM${RESET}    %s\n" "$MEM"
  printf "  ${BOLD}${WHITE}LOAD${RESET}   %s\n\n" "${LOAD:-unknown}"
  printf "  ${BOLD}${HCOL}RECENT${RESET}\n"
  [ -n "${A1:-}" ] && printf "   ${WHITE}%s${RESET}\n" "$(scroll_text "$A1" 30)"
  [ -n "${A2:-}" ] && printf "   ${WHITE}%s${RESET}\n" "$(scroll_text "$A2" 30)"
  [ -n "${A3:-}" ] && printf "   ${WHITE}%s${RESET}\n" "$(scroll_text "$A3" 30)"
  if [ "$MODE" = 'fix-auth' ]; then
    printf "\n  ${YELLOW}Brain stays alive on Codex.${RESET}\n"
    printf "  ${YELLOW}Auto-switches back when Claude recovers.${RESET}\n"
  fi
  sleep 2
done
