#!/bin/bash
ACTION="$1"
DIR="$2"

case "$ACTION" in
  list)
    echo "=== Log Files in $DIR ==="
    find "$DIR" -type f \( -name "*.log" -o -name "*.csv" -o -name "*.txt" \) -exec ls -lhS {} + 2>/dev/null | awk '{printf "  %5s  %s  %s\n", $5, $6" "$7, $NF}'
    echo ""
    echo "Total: $(du -sh "$DIR" 2>/dev/null | awk '{print $1}')"
    ;;
  archive)
    echo "=== Archiving logs older than 7 days in $DIR ==="
    COUNT=0
    find "$DIR" -type f \( -name "*.log" -o -name "*.csv" \) -mtime +7 2>/dev/null | while read -r f; do
      gzip "$f" && echo "  Compressed: $f" && COUNT=$((COUNT+1))
    done
    echo "Done"
    ;;
  cleanup)
    echo "=== Removing archived logs in $DIR ==="
    find "$DIR" -name "*.gz" -type f 2>/dev/null | while read -r f; do
      SIZE=$(ls -lh "$f" | awk '{print $5}')
      rm "$f" && echo "  Removed: $f ($SIZE)"
    done
    echo "Done"
    ;;
  *)
    echo "Error: action must be list, archive, or cleanup"
    exit 1
    ;;
esac
