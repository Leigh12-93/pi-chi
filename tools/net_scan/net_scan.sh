#!/bin/bash
SUBNET="$1"

echo "=== LAN Scan: ${SUBNET}.0/24 ==="
echo "Scanning..."

# Use nmap if available, fall back to ping sweep
if command -v nmap &>/dev/null; then
  nmap -sn "${SUBNET}.0/24" 2>/dev/null | grep -E "^(Nmap scan|Host is|MAC)" | sed 's/Nmap scan report for //'
else
  # Parallel ping sweep
  for i in $(seq 1 254); do
    ping -c 1 -W 1 "${SUBNET}.${i}" &>/dev/null && echo "${SUBNET}.${i} UP $(getent hosts ${SUBNET}.${i} 2>/dev/null | awk '{print $2}')" &
  done
  wait
fi

echo ""
echo "=== ARP Table (known devices) ==="
arp -a 2>/dev/null | grep -v incomplete | sort
