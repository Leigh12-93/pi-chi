#!/bin/bash
PIN="$1"
COUNT="$2"
DELAY_MS="$3"

DELAY_S=$(echo "$DELAY_MS" | awk '{printf "%.3f", $1/1000}')

# Use pinctrl (Pi 5) or gpio sysfs
if command -v pinctrl &>/dev/null; then
  # Raspberry Pi 5 uses pinctrl
  for i in $(seq 1 "$COUNT"); do
    pinctrl set "$PIN" op dh
    sleep "$DELAY_S"
    pinctrl set "$PIN" op dl
    sleep "$DELAY_S"
  done
  echo "Blinked GPIO $PIN $COUNT times (${DELAY_MS}ms interval) via pinctrl"
elif [ -d /sys/class/gpio ]; then
  # Legacy sysfs GPIO
  echo "$PIN" > /sys/class/gpio/export 2>/dev/null
  echo "out" > /sys/class/gpio/gpio${PIN}/direction 2>/dev/null

  for i in $(seq 1 "$COUNT"); do
    echo "1" > /sys/class/gpio/gpio${PIN}/value
    sleep "$DELAY_S"
    echo "0" > /sys/class/gpio/gpio${PIN}/value
    sleep "$DELAY_S"
  done

  echo "$PIN" > /sys/class/gpio/unexport 2>/dev/null
  echo "Blinked GPIO $PIN $COUNT times (${DELAY_MS}ms interval) via sysfs"
else
  echo "Error: No GPIO interface available (neither pinctrl nor sysfs)"
  exit 1
fi
