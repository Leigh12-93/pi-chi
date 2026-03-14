#!/bin/bash
ACTION="$1"
VALUE="$2"

case "$ACTION" in
  status)
    echo "=== Power Status ==="
    echo "Voltage: $(vcgencmd measure_volts core 2>/dev/null | sed 's/volt=//')"
    echo "Temperature: $(vcgencmd measure_temp 2>/dev/null | sed 's/temp=//')"
    echo "CPU Freq: $(vcgencmd measure_clock arm 2>/dev/null | awk -F= '{printf "%.0f MHz", $2/1000000}')"
    echo "Governor: $(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null)"
    echo "Min Freq: $(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_min_freq 2>/dev/null | awk '{printf "%.0f MHz", $1/1000}')"
    echo "Max Freq: $(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_max_freq 2>/dev/null | awk '{printf "%.0f MHz", $1/1000}')"
    echo ""
    echo "Throttle: $(vcgencmd get_throttled 2>/dev/null | sed 's/throttled=//')"
    echo "HDMI: $(vcgencmd display_power 2>/dev/null || echo 'N/A')"
    ;;
  governor)
    echo "$VALUE" | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor >/dev/null 2>&1
    echo "CPU governor set to: $VALUE"
    echo "Current: $(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null)"
    ;;
  hdmi)
    if [ "$VALUE" = "off" ]; then
      vcgencmd display_power 0 2>/dev/null || sudo tvservice -o 2>/dev/null
      echo "HDMI turned off (saves ~25mA)"
    else
      vcgencmd display_power 1 2>/dev/null || sudo tvservice -p 2>/dev/null
      echo "HDMI turned on"
    fi
    ;;
  led)
    LED_PATH="/sys/class/leds/ACT"
    if [ ! -d "$LED_PATH" ]; then
      LED_PATH="/sys/class/leds/led0"
    fi
    if [ "$VALUE" = "off" ]; then
      echo none | sudo tee "$LED_PATH/trigger" >/dev/null 2>&1
      echo 0 | sudo tee "$LED_PATH/brightness" >/dev/null 2>&1
      echo "Activity LED turned off"
    else
      echo mmc0 | sudo tee "$LED_PATH/trigger" >/dev/null 2>&1
      echo "Activity LED restored to default"
    fi
    ;;
  *)
    echo "Error: action must be status, governor, hdmi, or led"
    exit 1
    ;;
esac
