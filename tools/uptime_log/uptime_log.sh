#!/bin/bash
DATA_DIR="/home/pi/.pi-chi/data"
FILE="${DATA_DIR}/uptime.csv"
mkdir -p "$DATA_DIR"

if [ ! -f "$FILE" ]; then
  echo "timestamp,uptime_sec,load_1m,load_5m,load_15m,users" > "$FILE"
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
UPTIME_SEC=$(awk '{print int($1)}' /proc/uptime)
LOADS=$(cat /proc/loadavg | awk '{print $1","$2","$3}')
USERS=$(who 2>/dev/null | wc -l)

echo "${TIMESTAMP},${UPTIME_SEC},${LOADS},${USERS}" >> "$FILE"

UPTIME_DAYS=$((UPTIME_SEC / 86400))
UPTIME_HRS=$(( (UPTIME_SEC % 86400) / 3600 ))

echo "=== Uptime Log ==="
echo "Uptime: ${UPTIME_DAYS}d ${UPTIME_HRS}h"
echo "Load: $(cat /proc/loadavg | awk '{print $1, $2, $3}')"
echo "Users: $USERS"
echo "Logged at: $TIMESTAMP"
echo "Total entries: $(($(wc -l < "$FILE") - 1))"
