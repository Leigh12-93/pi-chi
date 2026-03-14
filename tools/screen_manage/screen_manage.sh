#!/bin/bash
ACTION="$1"
NAME="$2"
COMMAND="$3"
LOG_DIR="/home/pi/.pi-chi/data/sessions"
mkdir -p "$LOG_DIR"

case "$ACTION" in
  list)
    echo "=== Active Sessions ==="
    if command -v tmux &>/dev/null; then
      tmux list-sessions 2>/dev/null || echo "No tmux sessions"
    fi
    if command -v screen &>/dev/null; then
      screen -list 2>/dev/null || echo "No screen sessions"
    fi
    echo ""
    echo "=== Session Logs ==="
    ls -lh "$LOG_DIR"/*.log 2>/dev/null || echo "No logs"
    ;;
  start)
    LOG_FILE="${LOG_DIR}/${NAME}.log"
    if command -v tmux &>/dev/null; then
      tmux new-session -d -s "$NAME" "bash -c '$COMMAND' > '$LOG_FILE' 2>&1"
      echo "Started tmux session: $NAME"
      echo "Log: $LOG_FILE"
    elif command -v screen &>/dev/null; then
      screen -dmS "$NAME" bash -c "$COMMAND > $LOG_FILE 2>&1"
      echo "Started screen session: $NAME"
    else
      nohup bash -c "$COMMAND" > "$LOG_FILE" 2>&1 &
      echo "Started background process: PID $!"
      echo "Log: $LOG_FILE"
    fi
    ;;
  stop)
    if command -v tmux &>/dev/null; then
      tmux kill-session -t "$NAME" 2>/dev/null && echo "Killed tmux: $NAME" || echo "Session not found"
    fi
    if command -v screen &>/dev/null; then
      screen -X -S "$NAME" quit 2>/dev/null && echo "Killed screen: $NAME"
    fi
    ;;
  output)
    LOG_FILE="${LOG_DIR}/${NAME}.log"
    if [ -f "$LOG_FILE" ]; then
      echo "=== Last 30 lines of $NAME ==="
      tail -30 "$LOG_FILE"
    else
      echo "No log file for session: $NAME"
    fi
    ;;
  *)
    echo "Error: action must be list, start, stop, or output"
    exit 1
    ;;
esac
