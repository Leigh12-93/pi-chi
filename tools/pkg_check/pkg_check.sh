#!/bin/bash
PACKAGES="$1"

if [ "$PACKAGES" = "upgradable" ]; then
  echo "=== Upgradable Packages ==="
  apt list --upgradable 2>/dev/null | head -30
  echo ""
  COUNT=$(apt list --upgradable 2>/dev/null | grep -c upgradable)
  echo "Total upgradable: $COUNT"
  exit 0
fi

echo "=== Package Status ==="
for pkg in $PACKAGES; do
  VERSION=$(dpkg -l "$pkg" 2>/dev/null | awk '/^ii/{print $3}')
  if [ -n "$VERSION" ]; then
    echo "  $pkg: INSTALLED ($VERSION)"
  else
    echo "  $pkg: NOT INSTALLED"
  fi
done

echo ""
echo "=== Node.js/npm ==="
node --version 2>/dev/null && echo "  Node: $(node --version)" || echo "  Node: not installed"
npm --version 2>/dev/null && echo "  npm: $(npm --version)" || true
python3 --version 2>/dev/null && echo "  Python: $(python3 --version)" || true
