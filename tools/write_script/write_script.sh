#!/bin/bash
FILEPATH="$1"
CONTENT="$2"
EXECUTABLE="$3"

# Security: only allow writing to safe directories
ALLOWED=0
case "$FILEPATH" in
  /home/pi/.pi-chi/*) ALLOWED=1 ;;
  /home/pi/pi-chi-projects/*) ALLOWED=1 ;;
  /home/pi/pi-chi/*) ALLOWED=1 ;;
  /tmp/*) ALLOWED=1 ;;
esac

if [ "$ALLOWED" -eq 0 ]; then
  echo "Error: Can only write to ~/.pi-chi/, ~/pi-chi/, ~/pi-chi-projects/, or /tmp/"
  exit 1
fi

# Create parent directory
mkdir -p "$(dirname "$FILEPATH")"

# Write content (decode \n to actual newlines)
printf '%b' "$CONTENT" > "$FILEPATH"

if [ "$EXECUTABLE" = "yes" ]; then
  chmod +x "$FILEPATH"
fi

echo "Written: $FILEPATH"
echo "Size: $(ls -lh "$FILEPATH" | awk '{print $5}')"
echo "Executable: $EXECUTABLE"
