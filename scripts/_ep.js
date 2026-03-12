const fs=require("fs"),os=require("os"),path=require("path");
const p=path.join(os.homedir(),"forge","components","preview-panel.tsx");
let c=fs.readFileSync(p,"utf-8");
console.log("Read",c.length,"chars");
// Edit 1: Add import
c=c.replace("} from './preview/preview-utils'","} from './preview/preview-utils'
import { parseErrorReferences, normalizeErrorPath } from '@/lib/error-parser'");
console.log("Edit 1 done");
// Edit 2: Replace ErrorMessageWithFileLinks
const sm="/** Extract clickable file paths from error messages that match project files */";
const em="

export const PreviewPanel";
const si=c.indexOf(sm),ei=c.indexOf(em);
if(si<0||ei<0){console.log("MARKERS NOT FOUND",si,ei);process.exit(1);}
const nc=fs.readFileSync(path.join(os.homedir(),"forge","scripts","_new-component.tsx"),"utf-8");
c=c.slice(0,si)+nc+c.slice(ei);
console.log("Edit 2 done");
// Edit 3
const o3='<p className="text-[10px] text-red-400 font-mono mt-0.5 line-clamp-3" title={sandboxError}>{sandboxError}</p>';
const n3='<p className="text-[10px] text-red-400 font-mono mt-0.5 line-clamp-3" title={sandboxError}><ErrorMessageWithFileLinks message={sandboxError} files={files} /></p>';
if(c.includes(o3)){c=c.replace(o3,n3);console.log("Edit 3 done")}else console.log("Edit 3: SKIP");
// Edit 4
const o4='<p className="text-xs text-red-700 dark:text-red-400 flex-1">{iframeError}</p>';
const n4='<p className="text-xs text-red-700 dark:text-red-400 flex-1"><ErrorMessageWithFileLinks message={iframeError} files={files} /></p>';
if(c.includes(o4)){c=c.replace(o4,n4);console.log("Edit 4 done")}else console.log("Edit 4: SKIP");
// Edit 5
const o5='<span className="ml-1 break-all flex-1">{entry.message}</span>';
const n5='<span className="ml-1 break-all flex-1">{entry.level === 'error' ? <ErrorMessageWithFileLinks message={entry.message} files={files} maxLen={500} /> : entry.message}</span>';
if(c.includes(o5)){c=c.replace(o5,n5);console.log("Edit 5 done")}else console.log("Edit 5: SKIP");
// Edit 6
const o6="<ErrorMessageWithFileLinks message={e.message} files={files} onFileClick={onFileSelect} />";
const n6="<ErrorMessageWithFileLinks message={e.message} files={files} />";
while(c.includes(o6)){c=c.replace(o6,n6);}console.log("Edit 6 done");
// Write
fs.writeFileSync(p,c);
console.log("Written",c.length,"chars",c.split("
").length,"lines");
