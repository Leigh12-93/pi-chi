#!/bin/bash
MODE="$1"
ISSUES=0
FIXES=0

check_disk() {
  USAGE=$(df / | awk 'NR==2{print $5}' | tr -d '%')
  if [ "$USAGE" -gt 90 ]; then
    echo "  CRITICAL: Disk usage at ${USAGE}%"
    ISSUES=$((ISSUES+1))
    if [ "$MODE" = "fix" ]; then
      echo "  Cleaning: apt cache, journal, tmp..."
      sudo apt clean 2>/dev/null
      sudo journalctl --vacuum-time=3d 2>/dev/null
      find /tmp -type f -mtime +7 -delete 2>/dev/null
      FIXES=$((FIXES+1))
    fi
  elif [ "$USAGE" -gt 80 ]; then
    echo "  WARNING: Disk usage at ${USAGE}%"
    ISSUES=$((ISSUES+1))
  else
    echo "  OK: Disk usage ${USAGE}%"
  fi
}

check_memory() {
  AVAIL=$(free -m | awk '/Mem:/{print $7}')
  TOTAL=$(free -m | awk '/Mem:/{print $2}')
  PCT=$((AVAIL * 100 / TOTAL))
  if [ "$PCT" -lt 10 ]; then
    echo "  CRITICAL: Only ${AVAIL}MB available (${PCT}%)"
    ISSUES=$((ISSUES+1))
    if [ "$MODE" = "fix" ]; then
      echo "  Dropping caches..."
      echo 3 | sudo tee /proc/sys/vm/drop_caches >/dev/null 2>&1
      FIXES=$((FIXES+1))
    fi
  elif [ "$PCT" -lt 20 ]; then
    echo "  WARNING: ${AVAIL}MB available (${PCT}%)"
    ISSUES=$((ISSUES+1))
  else
    echo "  OK: ${AVAIL}MB available (${PCT}%)"
  fi
}

check_temp() {
  TEMP=$(vcgencmd measure_temp 2>/dev/null | sed 's/temp=//;s/'\''C//')
  if [ -z "$TEMP" ]; then
    TEMP=$(awk '{printf "%.0f", $1/1000}' /sys/class/thermal/thermal_zone0/temp 2>/dev/null)
  fi
  if [ -n "$TEMP" ]; then
    TEMP_INT=${TEMP%.*}
    if [ "$TEMP_INT" -gt 80 ]; then
      echo "  CRITICAL: CPU temp ${TEMP}C (throttling likely)"
      ISSUES=$((ISSUES+1))
    elif [ "$TEMP_INT" -gt 70 ]; then
      echo "  WARNING: CPU temp ${TEMP}C"
      ISSUES=$((ISSUES+1))
    else
      echo "  OK: CPU temp ${TEMP}C"
    fi
  fi
}

check_services() {
  for svc in pi-chi-brain ssh; do
    STATUS=$(systemctl is-active "$svc" 2>/dev/null)
    if [ "$STATUS" != "active" ]; then
      echo "  CRITICAL: $svc is $STATUS"
      ISSUES=$((ISSUES+1))
      if [ "$MODE" = "fix" ]; then
        sudo systemctl restart "$svc" 2>/dev/null
        NEW_STATUS=$(systemctl is-active "$svc" 2>/dev/null)
        echo "  Restarted $svc -> $NEW_STATUS"
        FIXES=$((FIXES+1))
      fi
    else
      echo "  OK: $svc active"
    fi
  done
}

check_network() {
  if ping -c 1 -W 3 1.1.1.1 >/dev/null 2>&1; then
    echo "  OK: Internet reachable"
  else
    echo "  CRITICAL: No internet connectivity"
    ISSUES=$((ISSUES+1))
    if [ "$MODE" = "fix" ]; then
      echo "  Restarting network..."
      sudo ip link set wlan0 down 2>/dev/null
      sleep 2
      sudo ip link set wlan0 up 2>/dev/null
      sleep 5
      if ping -c 1 -W 3 1.1.1.1 >/dev/null 2>&1; then
        echo "  Network restored"
        FIXES=$((FIXES+1))
      else
        echo "  Network still down - manual intervention needed"
      fi
    fi
  fi
}

echo "=== Pi-Chi Auto-Heal ($MODE) ==="
echo "--- Disk ---"
check_disk
echo "--- Memory ---"
check_memory
echo "--- Temperature ---"
check_temp
echo "--- Services ---"
check_services
echo "--- Network ---"
check_network

echo ""
echo "=========================================="
echo "Issues found: $ISSUES"
if [ "$MODE" = "fix" ]; then
  echo "Fixes applied: $FIXES"
fi
if [ "$ISSUES" -eq 0 ]; then
  echo "Status: ALL SYSTEMS HEALTHY"
else
  echo "Status: ATTENTION NEEDED"
fi
echo "=========================================="
