// Offline preparation only. No network, Firebase SDK, identity acquisition or production executor.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {OWNER_UID} from '../owner-config.js';
import {createBlankAccountPlan,RESET_CLOUD_PATHS} from '../src/study/reset-plan.js';
import {makeCourseRules,makeFrozenCourseRules} from './course-rules-candidate.mjs';
export const MANAGED_TARGET=Object.freeze({projectId:'my-exam-1aab9',instanceId:'my-exam-1aab9-default-rtdb',ownerUID:OWNER_UID});
const canonical=v=>v&&typeof v==='object'?(Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}'):JSON.stringify(v);
const hash=v=>createHash('sha256').update(canonical(v)).digest('hex');
const rawHash=v=>createHash('sha256').update(v).digest('hex');
const at=(v,p)=>p.split('/').reduce((n,k)=>n?.[k],v)??null;
const leaves=v=>v===null?0:typeof v!=='object'?1:Object.values(v).reduce((n,x)=>n+leaves(x),0);
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const same=(a,b)=>canonical(a)===canonical(b);
const stages=[
 {stage:'read-only',writes:false,stop:'Live project/instance/UID, Rules provenance, ownership or complete server backup cannot be independently confirmed.'},
 {stage:'freeze',writes:true,authorization:'deployment:freeze',stop:'Reviewed frozen Rules hash differs or server readback / ordinary-writer rejection is unconfirmed; do not initialize.'},
 {stage:'final-snapshot',writes:false,stop:'Final frozen server export or isolated restore differs; previous backup cannot replace it.'},
 {stage:'initialize',writes:true,authorization:'account-reset:exact-patch',stop:'UID/path/hash/generation/era/backup drift, missing independent reset approval, concurrent admin or unknown PATCH result; stay frozen, never retry reset blindly.'},
 {stage:'active-rules',writes:true,authorization:'deployment:active-rules',stop:'Initialization/untouched UID verification or full Rules hash differs; retain/reinstall freeze.'},
 {stage:'website-switch',writes:true,authorization:'deployment:exact-artifact',stop:'Immutable maintenance/normal deployment IDs, reviewed Head or server prerequisites differ; do not promote.'},
 {stage:'smoke',writes:true,authorization:'deployment:specified-smoke',stop:'Approved Auth/sync/reload/XP/date checks fail; freeze and preserve new commits, never reopen legacy roots.'}
];
export async function createManagedDryRun(input){
 const allowed=['target','reviewHead','backupRaw','legacyRulesRaw','reviewedLegacyPaths','courseGeneration','lifeGeneration','localSnapshot','expectedHashes','worktreeDirty'];
 if(!object(input)||Object.keys(input).some(k=>!allowed.includes(k)))throw Error('managed/unsupported-input');
 if(!same(input.target,MANAGED_TARGET)||!MANAGED_TARGET.ownerUID)throw Error('managed/target-mismatch');
 if(!/^[0-9a-f]{40}$/.test(input.reviewHead||''))throw Error('managed/head-required');
 if(input.worktreeDirty!==undefined&&typeof input.worktreeDirty!=='boolean'||input.localSnapshot!==undefined&&!object(input.localSnapshot))throw Error('managed/invalid-local-evidence');
 if(!Array.isArray(input.reviewedLegacyPaths)||input.reviewedLegacyPaths.some(p=>!RESET_CLOUD_PATHS.includes(p))||new Set(input.reviewedLegacyPaths).size!==input.reviewedLegacyPaths.length)throw Error('managed/invalid-reviewed-paths');
 if(typeof input.backupRaw!=='string'||typeof input.legacyRulesRaw!=='string')throw Error('managed/raw-exports-required');
 const snapshot=JSON.parse(input.backupRaw),legacy=JSON.parse(input.legacyRulesRaw),uid=MANAGED_TARGET.ownerUID;
 if(!object(snapshot)||!Object.keys(snapshot).length)throw Error('managed/invalid-backup');
 // Accept only the explicitly reviewed legacy owner-root shape; unfamiliar Rules need review.
 const grants=[`auth != null && auth.uid === '${uid}'`,`auth.uid === '${uid}'`];
 const normalized=s=>typeof s==='string'?s.replaceAll('"',"'").replace(/\s+/g,' ').trim():s;
 if(!object(legacy.rules)||Object.keys(legacy).length!==1||Object.keys(legacy.rules).sort().join(',')!=='.read,.write'||!['.read','.write'].every(k=>grants.includes(normalized(legacy.rules[k]))))throw Error('managed/legacy-rules-review-required');
 if(snapshot.users!==undefined&&!object(snapshot.users))throw Error('managed/invalid-users-node');
 const prior=snapshot.users?.[uid];
 if(prior!==undefined&&!object(prior))throw Error('managed/invalid-uid-node');
 if(prior?.lifeV1!==undefined&&!object(prior.lifeV1))throw Error('managed/invalid-life-namespace');
 for(const [key,schema] of [['learningV3',3],['lifeControl',1]])if(prior?.[key]!==undefined){const d=prior[key];if(!object(d)||d.schema!==schema||typeof d.generation!=='string'||!d.generation||!Number.isSafeInteger(d.era)||d.era<0||(key==='learningV3'&&(!Number.isSafeInteger(d.clock)||d.clock<0)))throw Error('managed/invalid-fence');}
 const plan=await createBlankAccountPlan({verifiedUID:uid,ownerUID:uid,cloudSnapshot:snapshot,localSnapshot:input.localSnapshot||{},reviewedLegacyPaths:input.reviewedLegacyPaths||[],...(Object.hasOwn(input,'courseGeneration')?{courseGeneration:input.courseGeneration}:{}),...(Object.hasOwn(input,'lifeGeneration')?{lifeGeneration:input.lifeGeneration}:{})});
 for(const [file,rules] of [['database.rules.candidate.json',makeCourseRules('__REVIEWED_OWNER_UID__')],['database.rules.freeze.candidate.json',makeFrozenCourseRules('__REVIEWED_OWNER_UID__')]])if(!same(JSON.parse(readFileSync(new URL('../config/firebase/'+file,import.meta.url),'utf8')),rules))throw Error('managed/candidate-rules-drift');
 const freeze=makeFrozenCourseRules(uid),active=makeCourseRules(uid),root='users/'+uid;
 const allowedPaths=[...RESET_CLOUD_PATHS,root+'/learningV3',root+'/lifeControl',plan.emptyLifeNamespace];
 for(const [path,value] of Object.entries(plan.atomicUpdate))if(!allowedPaths.includes(path)||(RESET_CLOUD_PATHS.includes(path)&&value!==null))throw Error('managed/patch-scope');
 const hashes={backupFileSha256:rawHash(input.backupRaw),sourceSnapshotSha256:hash(snapshot),legacyRulesFileSha256:rawHash(input.legacyRulesRaw),frozenRulesSha256:hash(freeze),frozenRulesFileSha256:rawHash(JSON.stringify(freeze,null,2)+'\n'),activeRulesSha256:hash(active),activeRulesFileSha256:rawHash(JSON.stringify(active,null,2)+'\n'),patchSha256:hash(plan.atomicUpdate)};
 for(const [key,value] of Object.entries(input.expectedHashes||{}))if(!Object.hasOwn(hashes,key)||value!==hashes[key])throw Error('managed/hash-mismatch:'+key);
 return {format:'becoming-managed-dry-run-v1',mode:'offline-dry-run',executable:false,authorizationGranted:false,productionExecutorIncluded:false,target:{...MANAGED_TARGET},reviewHead:input.reviewHead,worktreeDirty:input.worktreeDirty!==false,hashes,
  generations:{course:plan.canonicalFence.replacement.generation,courseEra:plan.canonicalFence.replacement.era,life:plan.lifeFence.replacement.generation,lifeEra:plan.lifeFence.replacement.era},
  atomicUpdate:plan.atomicUpdate,allowedPaths:Object.keys(plan.atomicUpdate).sort(),
  changes:Object.entries(plan.atomicUpdate).map(([path,value])=>({path,operation:value===null?(at(snapshot,path)===null?'empty-namespace':'delete'):(at(snapshot,path)===null?'create':'replace'),beforeSha256:hash(at(snapshot,path)),afterSha256:hash(value),beforeLeaves:leaves(at(snapshot,path)),afterLeaves:leaves(value)})),
  localKeys:plan.localKeys,stages:structuredClone(stages),provenanceVerified:false,
  blockers:['No production authorization or executor is included.','Server origin/completeness, frozen final snapshot, legacy ownership and external generation non-reuse require independent verification.','Missing local snapshot is not proof that no UID local keys exist.','Approve exact target, Head, backup/Rules/patch hashes and separate deployment/reset stages; hashes alone are not authorization.']};
}
export async function verifyManagedDryRun(packet,input,approvedPatchSha256){
 const expected=await createManagedDryRun({...input,courseGeneration:packet?.generations?.course,lifeGeneration:packet?.generations?.life});
 if(!same(packet,expected)||approvedPatchSha256!==expected.hashes.patchSha256)throw Error('managed/packet-or-approved-hash-mismatch');
 return {valid:true,executable:false,authorizationGranted:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),synthetic=args[0]==='--synthetic',flags={};
 const rest=synthetic?args.slice(1):args;
 for(let i=0;i<rest.length;i+=2){if(!['--out','--backup','--legacy-rules','--reviewed-paths'].includes(rest[i])||!rest[i+1]||rest[i+1].startsWith('--')||Object.hasOwn(flags,rest[i]))throw Error('managed/unsupported-cli');flags[rest[i]]=rest[i+1];}
 if(!flags['--out']||synthetic&&(flags['--backup']||flags['--legacy-rules']||flags['--reviewed-paths'])||!synthetic&&(!flags['--backup']||!flags['--legacy-rules']||!flags['--reviewed-paths']))throw Error('Use --synthetic --out FILE, or --backup FILE --legacy-rules FILE --reviewed-paths FILE --out FILE. No apply mode exists.');
 const uid=MANAGED_TARGET.ownerUID,backupRaw=synthetic?readFileSync(new URL('../tests/fixtures/synthetic-restore.json',import.meta.url),'utf8'):readFileSync(flags['--backup'],'utf8');
 const legacyRulesRaw=synthetic?JSON.stringify({rules:{'.read':`auth != null && auth.uid === '${uid}'`,'.write':`auth != null && auth.uid === '${uid}'`}}):readFileSync(flags['--legacy-rules'],'utf8');
 const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const packet=await createManagedDryRun({target:MANAGED_TARGET,reviewHead:head,worktreeDirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),backupRaw,legacyRulesRaw,reviewedLegacyPaths:synthetic?RESET_CLOUD_PATHS:JSON.parse(readFileSync(flags['--reviewed-paths'],'utf8'))});
 // A path-review file is offline evidence only; it never authorizes a production operation.
 mkdirSync(dirname(flags['--out']),{recursive:true});writeFileSync(flags['--out'],JSON.stringify(packet,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({executable:false,synthetic,head,changes:packet.changes.length,patchSha256:packet.hashes.patchSha256,output:flags['--out']}));
}
