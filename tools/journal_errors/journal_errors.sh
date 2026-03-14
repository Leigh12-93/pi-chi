#!/bin/bash
PRIORITY="$1"
HOURS="$2"

echo "=== Journal Errors (priority >= $PRIORITY, last ${HOURS}h) ==="

journalctl --since "${HOURS} hours ago" -p "$PRIORITY" --no-pager -n 50 2>/dev/null

echo ""
echo "--- Summary ---"
for p in emerg alert crit err warning; do
  COUNT=$(journalctl --since "${HOURS} hours ago" -p "$p" --no-pager 2>/dev/null | grep -c "^")
  printf "  %-10s %d entries\n" "$p" "$COUNT"
done
