#!/bin/bash
ACTION="$1"

case "$ACTION" in
  status)
    echo "=== Swap Status ==="
    free -h | grep -E "^(Mem|Swap)"
    echo ""
    echo "--- Swap Devices ---"
    swapon --show 2>/dev/null || cat /proc/swaps
    echo ""
    echo "Swappiness: $(cat /proc/sys/vm/swappiness)"
    ;;
  top)
    echo "=== Top Swap Consumers ==="
    for pid in /proc/[0-9]*; do
      p=$(basename "$pid")
      swap=$(awk '/^VmSwap:/{print $2}' "$pid/status" 2>/dev/null)
      if [ -n "$swap" ] && [ "$swap" -gt 0 ]; then
        name=$(cat "$pid/comm" 2>/dev/null)
        echo "$swap $p $name"
      fi
    done | sort -rn | head -10 | awk '{printf "  %8d KB  PID %-6s  %s\n", $1, $2, $3}'
    ;;
  clear)
    echo "Clearing swap (this may take a moment)..."
    BEFORE=$(free -m | awk '/Swap/{print $3}')
    sudo swapoff -a && sudo swapon -a
    AFTER=$(free -m | awk '/Swap/{print $3}')
    echo "Swap cleared: ${BEFORE}MB -> ${AFTER}MB"
    ;;
  *)
    echo "Error: action must be status, top, or clear"
    exit 1
    ;;
esac
