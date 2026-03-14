#!/bin/bash
echo "=== Active Network Connections ==="

echo "--- ESTABLISHED ---"
ss -tnp state established 2>/dev/null | head -20

echo ""
echo "--- LISTENING ---"
ss -tlnp 2>/dev/null | head -20

echo ""
echo "--- Connection Summary ---"
echo "  ESTABLISHED: $(ss -tn state established 2>/dev/null | tail -n +2 | wc -l)"
echo "  LISTEN:      $(ss -tln 2>/dev/null | tail -n +2 | wc -l)"
echo "  TIME-WAIT:   $(ss -tn state time-wait 2>/dev/null | tail -n +2 | wc -l)"
echo "  CLOSE-WAIT:  $(ss -tn state close-wait 2>/dev/null | tail -n +2 | wc -l)"

echo ""
echo "--- Top Remote IPs ---"
ss -tn state established 2>/dev/null | awk 'NR>1{split($5,a,":"); print a[1]}' | sort | uniq -c | sort -rn | head -5
