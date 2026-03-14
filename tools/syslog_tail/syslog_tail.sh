#!/bin/bash
LINES="$1"
FILTER="$2"

echo "=== System Log (last $LINES entries) ==="
if [ "$FILTER" = "all" ]; then
  journalctl -n "$LINES" --no-pager 2>/dev/null || tail -n "$LINES" /var/log/syslog 2>/dev/null || tail -n "$LINES" /var/log/messages 2>/dev/null
else
  echo "Filter: $FILTER"
  echo ""
  journalctl -n "$LINES" --no-pager 2>/dev/null | grep -i "$FILTER" || \
    tail -n "$LINES" /var/log/syslog 2>/dev/null | grep -i "$FILTER" || \
    echo "No matches for '$FILTER'"
fi
