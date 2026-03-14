#!/bin/bash
FILENAME="$1"
WIDTH="$2"
HEIGHT="$3"
DATA_DIR="/home/pi/.pi-chi/data"
mkdir -p "$DATA_DIR"
FILEPATH="${DATA_DIR}/${FILENAME}"

# Try libcamera (Pi OS Bookworm+), then raspistill (legacy)
if command -v libcamera-still &>/dev/null; then
  libcamera-still -o "$FILEPATH" --width "$WIDTH" --height "$HEIGHT" -t 2000 --nopreview 2>/dev/null
  echo "Captured via libcamera-still: $FILEPATH"
elif command -v rpicam-still &>/dev/null; then
  rpicam-still -o "$FILEPATH" --width "$WIDTH" --height "$HEIGHT" -t 2000 --nopreview 2>/dev/null
  echo "Captured via rpicam-still: $FILEPATH"
elif command -v raspistill &>/dev/null; then
  raspistill -o "$FILEPATH" -w "$WIDTH" -h "$HEIGHT" -t 2000 2>/dev/null
  echo "Captured via raspistill: $FILEPATH"
else
  # Try fswebcam for USB cameras
  if command -v fswebcam &>/dev/null; then
    fswebcam -r "${WIDTH}x${HEIGHT}" --no-banner "$FILEPATH" 2>/dev/null
    echo "Captured via fswebcam (USB): $FILEPATH"
  else
    echo "No camera tool available. Install one of:"
    echo "  sudo apt install rpicam-apps  (Pi camera)"
    echo "  sudo apt install fswebcam     (USB camera)"
    exit 1
  fi
fi

if [ -f "$FILEPATH" ]; then
  SIZE=$(ls -lh "$FILEPATH" | awk '{print $5}')
  echo "Size: $SIZE"
  echo "Resolution: ${WIDTH}x${HEIGHT}"
fi
