#!/bin/bash
ACTION="$1"
TARGET="$2"

STATE_DIR="/home/pi/.pi-chi/state"
CONFIG_DIR="/home/pi/pi-chi"

case "$ACTION" in
  read)
    if [ "$TARGET" = "all" ]; then
      echo "=== Brain State Files ==="
      ls -la "$STATE_DIR"/ 2>/dev/null
      echo ""
      for f in "$STATE_DIR"/*; do
        if [ -f "$f" ]; then
          echo "--- $(basename "$f") ---"
          head -20 "$f"
          echo ""
        fi
      done
    else
      FILE="$STATE_DIR/$TARGET"
      if [ -f "$FILE" ]; then
        cat "$FILE"
      else
        echo "State file not found: $FILE"
        echo "Available:"
        ls "$STATE_DIR"/ 2>/dev/null
      fi
    fi
    ;;
  goals)
    echo "=== Current Goals ==="
    cat "$STATE_DIR/goals.json" 2>/dev/null || cat "$STATE_DIR/goals" 2>/dev/null || echo "No goals file found"
    ;;
  activity)
    echo "=== Recent Activity ==="
    cat "$STATE_DIR/activity.json" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); [print(f'{a.get(\"time\",\"?\")} [{a.get(\"type\",\"?\")}] {a.get(\"description\",\"?\")}') for a in (d if isinstance(d,list) else d.get('activities',[]))[-20:]]" 2>/dev/null || cat "$STATE_DIR/activity"* 2>/dev/null | tail -20 || echo "No activity log"
    ;;
  personality)
    echo "=== Personality Config ==="
    cat "$STATE_DIR/personality.json" 2>/dev/null || cat "$CONFIG_DIR/personality.json" 2>/dev/null || echo "No personality config"
    ;;
  config)
    echo "=== Brain Config ==="
    for f in "$CONFIG_DIR"/.env "$CONFIG_DIR"/config.json "$CONFIG_DIR"/package.json; do
      if [ -f "$f" ]; then
        echo "--- $(basename "$f") ---"
        head -30 "$f"
        echo ""
      fi
    done
    ;;
  *)
    echo "Error: action must be read, goals, activity, personality, or config"
    exit 1
    ;;
esac
