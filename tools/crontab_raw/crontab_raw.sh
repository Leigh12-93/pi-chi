#!/bin/bash
USER="$1"
ACTION="$2"
ENTRY="$3"

case "$ACTION" in
  list)
    echo "=== Crontab for $USER ==="
    sudo crontab -u "$USER" -l 2>/dev/null || echo "No crontab for $USER"
    ;;
  add)
    EXISTING=$(sudo crontab -u "$USER" -l 2>/dev/null || true)
    (echo "$EXISTING"; echo "$ENTRY") | sudo crontab -u "$USER" -
    echo "Added to $USER crontab: $ENTRY"
    ;;
  remove)
    EXISTING=$(sudo crontab -u "$USER" -l 2>/dev/null)
    echo "$EXISTING" | grep -v "$ENTRY" | sudo crontab -u "$USER" -
    echo "Removed entries matching '$ENTRY' from $USER crontab"
    ;;
  *)
    echo "Error: action must be list, add, or remove"
    exit 1
    ;;
esac
