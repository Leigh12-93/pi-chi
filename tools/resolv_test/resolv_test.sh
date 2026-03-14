#!/bin/bash
DOMAIN="$1"

echo "=== DNS Resolution Test: $DOMAIN ==="

echo "--- /etc/resolv.conf ---"
cat /etc/resolv.conf | grep -v '^#'

echo ""
echo "--- Resolution Speed ---"
for DNS in "System default" "1.1.1.1" "8.8.8.8" "9.9.9.9"; do
  if [ "$DNS" = "System default" ]; then
    TIME=$(dig "$DOMAIN" +noall +stats 2>/dev/null | awk '/Query time/{print $4}')
    IP=$(dig "$DOMAIN" +short 2>/dev/null | head -1)
  else
    TIME=$(dig "@$DNS" "$DOMAIN" +noall +stats 2>/dev/null | awk '/Query time/{print $4}')
    IP=$(dig "@$DNS" "$DOMAIN" +short 2>/dev/null | head -1)
  fi
  printf "  %-16s %4sms  -> %s\n" "$DNS" "${TIME:-?}" "${IP:-failed}"
done
