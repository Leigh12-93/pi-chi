#!/bin/bash
DATA_DIR="/home/pi/.pi-chi/data"
FILE="${DATA_DIR}/arp_history.csv"
mkdir -p "$DATA_DIR"

if [ ! -f "$FILE" ]; then
  echo "timestamp,ip,mac,interface,status" > "$FILE"
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "=== ARP Table Snapshot ==="
CURRENT=$(arp -n 2>/dev/null | tail -n +2 | grep -v incomplete)
echo "$CURRENT"

echo ""
echo "=== New Devices ==="
while IFS= read -r line; do
  IP=$(echo "$line" | awk '{print $1}')
  MAC=$(echo "$line" | awk '{print $3}')
  IFACE=$(echo "$line" | awk '{print $5}')

  if ! grep -q "$MAC" "$FILE" 2>/dev/null; then
    echo "  NEW: $IP ($MAC) on $IFACE"
    echo "${TIMESTAMP},${IP},${MAC},${IFACE},new" >> "$FILE"
  else
    echo "${TIMESTAMP},${IP},${MAC},${IFACE},seen" >> "$FILE"
  fi
done <<< "$CURRENT"

UNIQUE_MACS=$(awk -F, 'NR>1{print $3}' "$FILE" | sort -u | wc -l)
echo ""
echo "Total unique MACs ever seen: $UNIQUE_MACS"
echo "Logged to: arp_history.csv"
