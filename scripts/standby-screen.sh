#!/bin/bash
set -euo pipefail

STATE_FILE="${HOME:-/home/pi}/.pi-chi/display-mode.json"

read_reason() {
  if [ -f "$STATE_FILE" ]; then
    grep -o '"reason"[[:space:]]*:[[:space:]]*"[^"]*"' "$STATE_FILE" | sed 's/.*"reason"[[:space:]]*:[[:space:]]*"\([^"]*\)"/\1/' | head -n 1
  fi
}

read_field() {
  local field="$1"
  if [ -f "$STATE_FILE" ]; then
    grep -o "\"${field}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$STATE_FILE" | sed "s/.*\"${field}\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\"/\1/" | head -n 1
  fi
}

read_numeric_field() {
  local field="$1"
  if [ -f "$STATE_FILE" ]; then
    grep -o "\"${field}\"[[:space:]]*:[[:space:]]*[0-9][0-9]*" "$STATE_FILE" | sed "s/.*\"${field}\"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\)/\1/" | head -n 1
  fi
}

clear
tput civis 2>/dev/null || true
trap 'tput cnorm 2>/dev/null || true; clear' EXIT

while true; do
  REASON="$(read_reason)"
  MISSION="$(read_field missionTitle)"
  DETAIL="$(read_field detail)"
  UPDATED="$(read_field updatedAt)"
  THOUGHT="$(read_numeric_field sinceThought)"
  NOW="$(date '+%Y-%m-%d %H:%M:%S')"
  LOAD="$(uptime 2>/dev/null | sed 's/.*load average: //')"
  MEM="$(awk '/MemAvailable/ {printf "%.0f MB available", $2/1024}' /proc/meminfo 2>/dev/null || echo 'memory unknown')"
  TEMP="$(vcgencmd measure_temp 2>/dev/null | sed 's/temp=//' || echo 'temp unknown')"

  printf '\033[H'
  printf '\033[2J'
  printf '\n'
  printf '  PI-CHI HEAVY TASK MODE\n\n'
  printf '  Dashboard paused to keep the Pi responsive.\n\n'
  printf '  Reason: %s\n' "${REASON:-High-load task running}"
  if [ -n "${MISSION:-}" ]; then
    printf '  Mission: %s\n' "$MISSION"
  fi
  if [ -n "${DETAIL:-}" ]; then
    printf '  Detail: %s\n' "$DETAIL"
  fi
  if [ -n "${THOUGHT:-}" ]; then
    printf '  Cycle:  #%s\n' "$THOUGHT"
  fi
  if [ -n "${UPDATED:-}" ]; then
    printf '  Since:  %s\n' "$UPDATED"
  fi
  printf '  Time:   %s\n' "$NOW"
  printf '  Temp:   %s\n' "$TEMP"
  printf '  Memory: %s\n' "$MEM"
  printf '  Load:   %s\n' "${LOAD:-unknown}"
  printf '\n'
  printf '  The full dashboard will return automatically when the task finishes.\n'
  printf '\n'
  sleep 5
done
