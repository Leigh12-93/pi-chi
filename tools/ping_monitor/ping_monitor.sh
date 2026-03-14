#!/bin/bash
HOST="$1"
COUNT="$2"

echo "=== Ping Monitor: $HOST ($COUNT pings) ==="
ping -c "$COUNT" -W 3 "$HOST" 2>/dev/null

EXIT=$?
if [ $EXIT -ne 0 ]; then
  echo "Host $HOST is UNREACHABLE"
fi
exit $EXIT
