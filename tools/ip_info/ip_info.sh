#!/bin/bash
echo "=== Local Interfaces ==="
ip -4 -o addr show 2>/dev/null | awk '{printf "  %-10s %s\n", $2, $4}'

echo ""
echo "=== Public IP Info ==="
INFO=$(curl -s --max-time 10 "https://ipinfo.io/json" 2>/dev/null)
if [ -n "$INFO" ]; then
  echo "$INFO" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f'  IP: {d.get(\"ip\", \"?\")}')
print(f'  City: {d.get(\"city\", \"?\")}')
print(f'  Region: {d.get(\"region\", \"?\")}')
print(f'  Country: {d.get(\"country\", \"?\")}')
print(f'  ISP: {d.get(\"org\", \"?\")}')
print(f'  Timezone: {d.get(\"timezone\", \"?\")}')
print(f'  Location: {d.get(\"loc\", \"?\")}')
" 2>/dev/null || echo "$INFO" | head -10
else
  IP=$(curl -s --max-time 5 https://ifconfig.me 2>/dev/null)
  echo "  Public IP: ${IP:-Unable to determine}"
fi

echo ""
echo "=== Default Route ==="
ip route | head -3
