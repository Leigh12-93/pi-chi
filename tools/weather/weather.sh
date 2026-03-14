#!/bin/bash
LAT="$1"
LON="$2"

echo "=== Weather for ${LAT}, ${LON} ==="

RESPONSE=$(curl -s --max-time 15 "https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,wind_direction_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=auto&forecast_days=3" 2>/dev/null)

if [ -z "$RESPONSE" ]; then
  echo "Failed to fetch weather data"
  exit 1
fi

# Parse current conditions
echo ""
echo "--- Current Conditions ---"
echo "$RESPONSE" | python3 -c "
import json, sys
d = json.load(sys.stdin)
c = d.get('current', {})
codes = {0:'Clear',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Foggy',48:'Rime fog',
  51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',
  71:'Light snow',73:'Snow',75:'Heavy snow',80:'Light showers',81:'Showers',82:'Heavy showers',
  95:'Thunderstorm',96:'Thunderstorm+hail',99:'Heavy thunderstorm+hail'}
code = c.get('weather_code', -1)
print(f'Condition: {codes.get(code, \"Unknown\")}')
print(f'Temperature: {c.get(\"temperature_2m\",\"?\")}C (feels like {c.get(\"apparent_temperature\",\"?\")}C)')
print(f'Humidity: {c.get(\"relative_humidity_2m\",\"?\")}%')
print(f'Wind: {c.get(\"wind_speed_10m\",\"?\")} km/h from {c.get(\"wind_direction_10m\",\"?\")}deg')
print(f'Precipitation: {c.get(\"precipitation\",\"?\")} mm')

print()
print('--- 3-Day Forecast ---')
daily = d.get('daily', {})
dates = daily.get('time', [])
for i, date in enumerate(dates):
    wc = daily.get('weather_code', [0])[i]
    hi = daily.get('temperature_2m_max', [0])[i]
    lo = daily.get('temperature_2m_min', [0])[i]
    rain = daily.get('precipitation_sum', [0])[i]
    wind = daily.get('wind_speed_10m_max', [0])[i]
    print(f'{date}: {codes.get(wc,\"?\")} | {lo}C - {hi}C | Rain: {rain}mm | Wind: {wind}km/h')
" 2>/dev/null || echo "$RESPONSE" | head -5
