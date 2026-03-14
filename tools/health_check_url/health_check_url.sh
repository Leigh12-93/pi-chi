#!/bin/bash
URLS="$1"

echo "=== Health Check ==="
IFS=',' read -ra URL_LIST <<< "$URLS"

ALL_OK=1
for url in "${URL_LIST[@]}"; do
  RESULT=$(curl -o /dev/null -s -w '%{http_code} %{time_total} %{ssl_verify_result} %{size_download}' --max-time 15 "$url" 2>/dev/null)
  CODE=$(echo "$RESULT" | awk '{print $1}')
  TIME=$(echo "$RESULT" | awk '{print $2}')
  SSL=$(echo "$RESULT" | awk '{print $3}')
  SIZE=$(echo "$RESULT" | awk '{print $4}')

  if [ "$CODE" -ge 200 ] && [ "$CODE" -lt 400 ]; then
    STATUS="OK"
  elif [ "$CODE" -eq 000 ]; then
    STATUS="UNREACHABLE"
    ALL_OK=0
  else
    STATUS="ERROR"
    ALL_OK=0
  fi

  SSL_STATUS="N/A"
  if echo "$url" | grep -q "https"; then
    [ "$SSL" = "0" ] && SSL_STATUS="VALID" || SSL_STATUS="INVALID"
  fi

  printf "  %-40s HTTP %s  %ss  SSL:%s  %sB  [%s]\n" "$url" "$CODE" "$TIME" "$SSL_STATUS" "$SIZE" "$STATUS"
done

echo ""
if [ "$ALL_OK" -eq 1 ]; then
  echo "All endpoints healthy"
else
  echo "WARNING: Some endpoints have issues"
fi
