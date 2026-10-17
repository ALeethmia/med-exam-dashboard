import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createManagedDryRun,MANAGED_TARGET} from '../../scripts/managed-cutover-dry-run.mjs';
import {approvalRequest,emulatorExecutor,publicFingerprint,LEDGER_ROOT,businessTree,managedRTDBLedger} from '../../scripts/managed-cutover-executor.mjs';
import {canonical,digest,emulatorClient} from '../../scripts/emulator-cutover.mjs';
import {makeFrozenCourseRules,makeCourseRules} from '../../scripts/course-rules-candidate.mjs';
import {RESET_CLOUD_PATHS} from '../../src/study/reset-plan.js';
const hash=v=>createHash('sha256').update(v).digest('hex');
const head='a'.repeat(40),uid=MANAGED_TARGET.ownerUID;
function memoryLedger(){const entries=new Map();return {entries,read:async k=>structuredClone(entries.get(k)||null),claim:async(k,v)=>{if(entries.has(k))throw Error('duplicate-claim');entries.set(k,structuredClone(v));}};}
export async function verifyManagedExecutor({origin,namespace,check}){
 const client=emulatorClient(origin,namespace+'-managed'),{privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),pem=publicKey.export({type:'spki',format:'pem'});
 const legacy={rules:{'.read':`auth != null && auth.uid === '${uid}'`,'.write':`auth != null && auth.uid === '${uid}'`}};
 const seed={...JSON.parse(readFileSync(new URL('../fixtures/synthetic-restore.json',import.meta.url))),users:{'synthetic-other-uid':{private:{untouched:false}}},definitions:{keep:'synthetic'}};
 async function setup(fault,realLedger=false){
  await client.put('',seed);await client.put('.settings/rules',legacy);
  const input={target:MANAGED_TARGET,reviewHead:head,worktreeDirty:false,backupRaw:JSON.stringify(await client.read('')),legacyRulesRaw:JSON.stringify(legacy),reviewedLegacyPaths:RESET_CLOUD_PATHS,courseGeneration:'managed-course-new',lifeGeneration:'managed-life-new'};
  const packet=await createManagedDryRun(input),ledger=realLedger?null:memoryLedger();let snapshot=null;
  const runner=emulatorExecutor({origin,namespace:namespace+'-managed',ledger,publicKeySha256:publicFingerprint(pem),head,transportFault:fault});
  function args(stage,previous=null,operation='cutover-synthetic-operation'){
   const manifest=approvalRequest({packet,stage,operation,expiresAt:Date.now()+120000,previous,finalBackupSha256:['initialize','active-rules'].includes(stage)?hash(snapshot):null});
   return {packet,input,manifest,signature:sign('sha256',Buffer.from(canonical(manifest)),privateKey).toString('base64'),publicKey:pem,previous,finalBackupRaw:snapshot,saveSnapshot:async raw=>{snapshot=raw;}};
  }
  const advance=async()=>{const freeze=await runner.run(args('freeze'));const final=await runner.run(args('final-snapshot',freeze));return {freeze,final};};
  return {input,packet,ledger,runner,args,advance,restart:()=>emulatorExecutor({origin,namespace:namespace+'-managed',publicKeySha256:publicFingerprint(pem),head})};
 }
 await check('managed executor: missing/wrong/expired/altered approvals and stage skipping cannot mutate data or Rules',async()=>{
  const s=await setup(),before=await client.read(''),rules=await client.read('.settings/rules');
  const a=s.args('freeze');
  const cases=[{...a,signature:''},{...a,publicKey:generateKeyPairSync('rsa',{modulusLength:2048}).publicKey.export({type:'spki',format:'pem'})},{...a,manifest:{...a.manifest,expiresAt:Date.now()-1}},{...a,manifest:{...a.manifest,target:{...a.manifest.target,ownerUID:'other'}}},{...a,manifest:{...a.manifest,allowedPaths:['users/other']}}];
  for(const bad of cases)await assert.rejects(s.runner.run(bad));
  for(const change of [p=>p.atomicUpdate['users/other/private']=null,p=>p.generations.courseEra++,p=>p.reviewHead='b'.repeat(40),p=>p.allowedPaths.push('checklist/extra'),p=>p.hashes.activeRulesSha256='0'.repeat(64)]){const packet=structuredClone(s.packet);change(packet);await assert.rejects(s.runner.run({...a,packet}));}
  // Even a correctly signed manifest cannot redirect the fixed coordination path.
  const redirected={...a.manifest,coordination:{backend:'rtdb-cas-v1',path:'users/other/cutoverAdmin/v1'}};
  await assert.rejects(s.runner.run({...a,manifest:redirected,signature:sign('sha256',Buffer.from(canonical(redirected)),privateKey).toString('base64')}),/manifest-mismatch/);
  // Valid signature alone cannot skip the previous stage receipt.
  await assert.rejects(s.runner.run(s.args('final-snapshot')));
  assert.deepEqual(await client.read(''),before);assert.deepEqual(await client.read('.settings/rules'),rules);assert.equal(s.ledger.entries.size,0);
 });
 await check('managed executor: independently approved four stages, final backup, one atomic PATCH, other UID and static data preserved',async()=>{
  const s=await setup(),before=await client.read(''),{final}=await s.advance();
  const init=await s.runner.run(s.args('initialize',final));assert.equal(init.status,'confirmed');
  assert.equal(await client.read('physiology'),null);assert.equal((await client.read('users/'+uid+'/learningV3')).generation,'managed-course-new');
  assert.deepEqual(await client.read('users/synthetic-other-uid'),before.users['synthetic-other-uid']);assert.deepEqual(await client.read('definitions'),before.definitions);
  await assert.rejects(s.runner.run({...s.args('active-rules',init),finalBackupRaw:null}),/final-backup-mismatch/);
  await assert.rejects(s.runner.run({...s.args('active-rules',init),finalBackupRaw:'{}'}),/final-backup-mismatch/);
  const active=await s.runner.run(s.args('active-rules',init));assert.equal(active.stage,'active-rules');assert.deepEqual(await client.read('.settings/rules'),makeCourseRules(uid));
  assert.equal(s.ledger.entries.size,10); // four claims, four receipts, permanent account and patch claims
 });
 await check('managed executor: backup drift, unconfirmed predecessor and stale source stop while frozen',async()=>{
  const s=await setup(),{final}=await s.advance(),a=s.args('initialize',final);
  await assert.rejects(s.runner.run({...a,finalBackupRaw:'{}'}),/final-backup-mismatch/);
  const fake={...final,sourceSnapshotSha256:'0'.repeat(64)};await assert.rejects(s.runner.run(s.args('initialize',fake)),/predecessor-unconfirmed/);
  await client.put('definitions/racing-admin',true);await assert.rejects(s.runner.run(a),/server-data-drift/);
  assert.deepEqual(await client.read('.settings/rules'),makeFrozenCourseRules(uid));assert(!s.ledger.entries.has(a.manifest.operation+'/initialize/claim'));
 });
 await check('managed executor: response lost after commit reads back and stops frozen; replay/concurrent/renamed operation cannot reset progress',async()=>{
  const s=await setup('lost-initialize-response'),{final}=await s.advance(),a=s.args('initialize',final);let failure;
  try{await s.runner.run(a);}catch(e){failure=e;}
  assert.equal(failure.message,'executor/stopped-no-retry');assert.equal(failure.readback,'approved-result-present');assert.equal(failure.freezeConfirmed,true);
  assert(!s.ledger.entries.has(a.manifest.operation+'/initialize/receipt'));
  await assert.rejects(s.runner.run(a));await assert.rejects(s.runner.run(s.args('active-rules',{stage:'initialize',status:'confirmed'})));
  assert.deepEqual(await client.read('.settings/rules'),makeFrozenCourseRules(uid));assert.deepEqual(await client.read('users/synthetic-other-uid'),seed.users['synthetic-other-uid']);
  // With an identical source read forced by two simultaneous workers, the durable claim allows one only.
  const next=await setup(),p=await next.advance(),attempt=next.args('initialize',p.final);
  const results=await Promise.allSettled([next.runner.run(attempt),next.runner.run(attempt)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  // A new operation cannot reuse the same approved patch even if an administrator restores old source.
  await client.put('',JSON.parse(next.input.backupRaw));await client.put('.settings/rules',legacy);
  const op='cutover-another-operation';const f=await next.runner.run(next.args('freeze',null,op));const snap=await next.runner.run(next.args('final-snapshot',f,op));
  await assert.rejects(next.runner.run(next.args('initialize',snap,op)),/duplicate-claim/);
  assert.deepEqual(await client.read(''),JSON.parse(next.input.backupRaw));
 });
 await check('managed executor: missing snapshot sink and ledger receipt failure stop frozen; active unknown result re-freezes without old grants',async()=>{
  const s=await setup(),f=await s.runner.run(s.args('freeze'));
  await assert.rejects(s.runner.run({...s.args('final-snapshot',f),saveSnapshot:async()=>{throw Error('disk-full');}}),e=>e.message==='executor/stopped-no-retry'&&e.freezeConfirmed);
  await assert.rejects(s.runner.run(s.args('final-snapshot',f)));assert.deepEqual(await client.read('.settings/rules'),makeFrozenCourseRules(uid));
  const next=await setup(),{final}=await next.advance(),init=await next.runner.run(next.args('initialize',final));
  const claim=next.ledger.claim;next.ledger.claim=async(k,v)=>{if(k.endsWith('active-rules/receipt'))throw Error('ledger-unavailable');return claim(k,v);};
  await assert.rejects(next.runner.run(next.args('active-rules',init)),e=>e.message==='executor/stopped-no-retry'&&e.freezeConfirmed);
  assert.deepEqual(await client.read('.settings/rules'),makeFrozenCourseRules(uid));
 });
 await check('managed executor: failure before PATCH leaves source intact and consumes attempt; freeze/active lost responses stop safely',async()=>{
  const s=await setup('initialize-not-sent'),{final}=await s.advance(),before=await client.read('');
  await assert.rejects(s.runner.run(s.args('initialize',final)),e=>e.message==='executor/stopped-no-retry'&&e.freezeConfirmed&&e.readback==='different-or-uncommitted');
  assert.deepEqual(await client.read(''),before);await assert.rejects(s.runner.run(s.args('initialize',final)));
  const f=await setup('lost-freeze-response');await assert.rejects(f.runner.run(f.args('freeze')),e=>e.message==='executor/stopped-no-retry'&&e.freezeConfirmed);
  assert.deepEqual(await client.read('.settings/rules'),makeFrozenCourseRules(uid));
  const a=await setup('lost-active-response'),p=await a.advance(),init=await a.runner.run(a.args('initialize',p.final));
  await assert.rejects(a.runner.run(a.args('active-rules',init)),e=>e.message==='executor/stopped-no-retry'&&e.freezeConfirmed);
  assert.deepEqual(await client.read('.settings/rules'),makeFrozenCourseRules(uid));
 });

 await check('NT$0: actual RTDB null_etag ledger survives all four stages; full backup contains metadata and other UID is untouched',async()=>{
  const s=await setup(undefined,true),before=await client.read(''),{final}=await s.advance(),a=s.args('initialize',final);
  const backup=JSON.parse(a.finalBackupRaw);assert(backup.users[uid].cutoverAdmin.v1);assert.equal(digest(backup),final.sourceSnapshotSha256);assert.equal(hash(a.finalBackupRaw),final.backupFileSha256);assert.deepEqual(businessTree(backup),businessTree(before));
  const init=await s.runner.run(a);await s.runner.run(s.args('active-rules',init));
  const ledger=await client.read(LEDGER_ROOT);assert.equal(ledger['initialize-once'].patchSha256,s.packet.hashes.patchSha256);assert.equal(ledger[a.manifest.operation].initialize.receipt.status,'confirmed');
  assert.deepEqual(await client.read('users/synthetic-other-uid'),before.users['synthetic-other-uid']);assert.deepEqual(await client.read('definitions'),before.definitions);
  // REST Emulator synthetic user token, never a production credential. Test leaf and ancestor bypass.
  const token=[{alg:'none',typ:'JWT'},{iss:'https://securetoken.google.com/'+namespace+'-managed',aud:namespace+'-managed',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,sub:uid,user_id:uid,firebase:{sign_in_provider:'custom',identities:{}}}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.')+'.';
  const permitted=await fetch(origin+'/users/'+uid+'/learningV3.json?ns='+namespace+'-managed&auth='+token);assert.equal(permitted.status,200,'synthetic token is valid, rather than all requests failing authentication');
  assert.equal((await permitted.json()).generation,'managed-course-new');
  for(const path of [LEDGER_ROOT+'/initialize-once','users/'+uid+'/cutoverAdmin','users/'+uid,'']){
   const res=await fetch(origin+'/'+path+'.json?ns='+namespace+'-managed&auth='+token,{method:'PUT',headers:{'Content-Type':'application/json'},body:'null'});assert.equal(res.status,401,'ordinary user cannot erase admin lock or ancestor');
  }
  assert.deepEqual(await client.read(LEDGER_ROOT),ledger);
 });
 await check('NT$0: two actual Emulator workers race one CAS; a fresh process cannot repeat initialization',async()=>{
  const s=await setup(undefined,true),{final}=await s.advance(),a=s.args('initialize',final);
  const outcomes=await Promise.allSettled([s.runner.run(a),s.restart().run(a)]);assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  const before=await client.read('');await assert.rejects(s.restart().run(a));assert.deepEqual(await client.read(''),before);
  // Different patch/operation still cannot acquire the permanent account-level one-shot lock.
  const ledger=managedRTDBLedger(async(path,method='GET',body,headers={})=>{const r=await fetch(origin+'/'+path+'.json?ns='+namespace+'-managed',{method,headers:{Authorization:'Bearer owner','Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});if(!r.ok)throw Error('CAS-'+r.status);return r.json();});
  await assert.rejects(ledger.claim('initialize-once',{operation:'different-approved-operation',patchSha256:'f'.repeat(64)}),/412/);assert.deepEqual(await client.read(''),before);
 });
 await check('NT$0: lost PATCH confirmation keeps permanent server lock and freeze; only metadata is excluded from comparisons',async()=>{
  const s=await setup('lost-initialize-response',true),{final}=await s.advance(),a=s.args('initialize',final);
  await assert.rejects(s.runner.run(a),e=>e.message==='executor/stopped-no-retry'&&e.freezeConfirmed&&e.readback==='approved-result-present');
  assert(await client.read(LEDGER_ROOT+'/initialize-once'));assert.equal(await client.read(LEDGER_ROOT+'/'+a.manifest.operation+'/initialize/receipt'),null);assert.deepEqual(await client.read('.settings/rules'),makeFrozenCourseRules(uid));
  const before=await client.read('');await assert.rejects(s.restart().run(a));assert.deepEqual(await client.read(''),before);
  const next=await setup(undefined,true),p=await next.advance();await client.put('users/synthetic-other-uid/private/untouched',true);
  await assert.rejects(next.runner.run(next.args('initialize',p.final)),/server-data-drift/);assert.equal(await client.read(LEDGER_ROOT+'/initialize-once'),null);
 });
 await check('NT$0: committed CAS with lost response is never retried and cannot be recreated by another process',async()=>{
  await setup(undefined,true);await client.put('.settings/rules',makeFrozenCourseRules(uid));let requests=0;
  const send=async(path,method='GET',body,headers={})=>{requests++;const r=await fetch(origin+'/'+path+'.json?ns='+namespace+'-managed',{method,headers:{Authorization:'Bearer owner','Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});if(!r.ok)throw Error('CAS-'+r.status);return r.json();};
  const lost=managedRTDBLedger(async(...args)=>{await send(...args);throw Error('lost-CAS-response');});
  const before=businessTree(await client.read(''));await assert.rejects(lost.claim('initialize-once',{spent:true}),/lost-CAS-response/);assert.equal(requests,1);
  await assert.rejects(managedRTDBLedger(send).claim('initialize-once',{spent:false}),/412/);assert.deepEqual(await client.read(LEDGER_ROOT+'/initialize-once'),{spent:true});assert.deepEqual(businessTree(await client.read('')),before);
 });

}
