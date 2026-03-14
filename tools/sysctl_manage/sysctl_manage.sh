#!/bin/bash
ACTION="$1"
KEY="$2"
VALUE="$3"

case "$ACTION" in
  get)
    sysctl "$KEY" 2>/dev/null
    ;;
  set)
    sudo sysctl -w "$KEY=$VALUE" 2>&1
    echo "Set $KEY = $VALUE (runtime only)"
    echo "To persist: add to /etc/sysctl.conf"
    ;;
  search)
    sysctl -a 2>/dev/null | grep -i "$KEY" | head -20
    ;;
  all)
    echo "=== Key Kernel Parameters ==="
    for p in vm.swappiness vm.dirty_ratio net.ipv4.ip_forward net.ipv4.tcp_syncookies kernel.hostname kernel.domainname; do
      VAL=$(sysctl -n "$p" 2>/dev/null)
      printf "  %-35s %s\n" "$p" "$VAL"
    done
    ;;
  *)
    echo "Error: action must be get, set, search, or all"
    exit 1
    ;;
esac
