#!/bin/bash
ACTION="$1"
PACKAGES="$2"

case "$ACTION" in
  install)
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y $PACKAGES 2>&1 | tail -10
    echo "Install complete: $PACKAGES"
    ;;
  remove)
    sudo apt-get remove -y $PACKAGES 2>&1 | tail -5
    echo "Removed: $PACKAGES"
    ;;
  update)
    sudo apt-get update 2>&1 | tail -5
    echo "Package lists updated"
    ;;
  upgrade)
    sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y 2>&1 | tail -10
    echo "System upgraded"
    ;;
  search)
    apt-cache search "$PACKAGES" | head -20
    ;;
  autoremove)
    sudo apt-get autoremove -y 2>&1 | tail -5
    sudo apt-get autoclean 2>&1
    echo "Autoremove complete"
    ;;
  info)
    apt-cache show $PACKAGES 2>/dev/null | head -20
    ;;
  *)
    echo "Error: action must be install, remove, update, upgrade, search, autoremove, or info"
    exit 1
    ;;
esac
