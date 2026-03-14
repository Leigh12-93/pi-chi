#!/bin/bash
LINES="$1"
LOGFILE="/var/log/auth.log"

if [ ! -r "$LOGFILE" ]; then
  LOGFILE="/var/log/secure"
fi

if [ ! -r "$LOGFILE" ]; then
  echo "Cannot read auth log. Try: sudo bash $0 $LINES"
  # Fall back to journalctl
  echo "=== Recent Auth Events (journalctl) ==="
  journalctl -u ssh -n "$LINES" --no-pager 2>/dev/null | tail -20
  exit 0
fi

echo "=== Failed SSH Attempts (last $LINES lines) ==="
tail -n "$LINES" "$LOGFILE" | grep -i "failed password\|invalid user\|authentication failure" | tail -20

echo ""
echo "=== Failed SSH Summary (by IP) ==="
tail -n "$LINES" "$LOGFILE" | grep -i "failed password" | awk '{print $(NF-3)}' | sort | uniq -c | sort -rn | head -10

echo ""
echo "=== Successful Logins ==="
tail -n "$LINES" "$LOGFILE" | grep "Accepted\|session opened" | tail -10

echo ""
echo "=== Sudo Usage ==="
tail -n "$LINES" "$LOGFILE" | grep "sudo:" | tail -10

echo ""
echo "=== Summary ==="
FAILED=$(tail -n "$LINES" "$LOGFILE" | grep -ci "failed password\|invalid user")
SUCCESS=$(tail -n "$LINES" "$LOGFILE" | grep -ci "accepted\|session opened")
SUDO=$(tail -n "$LINES" "$LOGFILE" | grep -ci "sudo:")
echo "Failed attempts: $FAILED"
echo "Successful logins: $SUCCESS"
echo "Sudo commands: $SUDO"
