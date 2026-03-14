#!/bin/bash
echo "=== SD Card Health ==="

echo "--- Device Info ---"
lsblk -o NAME,SIZE,TYPE,MODEL /dev/mmcblk0 2>/dev/null || lsblk -o NAME,SIZE,TYPE 2>/dev/null | head -5

echo ""
echo "--- Filesystem ---"
df -h / | awk 'NR==2{printf "Used: %s of %s (%s)\n", $3, $2, $5}'

echo ""
echo "--- I/O Stats ---"
if [ -f /sys/block/mmcblk0/stat ]; then
  read -r READS _ RSEC _ WRITES _ WSEC _ _ _ _ <<< $(cat /sys/block/mmcblk0/stat)
  echo "Total reads: $READS ($(echo "$RSEC" | awk '{printf "%.1f GB", $1*512/1073741824}'))"
  echo "Total writes: $WRITES ($(echo "$WSEC" | awk '{printf "%.1f GB", $1*512/1073741824}'))"
fi

echo ""
echo "--- Write Speed Test ---"
WRITE_SPEED=$(dd if=/dev/zero of=/tmp/sd_test bs=1M count=10 oflag=direct 2>&1 | grep -oP '[\d.]+ [MG]B/s')
echo "Write: ${WRITE_SPEED:-N/A}"
rm -f /tmp/sd_test

echo ""
echo "--- Read Speed Test ---"
echo 3 | sudo tee /proc/sys/vm/drop_caches >/dev/null 2>&1
READ_SPEED=$(dd if=/dev/mmcblk0 of=/dev/null bs=1M count=50 iflag=direct 2>&1 | grep -oP '[\d.]+ [MG]B/s')
echo "Read: ${READ_SPEED:-N/A}"

echo ""
echo "--- CID (Card ID) ---"
cat /sys/block/mmcblk0/device/cid 2>/dev/null || echo "N/A"

echo "--- Manufacturer ---"
cat /sys/block/mmcblk0/device/name 2>/dev/null || echo "N/A"

echo "--- Life Time Est ---"
if [ -f /sys/block/mmcblk0/device/life_time ]; then
  cat /sys/block/mmcblk0/device/life_time
else
  echo "N/A (not exposed by this card)"
fi
