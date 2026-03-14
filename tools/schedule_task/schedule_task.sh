#!/bin/bash
ACTION="$1"
TIME_SPEC="$2"
COMMAND="$3"

case "$ACTION" in
  list)
    echo "=== Scheduled Tasks ==="
    atq 2>/dev/null || echo "No 'at' daemon available (install: sudo apt install at)"
    ;;
  add)
    if [ "$TIME_SPEC" = "none" ] || [ "$COMMAND" = "none" ]; then
      echo "Error: time_spec and command required"
      exit 1
    fi
    echo "$COMMAND" | at "$TIME_SPEC" 2>&1
    echo ""
    echo "=== Updated Queue ==="
    atq 2>/dev/null
    ;;
  remove)
    JOB_ID="$COMMAND"
    if [ "$JOB_ID" = "none" ]; then
      JOB_ID="$TIME_SPEC"
    fi
    atrm "$JOB_ID" 2>/dev/null && echo "Removed job $JOB_ID" || echo "Failed to remove job $JOB_ID"
    echo ""
    echo "=== Updated Queue ==="
    atq 2>/dev/null
    ;;
  *)
    echo "Error: action must be list, add, or remove"
    exit 1
    ;;
esac
