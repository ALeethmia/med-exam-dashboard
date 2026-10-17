// Emulator-only execution. No production credentials, production URL, or CLI apply mode.
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createBlankAccountPlan,RESET_CLOUD_PATHS} from '../src/study/reset-plan.js';
import {makeCourseRules,makeFrozenCourseRules} from './course-rules-candidate.mjs';
export const canonical=value=>value&&typeof value==='object'?(Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}'):JSON.stringify(value);
export const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
export function emulatorAddress(origin,namespace){
 const url=new URL(origin);
 if(url.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(url.hostname)||!url.port||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!/^demo-[a-z0-9-]{1,80}$/.test(namespace))throw Error('cutover/emulator-only');
 return url.origin;
}
export function emulatorClient(origin,namespace){
 const base=emulatorAddress(origin,namespace);
 async function request(path='',method='GET',value){
  if(!/^(?:[A-Za-z0-9_-]+|\.settings)(?:\/[A-Za-z0-9_-]+)*$/.test(path)&&path!=='')throw Error('cutover/invalid-path');
  const response=await fetch(base+'/'+path+'.json?ns='+namespace,{method,redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer owner','Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(value)})});
  if(!response.ok)throw Error('cutover/emulator-http-'+response.status);return response.json();
 }
 return {read:path=>request(path),put:(path,value)=>request(path,'PUT',value),patch:value=>request('','PATCH',value)};
}
const leaves=(value,path='')=>value===null?[]:typeof value!=='object'?[[path,typeof value,value]]:Object.entries(value).flatMap(([key,child])=>leaves(child,path+'/'+key)).sort((a,b)=>a[0].localeCompare(b[0]));
const patched=(tree,patch)=>{const out=structuredClone(tree);for(const [path,value] of Object.entries(patch)){const parts=path.split('/'),key=parts.pop();let parent=out;for(const part of parts)parent=parent[part]??={};if(value===null)delete parent[key];else parent[key]=structuredClone(value);}return out;};
export function verifyServerBackup(backup){
 if(!backup||typeof backup.serialized!=='string')throw Error('cutover/backup-format');
 const tree=JSON.parse(backup.serialized);if(digest(tree)!==backup.sha256)throw Error('cutover/backup-checksum');return tree;
}
export async function rehearseCutover({origin,namespace,uid='fixture-A',failAt,smoke}){
 emulatorAddress(origin,namespace);
 if(!/^fixture-[A-Za-z0-9_-]+$/.test(uid))throw Error('cutover/synthetic-uid-only');
 if(typeof smoke!=='function')throw Error('cutover/smoke-required');
 if(failAt!==undefined&&!['freeze','snapshot','restore','initialized','active','smoke'].includes(failAt))throw Error('cutover/unknown-stage');
 const client=emulatorClient(origin,namespace),scratch=emulatorClient(origin,namespace+'-restore');
 const frozen=makeFrozenCourseRules(uid),active=makeCourseRules(uid),stages=[],artifacts={emulatorOnly:true,productionExecutable:false,frozenRulesSha256:digest(frozen),activeRulesSha256:digest(active)};
 async function stage(name){stages.push(name);if(failAt===name)throw Error('cutover/injected-'+name);}
 try{
  await client.put('.settings/rules',frozen);assert.deepEqual(await client.read('.settings/rules'),frozen);await stage('freeze');
  const snapshot=await client.read('');if(!snapshot||typeof snapshot!=='object')throw Error('cutover/empty-source');
  artifacts.backup={serialized:JSON.stringify(snapshot),sha256:digest(snapshot),bytes:Buffer.byteLength(JSON.stringify(snapshot),'utf8')};const backup=verifyServerBackup(artifacts.backup);await stage('snapshot');
  // Restore into a separate disposable namespace; never clear the source instance.
  await scratch.put('.settings/rules',frozen);await scratch.put('',null);assert.equal(await scratch.read(''),null);await scratch.put('',backup);assert.deepEqual(await scratch.read(''),backup);await stage('restore');
  const plan=await createBlankAccountPlan({verifiedUID:uid,ownerUID:uid,cloudSnapshot:backup,localSnapshot:{},reviewedLegacyPaths:RESET_CLOUD_PATHS});
  artifacts.plan=plan;assert.equal(plan.sourceSnapshotSha256,artifacts.backup.sha256);assert.equal(digest(plan.atomicUpdate),plan.atomicUpdateSha256);
  assert.equal(digest(await client.read('')),artifacts.backup.sha256,'Frozen source changed before initialization');
  await client.patch(plan.atomicUpdate);assert.deepEqual(leaves(await client.read('')),leaves(patched(backup,plan.atomicUpdate)));await stage('initialized');
  await client.put('.settings/rules',active);assert.deepEqual(await client.read('.settings/rules'),active);await stage('active');
  await smoke(plan);await stage('smoke');return {...artifacts,stages,state:'active'};
 }catch(cause){
  let freezeConfirmed=false;
  try{await client.put('.settings/rules',frozen);assert.deepEqual(await client.read('.settings/rules'),frozen);freezeConfirmed=true;}catch{}
  throw Object.assign(new Error(freezeConfirmed?'cutover/stopped-frozen':'cutover/freeze-unconfirmed',{cause}),{freezeConfirmed,stages,artifacts});
 }
}
