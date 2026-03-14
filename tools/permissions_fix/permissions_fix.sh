#!/bin/bash
ACTION="$1"
PATH_ARG="$2"
MODE="$3"

case "$ACTION" in
  fix-owner)
    sudo chown -R pi:pi "$PATH_ARG"
    echo "Ownership set to pi:pi for $PATH_ARG"
    ls -la "$PATH_ARG" | head -5
    ;;
  chmod)
    chmod "$MODE" "$PATH_ARG"
    echo "Permissions set to $MODE for $PATH_ARG"
    ls -la "$PATH_ARG"
    ;;
  check)
    echo "=== Permissions: $PATH_ARG ==="
    ls -la "$PATH_ARG" 2>/dev/null
    echo ""
    if [ -d "$PATH_ARG" ]; then
      echo "--- Contents ---"
      ls -la "$PATH_ARG"/ | head -20
    fi
    echo ""
    echo "Numeric: $(stat -c '%a' "$PATH_ARG" 2>/dev/null)"
    echo "Owner: $(stat -c '%U:%G' "$PATH_ARG" 2>/dev/null)"
    ;;
  *)
    echo "Error: action must be fix-owner, chmod, or check"
    exit 1
    ;;
esac
