#!/bin/bash
ACTION="$1"
SOURCE="$2"
DEST="$3"

case "$ACTION" in
  cp)
    cp -rv "$SOURCE" "$DEST" 2>&1 | tail -5
    echo "Copied: $SOURCE -> $DEST"
    ;;
  mv)
    mv -v "$SOURCE" "$DEST" 2>&1
    echo "Moved: $SOURCE -> $DEST"
    ;;
  rm)
    rm -rv "$SOURCE" 2>&1 | tail -5
    echo "Removed: $SOURCE"
    ;;
  mkdir)
    mkdir -pv "$SOURCE" 2>&1
    ;;
  ln)
    ln -sfv "$SOURCE" "$DEST" 2>&1
    echo "Symlink: $DEST -> $SOURCE"
    ;;
  du)
    du -sh "$SOURCE" 2>/dev/null
    echo ""
    du -sh "$SOURCE"/* 2>/dev/null | sort -rh | head -10
    ;;
  ls)
    ls -lahF "$SOURCE" 2>/dev/null | head -30
    ;;
  cat)
    cat "$SOURCE" 2>/dev/null | head -100
    ;;
  head)
    head -30 "$SOURCE" 2>/dev/null
    ;;
  wc)
    wc -lwc "$SOURCE" 2>/dev/null | awk '{printf "Lines: %s  Words: %s  Bytes: %s\n", $1, $2, $3}'
    ;;
  *)
    echo "Error: action must be cp, mv, rm, mkdir, ln, du, ls, cat, head, or wc"
    exit 1
    ;;
esac
