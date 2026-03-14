#!/bin/bash
ACTION="$1"
IFACE="$2"

case "$ACTION" in
  restart)
    echo "Restarting $IFACE..."
    sudo ip link set "$IFACE" down
    sleep 2
    sudo ip link set "$IFACE" up
    sleep 3
    echo "Interface $IFACE restarted"
    ip addr show "$IFACE" | grep inet
    ;;
  reconnect)
    echo "Reconnecting WiFi on $IFACE..."
    if command -v nmcli &>/dev/null; then
      nmcli device disconnect "$IFACE" 2>/dev/null
      sleep 2
      nmcli device connect "$IFACE" 2>/dev/null
    else
      wpa_cli -i "$IFACE" reconnect 2>/dev/null
    fi
    sleep 5
    echo "WiFi status:"
    iwgetid 2>/dev/null
    ip addr show "$IFACE" | grep inet
    ;;
  flush)
    echo "Flushing DNS cache..."
    sudo systemd-resolve --flush-caches 2>/dev/null || sudo resolvectl flush-caches 2>/dev/null || echo "No systemd-resolved to flush"
    echo "DNS cache flushed"
    ;;
  dhcp)
    echo "Renewing DHCP lease..."
    sudo dhclient -r "$IFACE" 2>/dev/null
    sudo dhclient "$IFACE" 2>/dev/null
    echo "DHCP renewed"
    ip addr show "$IFACE" | grep inet
    ;;
  *)
    echo "Error: action must be restart, reconnect, flush, or dhcp"
    exit 1
    ;;
esac
