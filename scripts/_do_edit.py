import os
import re

home = os.path.expanduser("~")
ppath = os.path.join(home, "forge", "components", "preview-panel.tsx")
with open(ppath, "r", encoding="utf-8") as fh:
    c = fh.read()
print(f"Read {len(c)} chars")

# Edit 1: Add import
old_imp = "} from './preview/preview-utils'"
new_imp = old_imp + "
" + "import { parseErrorReferences, normalizeErrorPath } from '@/lib/error-parser'"
c = c.replace(old_imp, new_imp, 1)
print("Edit 1: import added")

# Edit 2: Replace ErrorMessageWithFileLinks
sm = "/** Extract clickable file paths from error messages that match project files */"
em = "

export const PreviewPanel"
si = c.find(sm)
ei = c.find(em)
assert si >= 0, "start not found"
assert ei >= 0, "end not found"
nc_path = os.path.join(home, "forge", "scripts", "_new_comp.txt")
with open(nc_path, "r", encoding="utf-8") as ncf:
    nc = ncf.read()
c = c[:si] + nc + c[ei:]
print("Edit 2: component replaced")

# Edit 3: sandboxError
o3 = '<p className="text-[10px] text-red-400 font-mono mt-0.5 line-clamp-3" title={sandboxError}>{sandboxError}</p>'
n3 = '<p className="text-[10px] text-red-400 font-mono mt-0.5 line-clamp-3" title={sandboxError}><ErrorMessageWithFileLinks message={sandboxError} files={files} /></p>'
if o3 in c:
    c = c.replace(o3, n3, 1)
    print("Edit 3: sandboxError done")
else:
    print("Edit 3: SKIP")
