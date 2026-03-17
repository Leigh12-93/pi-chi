#!/bin/bash
# Deploy pi-chi to Raspberry Pi — build locally, ship .next + source
set -e

PI_HOST="pi@pi-chi.local"
PI_DIR="/home/pi/pi-chi"
TMP_TAR="/tmp/pi-chi-next.tar.gz"

echo "=== Building locally ==="
npm run build

echo "=== Packaging .next ==="
tar czf "$TMP_TAR" .next

echo "=== Pushing git ==="
git push 2>/dev/null || echo "(nothing to push)"

echo "=== Uploading to Pi ==="
scp "$TMP_TAR" "$PI_HOST:/tmp/"

echo "=== Deploying on Pi ==="
ssh "$PI_HOST" "cd $PI_DIR && git stash -q 2>/dev/null; git pull --rebase origin master && rm -rf .next && tar xzf /tmp/pi-chi-next.tar.gz && sudo systemctl restart pi-chi-dashboard && echo 'Dashboard restarted' && sudo systemctl restart pi-chi-sms && echo 'SMS gateway restarted'"

rm -f "$TMP_TAR"
echo "=== Done ==="
