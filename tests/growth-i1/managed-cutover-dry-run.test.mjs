import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {MANAGED_TARGET,createManagedDryRun,verifyManagedDryRun} from '../../scripts/managed-cutover-dry-run.mjs';
import {RESET_CLOUD_PATHS} from '../../src/study/reset-plan.js';
const uid=MANAGED_TARGET.ownerUID;
function input(){
 const cloud={...JSON.parse(readFileSync(new URL('../fixtures/synthetic-restore.json',import.meta.url))),users:{'synthetic-other':{progress:'keep'}},courseDefinitions:{keep:true}};
 return {target:{...MANAGED_TARGET},reviewHead:'46ccc1c94871c22764a15182418ec47264d7b708',worktreeDirty:false,backupRaw:JSON.stringify(cloud),legacyRulesRaw:JSON.stringify({rules:{'.read':`auth != null && auth.uid === '${uid}'`,'.write':`auth != null && auth.uid === '${uid}'`}}),reviewedLegacyPaths:RESET_CLOUD_PATHS,courseGeneration:'dry-course-synthetic',lifeGeneration:'dry-life-synthetic',localSnapshot:{['becoming_uid_v1:'+uid+':pending']:'synthetic-pending','becoming_uid_v1:synthetic-other:pending':'keep'}};
}
test('offline synthetic packet binds target, full backup/Rules/hash, exact diff and inert atomic update',async()=>{
 const i=input(),before=structuredClone(i),packet=await createManagedDryRun(i);assert.deepEqual(i,before);
 assert.equal(packet.executable,false);assert.equal(packet.productionExecutorIncluded,false);assert.equal(packet.authorizationGranted,false);assert.equal(packet.provenanceVerified,false);
 assert.equal(packet.hashes.backupFileSha256,createHash('sha256').update(i.backupRaw).digest('hex'));
 assert.equal(packet.atomicUpdate['users/'+uid+'/learningV3'].clock,0);assert.equal(packet.generations.courseEra,0);assert.equal(packet.generations.lifeEra,0);
 assert(packet.changes.some(row=>row.path==='videos'&&row.operation==='delete'&&row.beforeLeaves>0&&row.afterLeaves===0));
 assert(!packet.allowedPaths.some(p=>p.includes('synthetic-other')||p.includes('courseDefinitions')));assert.equal(packet.localKeys.length,1);
 assert.deepEqual(await verifyManagedDryRun(packet,i,packet.hashes.patchSha256),{valid:true,executable:false,authorizationGranted:false});assert(!JSON.stringify(packet).includes('synthetic-event'));
 assert.deepEqual(packet.stages.map(s=>[s.stage,s.writes]),[['read-only',false],['freeze',true],['final-snapshot',false],['initialize',true],['active-rules',true],['website-switch',true],['smoke',true]]);
});
test('packet/checker reject target, approval-like flags, ownership, backup, Rules and patch drift',async()=>{
 const i=input(),packet=await createManagedDryRun(i);
 const direct=await createManagedDryRun(i);direct.stages[3].authorization='deployment-without-reset';await assert.rejects(verifyManagedDryRun(direct,i,direct.hashes.patchSha256),/packet-or-approved/);assert.equal((await createManagedDryRun(i)).stages[3].authorization,'account-reset:exact-patch');
 for(const target of [{...i.target,projectId:'other'},{...i.target,instanceId:'other'},{...i.target,ownerUID:'other'}])await assert.rejects(createManagedDryRun({...i,target}),/target-mismatch/);
 for(const extra of [{apply:true},{dryRun:false},{authorized:true},{url:'https://other.firebaseio.com'}])await assert.rejects(createManagedDryRun({...i,...extra}),/unsupported-input/);
 await assert.rejects(createManagedDryRun({...i,reviewedLegacyPaths:[]}),/ownership/);
 for(const changed of [{courseGeneration:''},{lifeGeneration:null}])await assert.rejects(createManagedDryRun({...i,...changed}),/fresh-generation/);
 await assert.rejects(createManagedDryRun({...i,reviewedLegacyPaths:['users/synthetic-other']}),/invalid-reviewed-paths/);
 await assert.rejects(createManagedDryRun({...i,localSnapshot:null}),/invalid-local-evidence/);
 await assert.rejects(createManagedDryRun({...i,legacyRulesRaw:JSON.stringify({rules:{'.read':true,'.write':true}})}),/rules-review/);
 await assert.rejects(createManagedDryRun({...i,expectedHashes:{backupFileSha256:'0'.repeat(64)}}),/hash-mismatch/);
 await assert.rejects(verifyManagedDryRun(packet,{...i,backupRaw:i.backupRaw.replace('synthetic-event','changed-event')},packet.hashes.patchSha256),/packet-or-approved/);
 await assert.rejects(verifyManagedDryRun(packet,i,'0'.repeat(64)),/approved-hash/);
 for(const mutate of [p=>p.atomicUpdate['users/synthetic-other/progress']=null,p=>p.atomicUpdate['habits']=true,p=>p.atomicUpdate['users/'+uid+'/learningV3'].era++,p=>p.executable=true,p=>p.generations.life='replaced']){const changed=structuredClone(packet);mutate(changed);await assert.rejects(verifyManagedDryRun(changed,i,packet.hashes.patchSha256));}
});
test('existing fences rotate eras and reused generations/invalid fences stop planning',async()=>{
 const i=input(),tree=JSON.parse(i.backupRaw);tree.users[uid]={learningV3:{schema:3,generation:'prior-course',era:4,clock:7},lifeControl:{schema:1,generation:'prior-life',era:9},lifeV1:{used:{habits:{old:true}}}};i.backupRaw=JSON.stringify(tree);
 const p=await createManagedDryRun(i);assert.equal(p.generations.courseEra,5);assert.equal(p.generations.lifeEra,10);
 for(const changed of [{courseGeneration:'prior-course'},{lifeGeneration:'prior-life'},{lifeGeneration:'used'}])await assert.rejects(createManagedDryRun({...i,...changed}),/fresh-generation/);
 tree.users[uid].learningV3.schema=2;await assert.rejects(createManagedDryRun({...i,backupRaw:JSON.stringify(tree)}),/invalid-fence/);
});
test('CLI rejects apply/dry-run toggles before any production capability or output',()=>{
 for(const flag of ['--apply','--execute','--dry-run','--production']){const r=spawnSync(process.execPath,['scripts/managed-cutover-dry-run.mjs','--synthetic',flag,'true','--out','work/review2/forbidden-managed-output.json'],{encoding:'utf8'});assert.notEqual(r.status,0);assert.match(r.stderr,/unsupported-cli/);assert.equal(existsSync('work/review2/forbidden-managed-output.json'),false);}
});
