#!/bin/bash
# CEC Remote → Keyboard Bridge for Pi-Chi Kiosk
# Translates HDMI-CEC remote button presses to keyboard events
# Works with Cage (Wayland) using wtype
#
# Install deps: sudo apt install -y cec-utils wtype
# Systemd: pi-chi-cec.service
#
# Button mappings:
#   Up/Down/Left/Right → Arrow keys
#   Select/OK          → Enter
#   Back/Return        → Escape
#   Play/Pause         → p (play/pause toggle)
#   Stop               → s
#   Channel Up          → PageUp (next tab)
#   Channel Down        → PageDown (prev tab)
#   Red                → r (refresh)
#   Green              → g
#   Blue               → b
#   Yellow             → y

set -uo pipefail

# Verify wtype is available
if ! command -v wtype &>/dev/null; then
  echo "ERROR: wtype not found. Install with: sudo apt install -y wtype"
  exit 1
fi

# Verify cec-client is available
if ! command -v cec-client &>/dev/null; then
  echo "ERROR: cec-client not found. Install with: sudo apt install -y cec-utils"
  exit 1
fi

# wtype needs WAYLAND_DISPLAY set - find it from the kiosk session
if [ -z "${WAYLAND_DISPLAY:-}" ]; then
  # Cage creates wayland-0 in /run/user/1000 (abstract socket)
  export XDG_RUNTIME_DIR=/run/user/1000
  export WAYLAND_DISPLAY=wayland-0
  echo "Using default Wayland display: $WAYLAND_DISPLAY in $XDG_RUNTIME_DIR"
fi

echo "Pi-Chi CEC Remote Bridge (bash/wtype)"
echo "WAYLAND_DISPLAY=${WAYLAND_DISPLAY:-unset}"
echo "XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-unset}"

# Debounce: track last key + time to avoid repeat floods
LAST_KEY=""
LAST_TIME=0
DEBOUNCE_MS=200

send_key() {
  local key="$1"
  local now
  now=$(date +%s%N | cut -b1-13)  # ms timestamp
  local elapsed=$(( now - LAST_TIME ))

  # Debounce same key within window
  if [ "$key" = "$LAST_KEY" ] && [ "$elapsed" -lt "$DEBOUNCE_MS" ]; then
    return
  fi

  LAST_KEY="$key"
  LAST_TIME="$now"

  echo "  -> wtype key: $key"
  wtype -k "$key" 2>/dev/null || echo "wtype failed for key: $key"
}

send_char() {
  local ch="$1"
  local now
  now=$(date +%s%N | cut -b1-13)
  local elapsed=$(( now - LAST_TIME ))

  if [ "$ch" = "$LAST_KEY" ] && [ "$elapsed" -lt "$DEBOUNCE_MS" ]; then
    return
  fi

  LAST_KEY="$ch"
  LAST_TIME="$now"

  echo "  -> wtype char: $ch"
  wtype "$ch" 2>/dev/null || echo "wtype failed for char: $ch"
}

# Main loop with auto-restart
while true; do
  echo "Starting cec-client -d 8 ..."

  # cec-client outputs lines like:
  # TRAFFIC:   << 01:44:01   (key pressed: up)
  # DEBUG:     key pressed: up (1)
  # DEBUG:     key released: up (1)

  cec-client -d 8 2>&1 | while IFS= read -r line; do
    # Only act on "key pressed" events (not released)
    if [[ "$line" == *"key pressed:"* ]]; then
      # Extract key name: "key pressed: select (0)" → "select"
      key=$(echo "$line" | sed 's/.*key pressed: \([a-z_ ]*\).*/\1/' | xargs)

      echo "CEC key pressed: $key"

      case "$key" in
        "up")
          send_key Up
          ;;
        "down")
          send_key Down
          ;;
        "left")
          send_key Left
          ;;
        "right")
          send_key Right
          ;;
        "select"|"enter")
          send_key Return
          ;;
        "exit"|"back"|"return")
          send_key Escape
          ;;
        "play")
          send_char "p"
          ;;
        "pause")
          send_char "p"
          ;;
        "stop")
          send_char "s"
          ;;
        "channel up"|"F3")
          send_key Prior
          ;;
        "channel down"|"F4")
          send_key Next
          ;;
        "F1"|"red")
          send_char "r"
          ;;
        "F2"|"green")
          send_char "g"
          ;;
        "blue"|"F5")
          send_char "b"
          ;;
        "yellow")
          send_char "y"
          ;;
        "volume up"|"volume down"|"mute")
          # Volume handled by TV hardware - ignore
          ;;
        *)
          echo "Unhandled CEC key: $key"
          ;;
      esac
    fi
  done

  echo "cec-client exited. Restarting in 3 seconds..."
  sleep 3
done
