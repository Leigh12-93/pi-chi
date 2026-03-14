#!/bin/bash
DATA_DIR="/home/pi/.pi-chi/data"
FILE="${DATA_DIR}/cpu_temps.csv"
mkdir -p "$DATA_DIR"

# Get current temp
TEMP=$(vcgencmd measure_temp 2>/dev/null | sed 's/temp=//;s/'\''C//')
if [ -z "$TEMP" ]; then
  TEMP=$(cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null | awk '{printf "%.1f", $1/1000}')
fi

if [ -z "$TEMP" ]; then
  echo "Cannot read CPU temperature"
  exit 1
fi

# Create file if needed
if [ ! -f "$FILE" ]; then
  echo "timestamp,temp_c" > "$FILE"
fi

# Log it
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "${TIMESTAMP},${TEMP}" >> "$FILE"

echo "=== CPU Temperature ==="
echo "Current: ${TEMP}C"
echo "Logged at: $TIMESTAMP"

# Show stats from last 100 readings
echo ""
tail -n 100 "$FILE" | python3 -c "
import sys
lines = [l.strip() for l in sys.stdin if ',' in l and not l.startswith('timestamp')]
if not lines:
    print('No history yet')
    sys.exit(0)
temps = [float(l.split(',')[1]) for l in lines]
print(f'--- Last {len(temps)} readings ---')
print(f'Min: {min(temps):.1f}C')
print(f'Max: {max(temps):.1f}C')
print(f'Avg: {sum(temps)/len(temps):.1f}C')
print(f'Latest 5: {[t for t in temps[-5:]]}')
first_time = lines[0].split(',')[0]
last_time = lines[-1].split(',')[0]
print(f'Range: {first_time} to {last_time}')
" 2>/dev/null
