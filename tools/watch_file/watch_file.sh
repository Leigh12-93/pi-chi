#!/bin/bash
FILE="$1"
LINES="$2"

if [ ! -f "$FILE" ]; then
  echo "File not found: $FILE"
  exit 1
fi

echo "=== File Watch: $FILE ==="
echo "Size: $(ls -lh "$FILE" | awk '{print $5}')"
echo "Modified: $(stat -c '%y' "$FILE" | cut -d. -f1)"
echo "Lines: $(wc -l < "$FILE")"
echo "Owner: $(ls -l "$FILE" | awk '{print $3":"$4}')"
echo "Permissions: $(stat -c '%A' "$FILE")"
echo ""
echo "--- Last $LINES lines ---"
tail -n "$LINES" "$FILE"
