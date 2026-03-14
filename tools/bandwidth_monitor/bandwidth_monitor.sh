#!/bin/bash
IFACE="$1"
SECONDS_DUR="$2"

if [ "$SECONDS_DUR" -gt 30 ]; then
  SECONDS_DUR=30
fi

if [ "$IFACE" = "all" ]; then
  IFACE=$(ip -o link show up | awk -F': ' '{print $2}' | grep -v lo | head -1)
fi

echo "=== Bandwidth Monitor: $IFACE (${SECONDS_DUR}s) ==="

RX1=$(cat /sys/class/net/${IFACE}/statistics/rx_bytes 2>/dev/null)
TX1=$(cat /sys/class/net/${IFACE}/statistics/tx_bytes 2>/dev/null)

if [ -z "$RX1" ]; then
  echo "Interface $IFACE not found"
  exit 1
fi

sleep "$SECONDS_DUR"

RX2=$(cat /sys/class/net/${IFACE}/statistics/rx_bytes)
TX2=$(cat /sys/class/net/${IFACE}/statistics/tx_bytes)

RX_DIFF=$((RX2 - RX1))
TX_DIFF=$((TX2 - TX1))
RX_RATE=$((RX_DIFF / SECONDS_DUR))
TX_RATE=$((TX_DIFF / SECONDS_DUR))

echo "Download: $(echo "$RX_DIFF" | awk '{printf "%.2f KB", $1/1024}') ($(echo "$RX_RATE" | awk '{printf "%.2f KB/s", $1/1024}'))"
echo "Upload:   $(echo "$TX_DIFF" | awk '{printf "%.2f KB", $1/1024}') ($(echo "$TX_RATE" | awk '{printf "%.2f KB/s", $1/1024}'))"
echo ""
echo "Total RX: $(echo "$RX2" | awk '{printf "%.2f MB", $1/1048576}')"
echo "Total TX: $(echo "$TX2" | awk '{printf "%.2f MB", $1/1048576}')"
