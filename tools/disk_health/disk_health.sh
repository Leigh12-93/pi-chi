#!/bin/bash
echo "=== Disk Usage ==="
df -h --output=target,size,used,avail,pcent -x tmpfs -x devtmpfs 2>/dev/null || df -h

echo ""
echo "=== Inode Usage ==="
df -i --output=target,itotal,iused,iavail,ipcent -x tmpfs -x devtmpfs 2>/dev/null || df -i

echo ""
echo "=== I/O Statistics ==="
if command -v iostat &>/dev/null; then
  iostat -d -h 1 1 2>/dev/null | tail -n +4
else
  echo "--- /proc/diskstats (mmcblk0) ---"
  awk '$3 ~ /mmcblk0$/ {printf "Reads: %d completed, %d merged, %d sectors\nWrites: %d completed, %d merged, %d sectors\nI/O in progress: %d\n", $4,$5,$6,$8,$9,$10,$12}' /proc/diskstats 2>/dev/null || echo "No mmcblk0 found"
fi

echo ""
echo "=== Largest directories (top 5) ==="
du -sh /home/pi/* 2>/dev/null | sort -rh | head -5
