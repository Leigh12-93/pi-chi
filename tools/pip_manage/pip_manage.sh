#!/bin/bash
ACTION="$1"
PACKAGES="$2"

case "$ACTION" in
  install)
    pip3 install $PACKAGES 2>&1 | tail -5
    echo "Installed: $PACKAGES"
    ;;
  list)
    pip3 list 2>/dev/null | head -40
    echo "..."
    echo "Total: $(pip3 list 2>/dev/null | wc -l) packages"
    ;;
  outdated)
    echo "=== Outdated Packages ==="
    pip3 list --outdated 2>/dev/null | head -20
    ;;
  uninstall)
    pip3 uninstall -y $PACKAGES 2>&1 | tail -3
    echo "Uninstalled: $PACKAGES"
    ;;
  show)
    pip3 show $PACKAGES 2>/dev/null
    ;;
  *)
    echo "Error: action must be install, list, outdated, uninstall, or show"
    exit 1
    ;;
esac
