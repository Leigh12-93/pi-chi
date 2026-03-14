#!/bin/bash
ACTION="$1"
RULE="$2"

case "$ACTION" in
  list)
    echo "=== iptables Rules ==="
    sudo iptables -L -n -v --line-numbers 2>/dev/null
    echo ""
    echo "=== NAT ==="
    sudo iptables -t nat -L -n -v 2>/dev/null
    ;;
  add)
    sudo iptables $RULE 2>&1
    echo "Rule added"
    ;;
  delete)
    sudo iptables $RULE 2>&1
    echo "Rule deleted"
    ;;
  save)
    sudo iptables-save > /etc/iptables.rules 2>/dev/null
    echo "Rules saved to /etc/iptables.rules"
    ;;
  restore)
    sudo iptables-restore < /etc/iptables.rules 2>/dev/null
    echo "Rules restored from /etc/iptables.rules"
    ;;
  flush)
    sudo iptables -F
    sudo iptables -X
    sudo iptables -P INPUT ACCEPT
    sudo iptables -P FORWARD ACCEPT
    sudo iptables -P OUTPUT ACCEPT
    echo "All rules flushed, policies set to ACCEPT"
    ;;
  *)
    echo "Error: action must be list, add, delete, save, restore, or flush"
    exit 1
    ;;
esac
