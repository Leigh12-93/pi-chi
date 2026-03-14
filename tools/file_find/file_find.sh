#!/bin/bash
DIR="$1"
PATTERN="$2"
MAX="$3"

echo "=== File Search: '$PATTERN' in $DIR ==="
find "$DIR" -name "$PATTERN" -type f 2>/dev/null | head -n "$MAX" | while read -r f; do
  SIZE=$(ls -lh "$f" 2>/dev/null | awk '{print $5}')
  MOD=$(stat -c %y "$f" 2>/dev/null | cut -d. -f1)
  printf "  %-50s %8s  %s\n" "$f" "$SIZE" "$MOD"
done

TOTAL=$(find "$DIR" -name "$PATTERN" -type f 2>/dev/null | wc -l)
echo ""
echo "Found: $TOTAL files (showing first $MAX)"
