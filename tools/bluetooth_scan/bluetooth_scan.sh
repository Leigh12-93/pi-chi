#!/bin/bash
echo "=== Bluetooth Status ==="
if ! command -v bluetoothctl &>/dev/null; then
  echo "bluetoothctl not available. Install: sudo apt install bluez"
  exit 1
fi

echo "--- Controller Info ---"
bluetoothctl show 2>/dev/null | grep -E "Name|Powered|Discoverable|Address"

echo ""
echo "--- Paired Devices ---"
bluetoothctl devices Paired 2>/dev/null || bluetoothctl paired-devices 2>/dev/null

echo ""
echo "--- Scanning for nearby devices (10s) ---"
timeout 10 bluetoothctl --timeout 10 scan on 2>/dev/null &
sleep 10
bluetoothctl devices 2>/dev/null
