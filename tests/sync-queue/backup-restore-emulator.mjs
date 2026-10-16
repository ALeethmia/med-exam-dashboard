// Disposable synthetic server data only; endpoint and credentials are supplied by the loopback runner.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const canonical=value=>value&&typeof value==='object'?(Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}'):JSON.stringify(value);
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
const leaves=(value,path='')=>value===null?[]:typeof value!=='object'?[[path,typeof value,value]]:Object.entries(value).flatMap(([key,child])=>leaves(child,path+'/'+key)).sort((a,b)=>a[0].localeCompare(b[0]));
export async function verifyBackupRestore({read,admin,check}){
 const source=JSON.parse(readFileSync(new URL('../fixtures/synthetic-restore.json',import.meta.url),'utf8'));
 const expected=structuredClone(source);
 expected.videos=[null,true,false,null,true];expected.custom_events['2026-10-01']=[null,{id:'synthetic-event',text:'合成事件',color:'emerald'}];
 expected.questOS.v1.restoreProof={dense:[null,'first',false,null,0],sparse:{'4':'last'},numericObject:['a','b'],nested:[{kept:'value'},null,{count:2}]};
 const expectedRoots=['checklist','custom_events','habits','pharmacology','physiology','questOS','videos'];let exported;
 await check('restore: seven-root synthetic JSON preserves every non-null leaf and scalar type on server read',async()=>{
  assert.deepEqual(Object.keys(source).sort(),expectedRoots);await admin('',source);exported=await read('');
  assert.deepEqual(Object.keys(exported).sort(),expectedRoots);assert.deepEqual(exported,expected);assert.deepEqual(leaves(exported),leaves(source));
  assert.equal(await read('videos/0'),null);assert.equal(await read('videos/5'),null);assert.equal(await read('videos/2'),false);assert.equal(await read('questOS/v1/restoreProof/dense/4'),0);
  const proof=exported.questOS.v1.restoreProof;
  for(const key of ['allNull','emptyArray','emptyObject','nullField'])assert.equal(Object.hasOwn(proof,key),false);
  console.log('RESTORE_NORMALIZATION '+JSON.stringify({videos:exported.videos,customEvents:exported.custom_events,proof,sourceSha256:hash(source),serverSha256:hash(exported)}));
 });
 await check('restore: clearing the synthetic instance then restoring its server export is a full-tree fixed point',async()=>{
  const bytes=JSON.stringify(exported),parsed=JSON.parse(bytes),digest=hash(parsed);assert.deepEqual(parsed,exported);
  await admin('',null);assert.equal(await read(''),null);await admin('',parsed);const restored=await read('');
  assert.deepEqual(restored,exported);assert.deepEqual(leaves(restored),leaves(source));assert.deepEqual(Object.keys(restored).sort(),expectedRoots);assert.equal(hash(restored),digest);
  // Restoring the original input produces the same server-normalized result too.
  await admin('',null);await admin('',source);assert.deepEqual(await read(''),exported);
 });
}
