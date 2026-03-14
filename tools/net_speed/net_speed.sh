#!/bin/bash
echo "=== Network Speed Test ==="

# Test download speed with Cloudflare 10MB file
echo "Downloading 10MB test file from Cloudflare..."
RESULT=$(curl -o /dev/null -w '%{speed_download} %{time_total} %{size_download}' -s 'https://speed.cloudflare.com/__down?bytes=10000000' 2>/dev/null)

SPEED_BPS=$(echo "$RESULT" | awk '{print $1}')
TIME=$(echo "$RESULT" | awk '{print $2}')
SIZE=$(echo "$RESULT" | awk '{print $3}')

if [ -z "$SPEED_BPS" ] || [ "$SPEED_BPS" = "0" ]; then
  echo "Speed test failed - no connectivity"
  exit 1
fi

SPEED_MBPS=$(echo "$SPEED_BPS" | awk '{printf "%.2f", $1 * 8 / 1000000}')
echo "Download: ${SPEED_MBPS} Mbps"
echo "Time: ${TIME}s"
echo "Size: $(echo "$SIZE" | awk '{printf "%.1f MB", $1/1000000}')"

echo ""
echo "=== Latency ==="
ping -c 3 -W 2 1.1.1.1 2>/dev/null | tail -1 | awk -F'/' '{printf "Cloudflare DNS: min=%sms avg=%sms max=%sms\n", $4,$5,$6}'
ping -c 3 -W 2 8.8.8.8 2>/dev/null | tail -1 | awk -F'/' '{printf "Google DNS:     min=%sms avg=%sms max=%sms\n", $4,$5,$6}'

echo ""
echo "=== Connection Info ==="
IP=$(curl -s --max-time 5 https://ifconfig.me 2>/dev/null)
echo "Public IP: ${IP:-N/A}"
echo "Gateway: $(ip route | grep default | awk '{print $3}')"
