#!/bin/bash
ACTION="$1"
REPO="$2"
DEST="$3"

case "$ACTION" in
  clone)
    if [ "$DEST" = "none" ]; then
      DEST="/home/pi/pi-chi-projects/$(basename "$REPO" .git)"
    fi
    mkdir -p "$(dirname "$DEST")"
    git clone "$REPO" "$DEST" 2>&1 | tail -5
    echo "Cloned to: $DEST"
    ;;
  pull)
    cd "$REPO" && git pull 2>&1
    echo "Updated: $REPO"
    ;;
  status)
    cd "$REPO" && git status -sb 2>&1
    echo ""
    git log --oneline -3 2>/dev/null
    ;;
  *)
    echo "Error: action must be clone, pull, or status"
    exit 1
    ;;
esac
