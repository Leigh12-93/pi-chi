import sys

q = chr(39)
bt = chr(96)
bsl = chr(92)
dl = chr(36)
nl = chr(10)

lines = []
lines.append(q + "use client" + q)
lines.append("")
lines.append("import { useState, useEffect, useCallback } from " + q + "react" + q)
lines.append("import {")
lines.append("  Server, Play, Square, RefreshCw, ChevronDown, ChevronRight,")
lines.append("  CircleCheck, CircleX, CirclePause, Loader2,")
lines.append("} from " + q + "lucide-react" + q)
lines.append("import { cn } from " + q + "@/lib/utils" + q)
lines.append("import { motion, AnimatePresence } from " + q + "framer-motion" + q)

filepath = r"C:" + bsl + "Users" + bsl + "leigh" + bsl + "pi-chi" + bsl + "components" + bsl + "agent" + bsl + "services-panel.tsx"
with open(filepath, "w", encoding="utf-8", newline=nl) as f:
    f.write(nl.join(lines))
print("Test write OK")
