#!/bin/bash
ACTION="$1"
RULE="$2"

case "$ACTION" in
  status)
    sudo ufw status verbose 2>/dev/null || echo "UFW not installed"
    ;;
  enable)
    echo "y" | sudo ufw enable 2>&1
    echo "Firewall enabled"
    ;;
  disable)
    sudo ufw disable 2>&1
    echo "Firewall disabled"
    ;;
  allow)
    sudo ufw allow $RULE 2>&1
    echo "Allowed: $RULE"
    sudo ufw status | tail -5
    ;;
  deny)
    sudo ufw deny $RULE 2>&1
    echo "Denied: $RULE"
    ;;
  delete)
    sudo ufw delete allow $RULE 2>&1
    echo "Deleted rule: $RULE"
    ;;
  reset)
    echo "y" | sudo ufw reset 2>&1
    echo "Firewall reset to defaults"
    ;;
  *)
    echo "Error: action must be status, enable, disable, allow, deny, delete, or reset"
    exit 1
    ;;
esac
