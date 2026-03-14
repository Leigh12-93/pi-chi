#!/bin/bash
ACTION="$1"
KEY="$2"
VALUE="$3"
CLIP_DIR="/home/pi/.pi-chi/data/clipboard"
mkdir -p "$CLIP_DIR"

case "$ACTION" in
  set)
    echo "$VALUE" > "${CLIP_DIR}/${KEY}"
    echo "Saved: $KEY = $VALUE"
    ;;
  get)
    if [ -f "${CLIP_DIR}/${KEY}" ]; then
      echo "$(cat "${CLIP_DIR}/${KEY}")"
    else
      echo "Key '$KEY' not found"
      exit 1
    fi
    ;;
  list)
    echo "=== Clipboard Contents ==="
    for f in "$CLIP_DIR"/*; do
      if [ -f "$f" ]; then
        NAME=$(basename "$f")
        VAL=$(cat "$f")
        printf "  %-20s %s\n" "$NAME" "$VAL"
      fi
    done
    COUNT=$(ls -1 "$CLIP_DIR" 2>/dev/null | wc -l)
    echo ""
    echo "Total entries: $COUNT"
    ;;
  delete)
    if [ -f "${CLIP_DIR}/${KEY}" ]; then
      rm "${CLIP_DIR}/${KEY}"
      echo "Deleted: $KEY"
    else
      echo "Key '$KEY' not found"
    fi
    ;;
  *)
    echo "Error: action must be set, get, list, or delete"
    exit 1
    ;;
esac
