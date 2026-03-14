#!/bin/bash
echo "=== CPU Throttle & Voltage Check ==="

TEMP=$(vcgencmd measure_temp 2>/dev/null | sed 's/temp=//')
echo "CPU Temperature: ${TEMP:-N/A}"

THROTTLED=$(vcgencmd get_throttled 2>/dev/null | sed 's/throttled=//')
if [ -z "$THROTTLED" ]; then
  echo "vcgencmd not available"
  exit 0
fi

echo "Throttle register: $THROTTLED"

VAL=$((THROTTLED))
echo ""
echo "--- Current Status ---"
[ $((VAL & 0x1)) -ne 0 ] && echo "  ACTIVE: Under-voltage detected!" || echo "  OK: Voltage normal"
[ $((VAL & 0x2)) -ne 0 ] && echo "  ACTIVE: ARM frequency capped!" || echo "  OK: Frequency normal"
[ $((VAL & 0x4)) -ne 0 ] && echo "  ACTIVE: Currently throttled!" || echo "  OK: Not throttled"
[ $((VAL & 0x8)) -ne 0 ] && echo "  ACTIVE: Soft temp limit active!" || echo "  OK: Temp limit normal"

echo ""
echo "--- Historical (since boot) ---"
[ $((VAL & 0x10000)) -ne 0 ] && echo "  OCCURRED: Under-voltage" || echo "  CLEAR: No under-voltage"
[ $((VAL & 0x20000)) -ne 0 ] && echo "  OCCURRED: Frequency capping" || echo "  CLEAR: No freq capping"
[ $((VAL & 0x40000)) -ne 0 ] && echo "  OCCURRED: Throttling" || echo "  CLEAR: No throttling"
[ $((VAL & 0x80000)) -ne 0 ] && echo "  OCCURRED: Soft temp limit" || echo "  CLEAR: No temp limit"

FREQ=$(vcgencmd measure_clock arm 2>/dev/null | awk -F= '{printf "%.0f MHz", $2/1000000}')
VOLTS=$(vcgencmd measure_volts core 2>/dev/null | sed 's/volt=//')
echo ""
echo "CPU Frequency: ${FREQ:-N/A}"
echo "Core Voltage: ${VOLTS:-N/A}"
