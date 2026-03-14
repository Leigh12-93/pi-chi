#!/bin/bash
MODE="$1"
TARGET="$2"

case "$MODE" in
  name)
    echo "=== Processes matching '$TARGET' ==="
    PIDS=$(pgrep -f "$TARGET" 2>/dev/null)
    if [ -z "$PIDS" ]; then
      echo "No processes found matching '$TARGET'"
      exit 0
    fi
    ps -p $(echo "$PIDS" | tr '\n' ',') -o pid,ppid,user,%cpu,%mem,cmd 2>/dev/null
    echo ""
    echo "Sending SIGTERM..."
    pkill -f "$TARGET" && echo "Killed processes matching '$TARGET'" || echo "Failed to kill"
    ;;
  pid)
    echo "=== Process PID $TARGET ==="
    ps -p "$TARGET" -o pid,ppid,user,%cpu,%mem,cmd 2>/dev/null || { echo "PID $TARGET not found"; exit 1; }
    echo ""
    kill "$TARGET" && echo "Sent SIGTERM to PID $TARGET" || echo "Failed to kill PID $TARGET"
    ;;
  port)
    echo "=== Process on port $TARGET ==="
    PID=$(ss -tlnp "sport = :$TARGET" 2>/dev/null | awk 'NR>1{match($0,/pid=([0-9]+)/,a); print a[1]}' | head -1)
    if [ -z "$PID" ]; then
      PID=$(fuser "$TARGET/tcp" 2>/dev/null | awk '{print $1}')
    fi
    if [ -z "$PID" ]; then
      echo "No process found on port $TARGET"
      exit 0
    fi
    ps -p "$PID" -o pid,ppid,user,%cpu,%mem,cmd 2>/dev/null
    echo ""
    kill "$PID" && echo "Killed PID $PID on port $TARGET" || echo "Failed to kill"
    ;;
  *)
    echo "Error: mode must be name, pid, or port"
    exit 1
    ;;
esac
