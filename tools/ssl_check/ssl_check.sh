#!/bin/bash
DOMAIN="$1"

echo "=== SSL Certificate: $DOMAIN ==="

CERT_INFO=$(echo | openssl s_client -servername "$DOMAIN" -connect "${DOMAIN}:443" 2>/dev/null | openssl x509 -noout -subject -issuer -dates -fingerprint 2>/dev/null)

if [ -z "$CERT_INFO" ]; then
  echo "Failed to retrieve SSL certificate for $DOMAIN"
  exit 1
fi

echo "$CERT_INFO"

# Calculate days until expiry
EXPIRY=$(echo | openssl s_client -servername "$DOMAIN" -connect "${DOMAIN}:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$EXPIRY" ]; then
  EXPIRY_EPOCH=$(date -d "$EXPIRY" +%s 2>/dev/null)
  NOW_EPOCH=$(date +%s)
  DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))
  echo ""
  if [ "$DAYS_LEFT" -lt 0 ]; then
    echo "STATUS: EXPIRED ($((DAYS_LEFT * -1)) days ago)"
  elif [ "$DAYS_LEFT" -lt 14 ]; then
    echo "STATUS: EXPIRING SOON ($DAYS_LEFT days left)"
  else
    echo "STATUS: VALID ($DAYS_LEFT days remaining)"
  fi
fi
