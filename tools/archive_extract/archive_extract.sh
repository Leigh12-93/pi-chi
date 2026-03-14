#!/bin/bash
ACTION="$1"
FILE="$2"
DEST="$3"

if [ ! -f "$FILE" ]; then
  echo "File not found: $FILE"
  exit 1
fi

if [ "$DEST" = "default" ]; then
  DEST="$(dirname "$FILE")"
fi

case "$FILE" in
  *.tar.gz|*.tgz)
    if [ "$ACTION" = "list" ]; then
      tar -tzf "$FILE" | head -50
      echo "..."
      echo "Total entries: $(tar -tzf "$FILE" | wc -l)"
    else
      tar -xzf "$FILE" -C "$DEST"
      echo "Extracted to: $DEST"
    fi
    ;;
  *.tar.bz2)
    if [ "$ACTION" = "list" ]; then
      tar -tjf "$FILE" | head -50
    else
      tar -xjf "$FILE" -C "$DEST"
      echo "Extracted to: $DEST"
    fi
    ;;
  *.zip)
    if [ "$ACTION" = "list" ]; then
      unzip -l "$FILE" | head -50
    else
      unzip -o "$FILE" -d "$DEST"
      echo "Extracted to: $DEST"
    fi
    ;;
  *.gz)
    if [ "$ACTION" = "list" ]; then
      echo "Compressed file: $(ls -lh "$FILE" | awk '{print $5}')"
      echo "Original size: $(gzip -l "$FILE" | tail -1 | awk '{print $2}')"
    else
      gunzip -k "$FILE"
      echo "Decompressed: ${FILE%.gz}"
    fi
    ;;
  *)
    echo "Unsupported format. Supported: .tar.gz, .tgz, .tar.bz2, .zip, .gz"
    exit 1
    ;;
esac
