const fs=require("fs"),path=require("path"),os=require("os");
const p=path.join(os.homedir(),"forge","components","preview-panel.tsx");
let c=fs.readFileSync(p,"utf-8");
console.log("Read",c.length,"chars");
