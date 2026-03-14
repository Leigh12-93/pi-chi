#!/bin/bash
FILE="$1"
VALUES="$2"
HEADER="$3"
DATA_DIR="/home/pi/.pi-chi/data"

mkdir -p "$DATA_DIR"
FILEPATH="${DATA_DIR}/${FILE}"

# Add header if file doesn't exist
if [ ! -f "$FILEPATH" ]; then
  echo "timestamp,${HEADER}" > "$FILEPATH"
  echo "Created new CSV: $FILEPATH"
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "${TIMESTAMP},${VALUES}" >> "$FILEPATH"

ROWS=$(wc -l < "$FILEPATH")
echo "Logged to ${FILE}: ${TIMESTAMP},${VALUES}"
echo "Total rows: $((ROWS - 1))"
