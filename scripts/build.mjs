import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),out=process.env.DIST_DIR?path.resolve(process.env.DIST_DIR):path.join(root,'dist');
// Authoring files the browser never loads. coverage and flag-remediation stay because the app fetches them.
const authoringOnly=/^(review-queue.*|lecture-sources|collection-rules)\.json$/;
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
function copy(src,dst){if(fs.statSync(src).isDirectory()){fs.mkdirSync(dst,{recursive:true});for(const n of fs.readdirSync(src)){if(authoringOnly.test(n))continue;copy(path.join(src,n),path.join(dst,n));}}else fs.copyFileSync(src,dst);}
for(const n of ['index.html','app.js','engine.js','bank-config.js','progress-migration.js','styles.css','assets','data'])copy(path.join(root,n),path.join(out,n));
console.log('Built offline static app in '+path.relative(root,out));
