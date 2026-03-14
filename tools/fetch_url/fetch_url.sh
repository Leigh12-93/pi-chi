#!/bin/bash
URL="$1"
MAX_BYTES="$2"

CONTENT=$(curl -sL --max-time 30 --max-filesize "$MAX_BYTES" \
  -H "User-Agent: Pi-Chi/1.0" \
  "$URL" 2>/dev/null)

if [ -z "$CONTENT" ]; then
  echo "Failed to fetch URL: $URL"
  exit 1
fi

# Strip HTML if it looks like HTML
if echo "$CONTENT" | head -5 | grep -qi "<html\|<!doctype"; then
  echo "$CONTENT" | \
    sed 's/<script[^>]*>.*<\/script>//gi' | \
    sed 's/<style[^>]*>.*<\/style>//gi' | \
    sed 's/<[^>]*>//g' | \
    sed '/^[[:space:]]*$/d' | \
    head -c "$MAX_BYTES"
else
  echo "$CONTENT" | head -c "$MAX_BYTES"
fi

echo ""
echo "---"
echo "Source: $URL"
echo "Bytes returned: $(echo "$CONTENT" | wc -c)"
