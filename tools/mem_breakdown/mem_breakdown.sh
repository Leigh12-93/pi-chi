#!/bin/bash
echo "=== Memory Breakdown ==="
free -h

echo ""
echo "=== Detailed /proc/meminfo ==="
awk '/^(MemTotal|MemFree|MemAvailable|Buffers|Cached|SwapTotal|SwapFree|Dirty|Shmem|SReclaimable):/ {printf "%-16s %s\n", $1, $2" "$3}' /proc/meminfo

echo ""
echo "=== GPU Memory ==="
GPU_MEM=$(vcgencmd get_mem gpu 2>/dev/null | sed 's/gpu=//')
echo "GPU allocated: ${GPU_MEM:-N/A}"

echo ""
echo "=== Top 10 Memory Consumers ==="
ps aux --sort=-%mem | head -11 | awk 'NR==1{printf "%-10s %6s %6s %s\n","USER","%MEM","RSS","COMMAND"} NR>1{printf "%-10s %5s%% %5dM %s\n",$1,$4,$6/1024,$11}'
