#!/bin/bash
ACTION="$1"
USERNAME="$2"
EXTRA="$3"

case "$ACTION" in
  list)
    echo "=== System Users ==="
    awk -F: '$3 >= 1000 && $3 < 65534 {printf "  %-15s UID:%-5s GID:%-5s Home:%s Shell:%s\n", $1, $3, $4, $6, $7}' /etc/passwd
    echo ""
    echo "=== Service Accounts ==="
    awk -F: '$3 < 1000 && $7 !~ /nologin|false/ {printf "  %-15s UID:%-5s Shell:%s\n", $1, $3, $7}' /etc/passwd
    ;;
  add)
    GROUPS_ARG=""
    if [ "$EXTRA" != "none" ]; then
      GROUPS_ARG="-G $EXTRA"
    fi
    sudo useradd -m -s /bin/bash $GROUPS_ARG "$USERNAME" 2>&1
    echo "User $USERNAME created"
    id "$USERNAME" 2>/dev/null
    ;;
  remove)
    sudo userdel -r "$USERNAME" 2>&1
    echo "User $USERNAME removed"
    ;;
  lock)
    sudo usermod -L "$USERNAME" && echo "User $USERNAME locked"
    ;;
  unlock)
    sudo usermod -U "$USERNAME" && echo "User $USERNAME unlocked"
    ;;
  groups)
    echo "=== Groups for $USERNAME ==="
    groups "$USERNAME" 2>/dev/null
    echo ""
    id "$USERNAME" 2>/dev/null
    ;;
  passwd)
    echo "$USERNAME:$EXTRA" | sudo chpasswd && echo "Password changed for $USERNAME"
    ;;
  *)
    echo "Error: action must be list, add, remove, lock, unlock, groups, or passwd"
    exit 1
    ;;
esac
