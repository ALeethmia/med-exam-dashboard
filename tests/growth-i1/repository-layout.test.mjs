import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const map=JSON.parse(readFileSync(path.join(root,'docs/REPOSITORY_LAYOUT_B_MAP.json'),'utf8'));
const moved=map.files.filter(file=>file.action==='move-with-compatibility-export');
const reverse=new Map(moved.map(file=>[file.implementation,file.from]));
const hash=value=>createHash('sha256').update(value).digest('hex');
const specifiers=/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(['"])([^'"\n]+)\2/g;
function tree(directory){return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?tree(path.join(directory,entry.name)):[path.join(directory,entry.name)]);}
test('mapping covers every original root JS/CSS/JSON/HTML/config file',()=>{
 const actual=readdirSync(root,{withFileTypes:true}).filter(entry=>entry.isFile()&&/\.(js|css|json|html|cjs)$/.test(entry.name)).map(entry=>entry.name).sort();
 assert.deepEqual(map.files.map(file=>file.from).sort(),actual);assert.equal(moved.length,14);
});
test('entry points, Classic scripts, stores, CSS, cache and deployment configuration remain byte identical',()=>{
 for(const file of map.files.filter(file=>file.action==='keep'))assert.equal(hash(readFileSync(path.join(root,file.from))),file.originalSHA256,file.from);
});
test('relocated implementation source is identical after reversing only import paths',()=>{
 for(const file of moved){
  const source=readFileSync(path.join(root,file.implementation),'utf8');
  const normalized=source.replace(specifiers,(match,prefix,quote,specifier)=>{
   if(!specifier.startsWith('.'))return match;
   const current=path.posix.normalize(path.posix.join(path.posix.dirname(file.implementation),specifier));
   const old=reverse.get(current)||current;let relative=path.posix.relative(path.posix.dirname(file.from)||'.',old);
   if(!relative.startsWith('.'))relative='./'+relative;
   return prefix+quote+relative+quote;
  });
  assert.equal(hash(normalized),file.originalSHA256,file.implementation);
 }
});
test('legacy URL modules forward every export to the same canonical implementation instance',async()=>{
 for(const file of moved){
  const bridge=readFileSync(path.join(root,file.from),'utf8');
  assert.equal(bridge,"// Compatibility URL: implementation moved without changing its exports.\nexport * from './"+file.implementation+"';\n");
  const legacy=await import(pathToFileURL(path.join(root,file.from))),canonical=await import(pathToFileURL(path.join(root,file.implementation)));
  assert.deepEqual(Object.keys(legacy),Object.keys(canonical),file.from);
  for(const key of Object.keys(legacy))assert.equal(legacy[key],canonical[key],file.from+' export '+key);
 }
});
test('all relative ES imports, dynamic imports and re-exports resolve to real files',()=>{
 const files=[...tree(path.join(root,'src')),...readdirSync(root).filter(name=>name.endsWith('.js')).map(name=>path.join(root,name))];let checked=0;
 for(const file of files){const source=readFileSync(file,'utf8');for(const match of source.matchAll(specifiers)){const specifier=match[3];if(!specifier.startsWith('.'))continue;const target=new URL(specifier,pathToFileURL(file));assert(existsSync(target),file+' → '+specifier);checked++;}}
 assert(checked>60);
});
test('HTML script/stylesheet order, inline bootstrap and existing resource URLs remain unchanged',()=>{
 for(const name of ['index.html','kingdom-preview.html']){
  const original=map.files.find(file=>file.from===name);const html=readFileSync(path.join(root,name));assert.equal(hash(html),original.originalSHA256,name);
  const assets=[...html.toString().matchAll(/(?:src|href)=["'](\.\/[^"']+)["']/g)].map(match=>match[1]);
  for(const asset of assets){const target=new URL(asset,pathToFileURL(path.join(root,name)));assert(existsSync(target),asset);}
 }
});
