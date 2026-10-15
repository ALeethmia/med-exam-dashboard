import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const map=JSON.parse(readFileSync(path.join(root,'docs/REPOSITORY_LAYOUT_FINAL_MAP.json'),'utf8'));
const aliases=JSON.parse(readFileSync(path.join(root,'config/legacy-assets.json'),'utf8'));
const old=JSON.parse(readFileSync(path.join(root,'docs/REPOSITORY_LAYOUT_B_MAP.json'),'utf8'));
const specifiers=/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(['"])([^'"\n]+)\2/g;
const hash=v=>createHash('sha256').update(v).digest('hex');
function tree(directory){return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?tree(path.join(directory,entry.name)):[path.join(directory,entry.name)]);}
test('root compatibility files are removed and every former URL has one canonical target',()=>{
 assert.deepEqual(aliases,map.legacyURLs);assert.equal(Object.keys(aliases).length,32);
 for(const [a,b] of Object.entries(aliases)){assert(!existsSync(path.join(root,a)),a);assert(existsSync(path.join(root,b)),b);assert(!aliases[b],b+' must not chain');}
 assert.equal(readdirSync(root).filter(f=>f.endsWith('.js')).length,19);
 assert.equal(readdirSync(root).filter(f=>f.endsWith('.css')).length,0);
});
test('every product module is identical after normalizing only import paths',()=>{
 for(const entry of map.productSources){
  if(entry.path==='server.js')continue; // Hosting-only compatibility adapter checked separately.
  const normalized=readFileSync(path.join(root,entry.path),'utf8').replace(specifiers,(match,prefix,quote,spec)=>{
   if(!spec.startsWith('.'))return match;
   const [name,...query]=spec.split('?');
   const target=path.posix.normalize(path.posix.join(path.posix.dirname(entry.path),name));
   return prefix+quote+'@/'+(aliases[target]||target)+(query.length?'?'+query.join('?'):'')+quote;
  });assert.equal(hash(normalized),entry.sha256,entry.path);
 }
});
test('server and Vercel serve legacy bridges/CSS without redirects or duplicate implementations',()=>{
 const v=JSON.parse(readFileSync(path.join(root,'vercel.json')));
 assert.deepEqual(v.rewrites,Object.entries(aliases).map(([a,b])=>({source:'/'+a,destination:a.endsWith('.js')?'/compat/'+a:'/'+b})));
 for(const [a,b] of Object.entries(aliases))if(a.endsWith('.js'))assert.equal(readFileSync(path.join(root,'compat',a),'utf8'),"// Served at the legacy URL; use the canonical module instance.\nexport * from '/"+b+"';\n");
 const source=readFileSync(path.join(root,'server.js'),'utf8');assert.match(source,/res\.sendFile/);assert.match(source,/etag:false, lastModified:false/);assert.match(source,/config\/legacy-assets\.json/);
 assert.deepEqual(v.git,JSON.parse('{"deploymentEnabled":{"codex/growth-i1-integration":false}}'));
});
test('all relative ES imports, dynamic imports and re-exports resolve to canonical real files',()=>{
 const files=[...tree(path.join(root,'src')),...readdirSync(root).filter(n=>n.endsWith('.js')).map(n=>path.join(root,n))];let checked=0;
 for(const file of files)for(const match of readFileSync(file,'utf8').matchAll(specifiers)){
  if(!match[3].startsWith('.'))continue;
  const target=new URL(match[3],pathToFileURL(file));assert(existsSync(target),file+' → '+match[3]);checked++;
 }assert(checked>60);
});
test('HTML bootstrap and script order are unchanged except canonical stylesheet/module URLs',()=>{
 for(const name of ['index.html','kingdom-preview.html']){
  let html=readFileSync(path.join(root,name),'utf8');
  for(const [a,b] of Object.entries(aliases))html=html.replaceAll('src="./'+b+'"','src="./'+a+'"').replaceAll('href="./'+b+'"','href="./'+a+'"');
  assert.equal(hash(html),old.files.find(f=>f.from===name).originalSHA256,name);
 }
});
test('CSS bytes and initialization/storage/deployment essentials remain unchanged',()=>{
 for(const f of old.files.filter(f=>f.from.endsWith('.css')||['theme.js','subjects.js','sync.js','firebase-config.js','owner-config.js','package.json','package-lock.json','metadata.json'].includes(f.from))){
  let content=readFileSync(path.join(root,aliases[f.from]||f.from));
  if(['package.json','package-lock.json'].includes(f.from)){
   const metadata=JSON.parse(content);
   assert.equal(metadata.version,'1.0.0',f.from+' release version');
   metadata.version='0.2.0'; // Normalize only the authorized version fields to the frozen baseline.
   if(f.from==='package-lock.json'){
    assert.equal(metadata.packages[''].version,'1.0.0','lock root release version');
    metadata.packages[''].version='0.2.0';
   }
   content=JSON.stringify(metadata,null,2)+'\n';
  }
  assert.equal(hash(content),f.originalSHA256,f.from);
 }
});
