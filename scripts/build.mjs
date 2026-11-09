import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'dist');fs.mkdirSync(out,{recursive:true});
function copy(src,dst){if(fs.statSync(src).isDirectory()){fs.mkdirSync(dst,{recursive:true});for(const n of fs.readdirSync(src))copy(path.join(src,n),path.join(dst,n));}else{if(fs.existsSync(dst))fs.unlinkSync(dst);try{fs.linkSync(src,dst);}catch{fs.copyFileSync(src,dst);}}}
for(const n of ['index.html','app.js','engine.js','bank-config.js','progress-migration.js','styles.css','assets','data'])copy(path.join(root,n),path.join(out,n));
console.log('Built offline static app in dist');
