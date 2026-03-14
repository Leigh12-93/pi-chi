#!/bin/bash
MODE="$1"
FILTER="$2"

case "$MODE" in
  recent)
    journalctl -u pi-chi-brain -n "$FILTER" --no-pager 2>/dev/null
    ;;
  errors)
    echo "=== Brain Errors (last 24h) ==="
    journalctl -u pi-chi-brain --since "24 hours ago" --no-pager 2>/dev/null | grep -iE "error|fail|exception|crash|fatal|ENOENT|ECONNREFUSED" | tail -30
    ;;
  search)
    echo "=== Brain Logs matching '$FILTER' ==="
    journalctl -u pi-chi-brain --since "24 hours ago" --no-pager 2>/dev/null | grep -i "$FILTER" | tail -30
    ;;
  *)
    echo "Error: mode must be recent, errors, or search"
    exit 1
    ;;
esac
