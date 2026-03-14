#!/bin/bash
ACTION="$1"
SCHEDULE="$2"
COMMAND="$3"

case "$ACTION" in
  list)
    echo "=== Current Crontab ==="
    crontab -l 2>/dev/null || echo "No crontab for $(whoami)"
    ;;
  add)
    if [ "$SCHEDULE" = "none" ] || [ "$COMMAND" = "none" ]; then
      echo "Error: schedule and command required for add"
      exit 1
    fi
    EXISTING=$(crontab -l 2>/dev/null || true)
    # Check for duplicate
    if echo "$EXISTING" | grep -qF "$COMMAND"; then
      echo "Warning: A cron job with this command already exists:"
      echo "$EXISTING" | grep -F "$COMMAND"
      exit 1
    fi
    (echo "$EXISTING"; echo "$SCHEDULE $COMMAND") | crontab -
    echo "Added cron job: $SCHEDULE $COMMAND"
    echo ""
    echo "=== Updated Crontab ==="
    crontab -l
    ;;
  remove)
    if [ "$COMMAND" = "none" ]; then
      SEARCH="$SCHEDULE"
    else
      SEARCH="$COMMAND"
    fi
    EXISTING=$(crontab -l 2>/dev/null)
    if [ -z "$EXISTING" ]; then
      echo "No crontab to modify"
      exit 0
    fi
    MATCH=$(echo "$EXISTING" | grep -F "$SEARCH")
    if [ -z "$MATCH" ]; then
      echo "No cron job matching: $SEARCH"
      exit 1
    fi
    echo "Removing: $MATCH"
    echo "$EXISTING" | grep -vF "$SEARCH" | crontab -
    echo ""
    echo "=== Updated Crontab ==="
    crontab -l 2>/dev/null || echo "(empty)"
    ;;
  *)
    echo "Error: action must be list, add, or remove"
    exit 1
    ;;
esac
