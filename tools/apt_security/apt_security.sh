#!/bin/bash
echo "=== Security Update Status ==="

echo "--- Last apt update ---"
LAST_UPDATE=$(stat -c %y /var/cache/apt/pkgcache.bin 2>/dev/null | cut -d. -f1)
echo "  Cache updated: ${LAST_UPDATE:-Unknown}"

echo ""
echo "--- Available Updates ---"
UPGRADABLE=$(apt list --upgradable 2>/dev/null | grep -c upgradable)
echo "  Total upgradable: $UPGRADABLE"

echo ""
echo "--- Security Updates ---"
apt list --upgradable 2>/dev/null | grep -i security | head -10
SEC_COUNT=$(apt list --upgradable 2>/dev/null | grep -ci security)
echo "  Security updates: $SEC_COUNT"

echo ""
echo "--- Kernel ---"
echo "  Running: $(uname -r)"
INSTALLED=$(dpkg -l | grep linux-image | awk '{print $2, $3}' | head -3)
echo "  Installed: $INSTALLED"

echo ""
echo "--- Unattended Upgrades ---"
if dpkg -l unattended-upgrades 2>/dev/null | grep -q "^ii"; then
  echo "  Status: ENABLED"
  systemctl is-active unattended-upgrades 2>/dev/null | awk '{print "  Service: "$0}'
else
  echo "  Status: NOT INSTALLED"
  echo "  Install: sudo apt install unattended-upgrades"
fi

echo ""
echo "--- Reboot Required? ---"
if [ -f /var/run/reboot-required ]; then
  echo "  YES - reboot needed"
  cat /var/run/reboot-required.pkgs 2>/dev/null | head -5
else
  echo "  No reboot needed"
fi
