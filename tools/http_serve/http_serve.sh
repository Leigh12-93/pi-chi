#!/bin/bash
DIR="$1"
PORT="$2"
DURATION="$3"

# Cap at 55 seconds (tool timeout is 60)
if [ "$DURATION" -gt 55 ]; then
  DURATION=55
fi

if [ ! -d "$DIR" ]; then
  echo "Error: Directory $DIR does not exist"
  exit 1
fi

IP=$(hostname -I | awk '{print $1}')
echo "Starting HTTP server at http://${IP}:${PORT}"
echo "Serving: $DIR"
echo "Duration: ${DURATION}s"
echo ""

cd "$DIR"
timeout "$DURATION" python3 -m http.server "$PORT" 2>&1 &
PID=$!
sleep 1

if kill -0 "$PID" 2>/dev/null; then
  echo "Server running (PID: $PID)"
  echo "Access at: http://${IP}:${PORT}"
  wait "$PID" 2>/dev/null
  echo "Server stopped after ${DURATION}s timeout"
else
  echo "Failed to start server (port $PORT may be in use)"
  exit 1
fi
