#!/bin/bash
ACTION="$1"
SERVICE="$2"

case "$ACTION" in
  start)
    sudo systemctl start "$SERVICE" && echo "$SERVICE started" || echo "Failed to start $SERVICE"
    systemctl is-active "$SERVICE"
    ;;
  stop)
    sudo systemctl stop "$SERVICE" && echo "$SERVICE stopped" || echo "Failed to stop $SERVICE"
    ;;
  restart)
    sudo systemctl restart "$SERVICE" && echo "$SERVICE restarted" || echo "Failed to restart $SERVICE"
    sleep 1
    systemctl is-active "$SERVICE"
    ;;
  enable)
    sudo systemctl enable "$SERVICE" && echo "$SERVICE enabled (will start on boot)"
    ;;
  disable)
    sudo systemctl disable "$SERVICE" && echo "$SERVICE disabled (won't start on boot)"
    ;;
  status)
    systemctl status "$SERVICE" --no-pager 2>/dev/null | head -20
    ;;
  logs)
    journalctl -u "$SERVICE" -n 30 --no-pager 2>/dev/null
    ;;
  list-failed)
    echo "=== Failed Services ==="
    systemctl list-units --state=failed --no-pager 2>/dev/null
    echo ""
    echo "=== All Custom Services ==="
    systemctl list-units --type=service --no-pager 2>/dev/null | grep -E "loaded active|loaded failed" | head -20
    ;;
  *)
    echo "Error: action must be start, stop, restart, enable, disable, status, logs, or list-failed"
    exit 1
    ;;
esac
