// Separate managed entry. No Firebase SDK, arbitrary URL, root PUT, Auth or deployment API.
import {createHash,createPublicKey,verify} from 'node:crypto';
import {readFileSync,writeFileSync,statSync,realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,isAbsolute} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createManagedDryRun,MANAGED_TARGET,verifyManagedDryRun} from './managed-cutover-dry-run.mjs';
import {canonical,digest,emulatorAddress} from './emulator-cutover.mjs';
import {makeCourseRules,makeFrozenCourseRules} from './course-rules-candidate.mjs';
import {RESET_CLOUD_PATHS} from '../src/study/reset-plan.js';
const rawHash=v=>createHash('sha256').update(v).digest('hex');
const stages=['freeze','final-snapshot','initialize','active-rules'];
const purposes={'freeze':'deployment:freeze','final-snapshot':'read-only:final-snapshot','initialize':'account-reset:exact-patch','active-rules':'deployment:active-rules'};
const fail=code=>{throw Error('executor/'+code);};
const equal=(a,b)=>canonical(a)===canonical(b);
const publicFingerprint=pem=>rawHash(createPublicKey(pem).export({type:'spki',format:'der'}));
export {publicFingerprint};
function patchTree(tree,patch){
 const out=structuredClone(tree);
 for(const [path,value] of Object.entries(patch)){const parts=path.split('/'),key=parts.pop();let parent=out;for(const part of parts)parent=parent[part]??={};if(value===null)delete parent[key];else parent[key]=structuredClone(value);}
 // RTDB removes empty containers, represents dense numeric-key objects as arrays, and removes nulls.
 function normalize(v){if(v===null)return null;if(typeof v!=='object')return v;const entries=Object.entries(v).map(([k,x])=>[k,normalize(x)]).filter(([,x])=>x!==null);if(!entries.length)return null;const obj=Object.fromEntries(entries);if(entries.every(([k])=>/^(0|[1-9][0-9]*)$/.test(k))){const max=Math.max(...entries.map(([k])=>Number(k)));if(max<2*entries.length&&max<1000000){const a=Array(max+1).fill(null);for(const [k,x]of entries)a[Number(k)]=x;return a;}}return obj;}
 return normalize(out);
}
export async function validatePacket({packet,input,head}){
 if(!/^[a-f0-9]{40}$/.test(head||'')||head!==packet?.reviewHead||input.reviewHead!==head||packet.worktreeDirty!==false||input.worktreeDirty!==false)fail('immutable-clean-head-required');
 await verifyManagedDryRun(packet,input,packet.hashes.patchSha256);
}
export function approvalRequest({packet,stage,operation,expiresAt,previous=null,finalBackupSha256=null,now=Date.now()}){
 if(!stages.includes(stage)||!/^cutover-[a-z0-9-]{8,80}$/.test(operation||''))fail('stage-or-operation');
 if(!Number.isSafeInteger(expiresAt)||expiresAt<=now||expiresAt-now>3600000)fail('expiry');
 return {format:'becoming-stage-approval-v1',stage,purpose:purposes[stage],operation,target:MANAGED_TARGET,reviewHead:packet.reviewHead,packetSha256:digest(packet),hashes:packet.hashes,allowedPaths:packet.allowedPaths,generations:packet.generations,previousReceiptSha256:previous?digest(previous):null,finalBackupSha256,issuedAt:now,expiresAt,onFailure:'freeze-only',assertions:{serverBackupComplete:true,legacyPathsOwnedByTarget:true,generationsNeverUsed:true,exclusiveAdminWindow:true,restoreVerified:true}};
}
// Only this private factory runs a stage. Production and Emulator constructors below have distinct trust sources.
function executor({transport,ledger,policy,head,now=()=>Date.now()}){
 async function run({packet,input,manifest,signature,publicKey,previous=null,finalBackupRaw=null,saveSnapshot}){
  await validatePacket({packet,input,head});
  const m=manifest;
  if(!m||!Number.isSafeInteger(m.issuedAt)||!Number.isSafeInteger(m.expiresAt)||m.issuedAt>now()||m.expiresAt<=now()||m.expiresAt-m.issuedAt>3600000||m.expiresAt<=m.issuedAt)fail('expired-or-invalid-approval');
  let fingerprint,valid=false;try{fingerprint=publicFingerprint(publicKey);valid=verify('sha256',Buffer.from(canonical(m)),publicKey,Buffer.from(signature,'base64'));}catch{fail('approval-signature');}
  if(fingerprint!==policy.approvalPublicKeySha256||!valid)fail('approval-signature');
  const expected=approvalRequest({packet,stage:m.stage,operation:m.operation,expiresAt:m.expiresAt,previous,finalBackupSha256:m.finalBackupSha256,now:m.issuedAt});
  if(!equal(m,expected))fail('manifest-mismatch');
  const index=stages.indexOf(m.stage),key=m.operation+'/'+m.stage;
  if(index===0){if(previous!==null||m.finalBackupSha256!==null)fail('unexpected-predecessor');}
  else{
   const stored=await ledger.read(m.operation+'/'+stages[index-1]+'/receipt');
   if(!stored||!equal(stored,previous)||previous.stage!==stages[index-1]||previous.packetSha256!==digest(packet)||previous.operation!==m.operation||previous.status!=='confirmed')fail('predecessor-unconfirmed');
  }
  // Global packet claim prevents replay under a different operation ID, even on another host.
  // Both claims are durable create-if-absent, never deleted, including unknown outcomes.
  if(['initialize','active-rules'].includes(m.stage)){
   const receiptBackup=m.stage==='initialize'?previous.backupFileSha256:previous.finalBackupSha256;
   if(typeof finalBackupRaw!=='string'||rawHash(finalBackupRaw)!==m.finalBackupSha256||m.finalBackupSha256!==receiptBackup||digest(JSON.parse(finalBackupRaw))!==packet.hashes.sourceSnapshotSha256)fail('final-backup-mismatch');
  }else if(m.finalBackupSha256!==null)fail('unexpected-final-backup');
  // Ensure all checks and authorization occur before any network mutation or lock acquisition.
  const frozen=makeFrozenCourseRules(MANAGED_TARGET.ownerUID),active=makeCourseRules(MANAGED_TARGET.ownerUID);
  const rules=await transport.rules(),tree=await transport.read();
  const expectedTree=patchTree(JSON.parse(input.backupRaw),packet.atomicUpdate);
  if(m.stage==='freeze'){
   if(!equal(rules,JSON.parse(input.legacyRulesRaw))||digest(tree)!==packet.hashes.sourceSnapshotSha256)fail('initial-server-drift');
  }else{
   if(!equal(rules,frozen))fail('freeze-not-confirmed');
   if(!equal(tree,m.stage==='active-rules'?expectedTree:JSON.parse(input.backupRaw)))fail('server-data-drift');
  }
  if(m.expiresAt<=now())fail('approval-expired-before-claim');
  await ledger.claim(key+'/claim',{manifestSha256:digest(m)});
  if(m.stage==='initialize')await ledger.claim('patches/'+packet.hashes.patchSha256,{operation:m.operation});
  if(m.expiresAt<=now())fail('approval-expired-before-write');
  const receipt={format:'becoming-stage-receipt-v1',operation:m.operation,stage:m.stage,packetSha256:digest(packet),manifestSha256:digest(m),status:'confirmed'};
  try{
   if(m.stage==='freeze'){
    await transport.setRules(frozen);if(!equal(await transport.rules(),frozen))fail('freeze-readback');
    // A racing admin/client before freeze must cause a stop, not initialize from an earlier backup.
    if(digest(await transport.read())!==packet.hashes.sourceSnapshotSha256)fail('freeze-source-drift');
   }else if(m.stage==='final-snapshot'){
    const serialized=JSON.stringify(tree)+'\n';if(typeof saveSnapshot!=='function')fail('private-snapshot-sink-required');
    await saveSnapshot(serialized);receipt.backupFileSha256=rawHash(serialized);receipt.sourceSnapshotSha256=digest(tree);
   }else if(m.stage==='initialize'){
    // Exactly one PATCH. Never retry, even when transport throws after server commit.
    await transport.initialize(packet.atomicUpdate);
    if(!equal(await transport.read(),expectedTree))fail('initialize-readback');
    receipt.finalBackupSha256=m.finalBackupSha256;receipt.resultSha256=digest(expectedTree);
   }else{
    await transport.setRules(active);if(!equal(await transport.rules(),active))fail('active-readback');
    receipt.finalBackupSha256=m.finalBackupSha256;receipt.resultSha256=digest(expectedTree);
   }
   await ledger.claim(key+'/receipt',receipt);return receipt;
  }catch(cause){
   // Never restore old root grants. Active may have committed: immediately attempt freeze once.
   let freezeConfirmed=false,result='unavailable';
   try{if(m.stage==='active-rules')await transport.setRules(frozen);freezeConfirmed=equal(await transport.rules(),frozen);}catch{}
   try{result=digest(await transport.read())===digest(expectedTree)?'approved-result-present':'different-or-uncommitted';}catch{}
   // Hash/status only; no values, tokens, or raw HTTP errors in logs. Claim stays consumed.
   throw Object.assign(Error('executor/stopped-no-retry'),{stage:m.stage,freezeConfirmed,readback:result,causeCode:cause?.message?.startsWith('executor/')?cause.message:'transport-or-artifact-failure'});
  }
 }
 return {run};
}
// Tests cannot inject this policy into the production constructor or change its endpoint.
export function emulatorExecutor({origin,namespace,ledger,publicKeySha256,head,transportFault,now}){
 const base=emulatorAddress(origin,namespace);
 const request=async(path,method='GET',body)=>{
  const response=await fetch(base+'/'+path+'.json?ns='+namespace,{method,redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer owner','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!response.ok)fail('emulator-http-'+response.status);return response.json();
 };
 const transport={read:()=>request(''),rules:()=>request('.settings/rules'),setRules:async v=>{await request('.settings/rules','PUT',v);if(transportFault==='lost-freeze-response'&&equal(v,makeFrozenCourseRules(MANAGED_TARGET.ownerUID))||transportFault==='lost-active-response'&&equal(v,makeCourseRules(MANAGED_TARGET.ownerUID)))throw Error('lost-response');},initialize:async v=>{if(transportFault==='initialize-not-sent')throw Error('not-sent');await request('','PATCH',v);if(transportFault==='lost-initialize-response')throw Error('lost-response');}};
 return executor({transport,ledger,policy:{approvalPublicKeySha256:publicKeySha256},head,now});
}
const repo=new URL('../',import.meta.url);
function reviewedPolicy(){
 const policy=JSON.parse(readFileSync(new URL('config/firebase/managed-executor-policy.json',repo),'utf8'));
 if(policy.format!=='becoming-managed-policy-v1'||policy.enabled!==true||policy.projectId!==MANAGED_TARGET.projectId||policy.instanceId!==MANAGED_TARGET.instanceId||!/^https:\/\/my-exam-1aab9-default-rtdb(?:\.[a-z0-9-]+)?\.(?:firebaseio\.com|firebasedatabase\.app)$/.test(policy.databaseOrigin||'')||!/^becoming-cutover@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(policy.serviceAccount||'')||!policy.serviceAccount.endsWith('@'+MANAGED_TARGET.projectId+'.iam.gserviceaccount.com')||!/^becoming-cutover-[a-z0-9-]{6,50}$/.test(policy.ledgerBucket||'')||!/^[a-f0-9]{64}$/.test(policy.approvalPublicKeySha256||''))fail('production-trust-unconfigured');
 return policy;
}
function checkedHead(){
 const head=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
 if(execFileSync('git',['status','--porcelain','--untracked-files=all'],{cwd:repo,encoding:'utf8'}).trim())fail('dirty-checkout');return head;
}
async function productionExecutor(){
 const policy=reviewedPolicy(),head=checkedHead();
 // Only an impersonated, short-lived OAuth access token. No ADC/key/token input option exists.
 let token;try{token=execFileSync('gcloud',['auth','print-access-token','--impersonate-service-account='+policy.serviceAccount,'--lifetime=600s','--scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/firebase.database,https://www.googleapis.com/auth/userinfo.email','--quiet'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}catch{fail('short-lived-identity-unavailable');}
 if(!token||/\s/.test(token))fail('invalid-short-lived-identity');
 async function http(url,method='GET',body){
  const res=await fetch(url,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!res.ok)fail('http-'+res.status);return res.json();
 }
 const origin=policy.databaseOrigin;
 const transport={read:()=>http(origin+'/.json'),rules:()=>http(origin+'/.settings/rules.json'),setRules:v=>http(origin+'/.settings/rules.json','PUT',v),initialize:v=>http(origin+'/.json','PATCH',v)};
 const ledger=managedGCSLedger(policy.ledgerBucket,http);
 return executor({transport,ledger,policy,head});
}
export function managedGCSLedger(bucket,http){
 if(!/^becoming-cutover-[a-z0-9-]{6,50}$/.test(bucket))fail('ledger-bucket');
 const objectURL=key=>'https://storage.googleapis.com/storage/v1/b/'+bucket+'/o/'+encodeURIComponent('v1/'+key);
 return {read:async key=>{try{return await http(objectURL(key)+'?alt=media');}catch(e){if(e.message==='executor/http-404')return null;throw e;}},claim:(key,value)=>http('https://storage.googleapis.com/upload/storage/v1/b/'+bucket+'/o?uploadType=media&ifGenerationMatch=0&name='+encodeURIComponent('v1/'+key),'POST',value)};
}
function privateFile(path){
 const real=realpathSync(path),root=realpathSync(fileURLToPath(repo));
 if(real===root||real.startsWith(root+'/')||(statSync(real).mode&0o077)!==0||!statSync(real).isFile())fail('private-file-outside-repository-required');return readFileSync(real,'utf8');
}
function savePrivate(path,raw){if(!isAbsolute(path))fail('absolute-output-required');const parent=realpathSync(dirname(path));const root=realpathSync(fileURLToPath(repo));if(parent===root||parent.startsWith(root+'/')||(statSync(parent).mode&0o077)!==0)fail('private-directory-required');writeFileSync(path,raw,{flag:'wx',mode:0o600});}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2),command=args.shift();
  if(command==='status'&&args.length===0){let configured=false;try{reviewedPolicy();configured=true;}catch{}console.log(JSON.stringify({productionTrustConfigured:configured,writes:false,network:false,stages}));}
  else{
   const flags={};for(let i=0;i<args.length;i+=2){if(!['--packet','--input','--manifest','--signature','--public-key','--previous','--final-backup','--snapshot-out','--receipt-out','--stage','--operation','--expires-at','--out','--backup','--legacy-rules','--reviewed-paths','--out-dir'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--')||Object.hasOwn(flags,args[i]))fail('cli-arguments');flags[args[i]]=args[i+1];}
   if(command==='prepare'){
    if(Object.keys(flags).some(k=>!['--backup','--legacy-rules','--reviewed-paths','--out-dir'].includes(k))||!['--backup','--legacy-rules','--reviewed-paths','--out-dir'].every(k=>flags[k]))fail('prepare-arguments');
    const input={target:MANAGED_TARGET,reviewHead:checkedHead(),worktreeDirty:false,backupRaw:privateFile(flags['--backup']),legacyRulesRaw:privateFile(flags['--legacy-rules']),reviewedLegacyPaths:JSON.parse(privateFile(flags['--reviewed-paths']))};
    if(!input.reviewedLegacyPaths.every(p=>RESET_CLOUD_PATHS.includes(p)))fail('scope');
    const packet=await createManagedDryRun(input);input.courseGeneration=packet.generations.course;input.lifeGeneration=packet.generations.life;
    savePrivate(flags['--out-dir']+'/input.json',JSON.stringify(input));savePrivate(flags['--out-dir']+'/packet.json',JSON.stringify(packet));
    console.log(JSON.stringify({network:false,writes:false,reviewHead:packet.reviewHead,packetSha256:digest(packet),paths:packet.allowedPaths,hashes:packet.hashes,generations:packet.generations}));
   }else{
   if(!['request','run-stage'].includes(command)||!flags['--packet']||!flags['--input'])fail('usage-status-request-or-run-stage');
   const packet=JSON.parse(privateFile(flags['--packet'])),input=JSON.parse(privateFile(flags['--input'])),previous=flags['--previous']?JSON.parse(privateFile(flags['--previous'])):null;
   await validatePacket({packet,input,head:checkedHead()});
   if(command==='request'){
    if(Object.keys(flags).some(k=>!['--packet','--input','--previous','--final-backup','--stage','--operation','--expires-at','--out'].includes(k))||!flags['--out'])fail('request-arguments');
    const manifest=approvalRequest({packet,previous,stage:flags['--stage'],operation:flags['--operation'],expiresAt:Date.parse(flags['--expires-at']),finalBackupSha256:flags['--final-backup']?rawHash(privateFile(flags['--final-backup'])):null});
    // Canonical bytes are the exact file signed by Cloud KMS; no line ending conversion.
    savePrivate(flags['--out'],canonical(manifest));console.log(JSON.stringify({writes:false,network:false,manifestSha256:digest(manifest)}));
   }else{
    if(Object.keys(flags).some(k=>!['--packet','--input','--previous','--final-backup','--manifest','--signature','--public-key','--snapshot-out','--receipt-out'].includes(k))||!['--manifest','--signature','--public-key','--receipt-out'].every(k=>flags[k]))fail('stage-arguments');
    const manifest=JSON.parse(privateFile(flags['--manifest']));
    if((manifest.stage==='final-snapshot')!==!!flags['--snapshot-out'])fail('snapshot-output-required-only-for-snapshot-stage');
    // Acquire identity only after offline packet, signature and trusted key validation.
    const policy=reviewedPolicy(),publicKey=privateFile(flags['--public-key']),signature=privateFile(flags['--signature']).trim();
    if(publicFingerprint(publicKey)!==policy.approvalPublicKeySha256||!verify('sha256',Buffer.from(canonical(manifest)),publicKey,Buffer.from(signature,'base64')))fail('approval-signature');
    const runner=await productionExecutor();
    const result=await runner.run({packet,input,manifest,signature,publicKey,previous,finalBackupRaw:flags['--final-backup']?privateFile(flags['--final-backup']):null,saveSnapshot:raw=>savePrivate(flags['--snapshot-out'],raw)});
    savePrivate(flags['--receipt-out'],JSON.stringify(result)+'\n');console.log(JSON.stringify(result));
   }
   }
  }
 }catch(e){console.error(JSON.stringify({error:e.message?.startsWith('executor/')||e.message?.startsWith('managed/')?e.message:'executor/stopped',...(e.freezeConfirmed===undefined?{}:{freezeConfirmed:e.freezeConfirmed,readback:e.readback})}));process.exitCode=1;}
}
