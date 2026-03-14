#!/bin/bash
echo "=== Current WiFi Connection ==="
IFACE=$(iw dev 2>/dev/null | awk '/Interface/{print $2}' | head -1)
if [ -z "$IFACE" ]; then
  IFACE="wlan0"
fi

if iwconfig "$IFACE" 2>/dev/null | grep -q "ESSID"; then
  iwconfig "$IFACE" 2>/dev/null | grep -E "ESSID|Frequency|Signal|Bit Rate|Link Quality"
  echo ""
  echo "IP: $(ip -4 addr show "$IFACE" 2>/dev/null | awk '/inet/{print $2}')"
  echo "MAC: $(ip link show "$IFACE" 2>/dev/null | awk '/link\/ether/{print $2}')"
else
  echo "Not connected to WiFi"
fi

echo ""
echo "=== Nearby Networks ==="
sudo iwlist "$IFACE" scan 2>/dev/null | awk '/ESSID:/{essid=$0} /Quality/{quality=$0} /Frequency/{freq=$0} /Address/{addr=$0; if(essid) printf "%s | %s | %s\n", essid, quality, freq; essid=""}' | head -15 || echo "Scan requires sudo or not available"
