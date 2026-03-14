#!/bin/bash
THRESHOLD="$1"

echo "=== Disk Usage Alert (threshold: ${THRESHOLD}%) ==="
ALERT=0

while IFS= read -r line; do
  FS=$(echo "$line" | awk '{print $1}')
  MOUNT=$(echo "$line" | awk '{print $6}')
  PCT=$(echo "$line" | awk '{print $5}' | tr -d '%')
  USED=$(echo "$line" | awk '{print $3}')
  TOTAL=$(echo "$line" | awk '{print $2}')

  if [ "$PCT" -ge "$THRESHOLD" ]; then
    echo "  ALERT: $MOUNT is ${PCT}% full ($USED / $TOTAL)"
    ALERT=1
  else
    echo "  OK: $MOUNT is ${PCT}% full ($USED / $TOTAL)"
  fi
done < <(df -h --output=source,size,used,avail,pcent,target -x tmpfs -x devtmpfs 2>/dev/null | tail -n +2)

echo ""
if [ "$ALERT" -eq 1 ]; then
  echo "=== Top 15 Largest Files (home) ==="
  find /home/pi -type f -exec ls -s {} + 2>/dev/null | sort -rn | head -15 | awk '{printf "  %8sK  %s\n", $1, $2}'

  echo ""
  echo "=== Large Log Files ==="
  find /var/log -type f -size +1M -exec ls -lh {} + 2>/dev/null | awk '{printf "  %5s  %s\n", $5, $NF}' | head -10

  echo ""
  echo "=== Temp Files ==="
  du -sh /tmp 2>/dev/null | awk '{print "  /tmp: "$1}'
fi
