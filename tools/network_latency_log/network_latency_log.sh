#!/bin/bash
TARGETS="$1"
DATA_DIR="/home/pi/.pi-chi/data"
FILE="${DATA_DIR}/latency.csv"
mkdir -p "$DATA_DIR"

IFS=',' read -ra HOSTS <<< "$TARGETS"
HEADER="timestamp"
for h in "${HOSTS[@]}"; do
  HEADER="${HEADER},${h}_ms"
done

if [ ! -f "$FILE" ]; then
  echo "$HEADER" > "$FILE"
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
ROW="$TIMESTAMP"

echo "=== Latency Check ==="
for h in "${HOSTS[@]}"; do
  LATENCY=$(ping -c 3 -W 3 "$h" 2>/dev/null | tail -1 | awk -F'/' '{print $5}')
  if [ -z "$LATENCY" ]; then
    LATENCY="-1"
    echo "  $h: UNREACHABLE"
  else
    echo "  $h: ${LATENCY}ms avg"
  fi
  ROW="${ROW},${LATENCY}"
done

echo "$ROW" >> "$FILE"
echo ""
echo "Logged to latency.csv"
echo "Total entries: $(($(wc -l < "$FILE") - 1))"
