#!/bin/bash
echo "=== Firewall Status ==="

if command -v ufw &>/dev/null; then
  echo "--- UFW ---"
  sudo ufw status verbose 2>/dev/null || ufw status 2>/dev/null || echo "UFW: requires sudo"
  echo ""
fi

echo "--- iptables (INPUT chain) ---"
sudo iptables -L INPUT -n -v --line-numbers 2>/dev/null || iptables -L INPUT -n 2>/dev/null || echo "iptables: requires sudo"

echo ""
echo "--- iptables (FORWARD chain) ---"
sudo iptables -L FORWARD -n -v --line-numbers 2>/dev/null || iptables -L FORWARD -n 2>/dev/null || echo "iptables: requires sudo"

echo ""
echo "--- fail2ban ---"
if command -v fail2ban-client &>/dev/null; then
  sudo fail2ban-client status 2>/dev/null || echo "fail2ban: requires sudo"
  echo ""
  sudo fail2ban-client status sshd 2>/dev/null || true
else
  echo "fail2ban: not installed"
fi
