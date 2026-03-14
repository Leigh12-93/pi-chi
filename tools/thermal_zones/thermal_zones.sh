#!/bin/bash
echo "=== Thermal Zones ==="
for zone in /sys/class/thermal/thermal_zone*/; do
  if [ -d "$zone" ]; then
    TYPE=$(cat "${zone}type" 2>/dev/null)
    TEMP=$(cat "${zone}temp" 2>/dev/null)
    TEMP_C=$(echo "$TEMP" | awk '{printf "%.1f", $1/1000}')
    echo "  $(basename "$zone"): ${TYPE} = ${TEMP_C}C"

    # Trip points
    for trip in "${zone}"trip_point_*_temp; do
      if [ -f "$trip" ]; then
        TVAL=$(cat "$trip" | awk '{printf "%.0f", $1/1000}')
        TNAME=$(basename "$trip" | sed 's/trip_point_//;s/_temp//')
        TTYPE=$(cat "${zone}trip_point_${TNAME}_type" 2>/dev/null)
        echo "    Trip $TNAME ($TTYPE): ${TVAL}C"
      fi
    done
  fi
done

echo ""
echo "=== Cooling Devices ==="
for dev in /sys/class/thermal/cooling_device*/; do
  if [ -d "$dev" ]; then
    TYPE=$(cat "${dev}type" 2>/dev/null)
    CUR=$(cat "${dev}cur_state" 2>/dev/null)
    MAX=$(cat "${dev}max_state" 2>/dev/null)
    echo "  $(basename "$dev"): $TYPE (state: $CUR/$MAX)"
  fi
done
