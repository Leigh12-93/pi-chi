#!/bin/bash
SORT_BY="$1"
LIMIT="$2"

if [ "$SORT_BY" = "cpu" ]; then
  SORT_KEY="-%cpu"
elif [ "$SORT_BY" = "mem" ]; then
  SORT_KEY="-%mem"
else
  echo "Error: sort_by must be 'cpu' or 'mem'"
  exit 1
fi

echo "=== Top $LIMIT processes by $SORT_BY ==="
ps aux --sort="$SORT_KEY" | head -n $(( LIMIT + 1 )) | awk '{printf "%-10s %5s %5s %s\n", $1, $3, $4, $11}'
echo ""
echo "Load average: $(cat /proc/loadavg | awk '{print $1, $2, $3}')"
echo "Uptime: $(uptime -p)"
