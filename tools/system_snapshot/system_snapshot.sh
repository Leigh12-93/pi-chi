#!/bin/bash
echo "=========================================="
echo "  Pi-Chi System Snapshot"
echo "  $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "=========================================="

echo ""
echo "--- Identity ---"
echo "Hostname: $(hostname)"
echo "Kernel: $(uname -r)"
echo "Arch: $(uname -m)"
echo "Uptime: $(uptime -p)"

echo ""
echo "--- CPU ---"
echo "Temperature: $(vcgencmd measure_temp 2>/dev/null | sed 's/temp=//' || echo 'N/A')"
echo "Load average: $(cat /proc/loadavg | awk '{print $1, $2, $3}')"
echo "CPU cores: $(nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo)"
FREQ=$(vcgencmd measure_clock arm 2>/dev/null | awk -F= '{printf "%.0f MHz", $2/1000000}')
echo "Frequency: ${FREQ:-N/A}"

echo ""
echo "--- Memory ---"
free -h | awk 'NR==1||NR==2{print "  "$0}'
SWAP=$(free -h | awk '/Swap/{print $3"/"$2}')
echo "  Swap used: $SWAP"

echo ""
echo "--- Disk ---"
df -h / | awk 'NR==2{printf "  Root: %s used of %s (%s)\n", $3, $2, $5}'
df -h /home 2>/dev/null | awk 'NR==2{printf "  Home: %s used of %s (%s)\n", $3, $2, $5}'

echo ""
echo "--- Network ---"
IP=$(hostname -I | awk '{print $1}')
echo "  Local IP: $IP"
echo "  Gateway: $(ip route | awk '/default/{print $3}')"
echo "  DNS: $(grep nameserver /etc/resolv.conf | head -1 | awk '{print $2}')"
WIFI_SSID=$(iwgetid -r 2>/dev/null)
echo "  WiFi SSID: ${WIFI_SSID:-N/A}"
SIGNAL=$(iwconfig wlan0 2>/dev/null | awk -F= '/Signal/{print $3}')
echo "  Signal: ${SIGNAL:-N/A}"

echo ""
echo "--- Key Services ---"
for svc in pi-chi-brain ssh nginx; do
  STATUS=$(systemctl is-active "$svc" 2>/dev/null || echo "unknown")
  printf "  %-20s %s\n" "$svc" "$STATUS"
done

echo ""
echo "--- Docker ---"
if command -v docker &>/dev/null; then
  CONTAINERS=$(docker ps --format '{{.Names}}: {{.Status}}' 2>/dev/null | head -5)
  echo "  ${CONTAINERS:-No containers running}"
else
  echo "  Not installed"
fi

echo ""
echo "=========================================="
