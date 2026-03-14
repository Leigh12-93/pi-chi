#!/bin/bash
TEXT="$1"
OUTPUT="$2"
DATA_DIR="/home/pi/.pi-chi/data"
mkdir -p "$DATA_DIR"
FILEPATH="${DATA_DIR}/${OUTPUT}"

if command -v pico2wave &>/dev/null; then
  pico2wave -w "$FILEPATH" "$TEXT" 2>/dev/null
  echo "Generated via pico2wave: $FILEPATH"
elif command -v espeak &>/dev/null; then
  espeak -w "$FILEPATH" "$TEXT" 2>/dev/null
  echo "Generated via espeak: $FILEPATH"
elif command -v espeak-ng &>/dev/null; then
  espeak-ng -w "$FILEPATH" "$TEXT" 2>/dev/null
  echo "Generated via espeak-ng: $FILEPATH"
else
  echo "No TTS engine available. Install one:"
  echo "  sudo apt install espeak-ng"
  echo "  sudo apt install libttspico-utils"
  exit 1
fi

if [ -f "$FILEPATH" ]; then
  SIZE=$(ls -lh "$FILEPATH" | awk '{print $5}')
  echo "File size: $SIZE"
  # Play if aplay available
  if command -v aplay &>/dev/null; then
    aplay "$FILEPATH" 2>/dev/null && echo "Played audio" || echo "Audio saved (no audio output device)"
  fi
fi
