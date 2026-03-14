#!/bin/bash
LAT="$1"
LON="$2"

echo "=== Astronomy for ${LAT}, ${LON} ==="

RESPONSE=$(curl -s --max-time 15 "https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&daily=sunrise,sunset,daylight_duration,uv_index_max&timezone=auto&forecast_days=3" 2>/dev/null)

if [ -z "$RESPONSE" ]; then
  echo "Failed to fetch astronomy data"
  exit 1
fi

echo "$RESPONSE" | python3 -c "
import json, sys, math
from datetime import datetime

d = json.load(sys.stdin)
daily = d.get('daily', {})
dates = daily.get('time', [])
sunrises = daily.get('sunrise', [])
sunsets = daily.get('sunset', [])
daylight = daily.get('daylight_duration', [])
uv = daily.get('uv_index_max', [])

for i, date in enumerate(dates):
    sr = sunrises[i] if i < len(sunrises) else '?'
    ss = sunsets[i] if i < len(sunsets) else '?'
    dl = daylight[i] if i < len(daylight) else 0
    uvi = uv[i] if i < len(uv) else 0
    hours = dl / 3600 if dl else 0
    mins = (dl % 3600) / 60 if dl else 0
    print(f'{date}:')
    print(f'  Sunrise: {sr.split(\"T\")[1] if \"T\" in str(sr) else sr}')
    print(f'  Sunset:  {ss.split(\"T\")[1] if \"T\" in str(ss) else ss}')
    print(f'  Daylight: {int(hours)}h {int(mins)}m')
    print(f'  UV Index: {uvi}')
    print()

# Moon phase calculation (approximate)
now = datetime.utcnow()
# Known new moon: Jan 6, 2000
ref = datetime(2000, 1, 6, 18, 14)
days_since = (now - ref).total_seconds() / 86400
cycle = 29.53058867
phase = (days_since % cycle) / cycle
phase_pct = round(phase * 100)

phases = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous',
          'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent']
idx = int(phase * 8) % 8
icons = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘']

print(f'Moon: {phases[idx]} ({phase_pct}% illuminated) {icons[idx]}')
" 2>/dev/null || echo "$RESPONSE" | head -10
