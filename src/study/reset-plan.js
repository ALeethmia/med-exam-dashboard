import {courseDocumentPath,emptyCourseDocument} from './course-contract.js';
// Offline planning/backup only. Intentionally has no Firebase, Auth or storage mutation API.
export const RESET_CLOUD_PATHS=Object.freeze(['videos','biochem','physiology','pharmacology','gamification/v1/days','gamification/v1/awards','gamification/v2/timeTasks','gamification/v3/planner/tasks','habits','questOS/v1/courseFirstCompletion','questOS/v1/training','questOS/v1/adaptiveStudy/settings','questOS/v1/courseSyncV2','custom_events','checklist']);
const at=(root,path)=>path.split('/').reduce((value,key)=>value?.[key],root);
function canonical(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';}
async function digest(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function createResetPlan({verifiedUID,ownerUID,cloudSnapshot,localSnapshot,unsettledWrites=0}={}){
 if(typeof verifiedUID!=='string'||!verifiedUID||verifiedUID!==ownerUID)throw Error('reset/identity-mismatch');
 if(!cloudSnapshot||typeof cloudSnapshot!=='object'||Array.isArray(cloudSnapshot)||!localSnapshot||typeof localSnapshot!=='object'||Array.isArray(localSnapshot))throw Error('reset/invalid-snapshot');
 const prefix='becoming_uid_v1:'+encodeURIComponent(verifiedUID)+':';
 const local=Object.fromEntries(Object.entries(localSnapshot).filter(([key])=>key.startsWith(prefix)));
 const canonicalPath=courseDocumentPath(verifiedUID),lifeControlPath='users/'+encodeURIComponent(verifiedUID)+'/lifeControl',lifeDataPath='users/'+encodeURIComponent(verifiedUID)+'/lifeV1',allowedPaths=[...RESET_CLOUD_PATHS,canonicalPath,lifeControlPath,lifeDataPath];
 const cloud=Object.fromEntries(allowedPaths.filter(path=>at(cloudSnapshot,path)!==undefined).map(path=>[path,at(cloudSnapshot,path)]));
 const backup={format:'becoming-reset-review-v1',uid:verifiedUID,cloud,local};const serialized=canonical(backup),sha256=await digest(serialized);
 const prior=at(cloudSnapshot,canonicalPath);const replacement={...emptyCourseDocument('REQUIRES_FRESH_REVIEWED_GENERATION'),era:(prior?.era||0)+1};
 const blockers=['The current owner-only schema uses shared root paths; UID ownership of every cloud child requires independent review.','Blank initialization requires independent cutover and reset authorization; keep client writes frozen until fences and active Rules are ready.','Server-enforced retirement is required: old course/date roots must deny all writes; canonical reset must rotate generation and increment era. Candidate Rules retire all seven shared writers; live enforcement and atomic rotation of lifeControl plus the course fence must be verified before reset.','A fresh explicit execution authorization is required.'];
 if(unsettledWrites)blockers.push('Unsettled or unknown writes remain: '+unsettledWrites);
 return {executable:false,uid:verifiedUID,canonicalFence:{path:canonicalPath,replacement},lifeFence:{path:lifeControlPath,replacement:{schema:1,generation:'REQUIRES_FRESH_REVIEWED_GENERATION',era:(at(cloudSnapshot,lifeControlPath)?.era||0)+1}},cloudPaths:Object.keys(cloud).map(key=>'/'+key),localKeys:Object.keys(local).sort(),untouchedCloudRoots:Object.keys(cloudSnapshot).filter(key=>!allowedPaths.some(path=>path===key||path.startsWith(key+'/'))).sort(),backup:{serialized,sha256},blockers};
}
export async function verifyResetBackup({serialized,sha256}={},expectedUID){
 if(typeof serialized!=='string'||await digest(serialized)!==sha256)throw Error('reset/backup-checksum');
 const backup=JSON.parse(serialized);if(backup.format!=='becoming-reset-review-v1'||backup.uid!==expectedUID)throw Error('reset/backup-identity');
 const prefix='becoming_uid_v1:'+encodeURIComponent(expectedUID)+':';
 if(Object.keys(backup.cloud||{}).some(key=>![...RESET_CLOUD_PATHS,courseDocumentPath(expectedUID),'users/'+encodeURIComponent(expectedUID)+'/lifeControl','users/'+encodeURIComponent(expectedUID)+'/lifeV1'].includes(key))||Object.keys(backup.local||{}).some(key=>!key.startsWith(prefix)))throw Error('reset/backup-scope');
 return backup;
}

// Review artifact only: never applies changes, authenticates, or contacts a server.
export async function createBlankAccountPlan(options={}){
 const {cloudSnapshot,reviewedLegacyPaths=[],courseGeneration=crypto.randomUUID(),lifeGeneration=crypto.randomUUID()}=options;
 const plan=await createResetPlan(options),uid=plan.uid;
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid))throw Error('reset/invalid-owner-uid');
 const root='users/'+encodeURIComponent(uid),prior=cloudSnapshot.users?.[uid]||{};
 const fresh=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(value)&&value!=='initial-v3'&&!value.startsWith('REQUIRES_');
 if(!fresh(courseGeneration)||!fresh(lifeGeneration)||courseGeneration===lifeGeneration||courseGeneration===prior.learningV3?.generation||lifeGeneration===prior.lifeControl?.generation||Object.hasOwn(prior.lifeV1||{},lifeGeneration))throw Error('reset/fresh-generation-required');
 const nextEra=value=>{if(value===undefined)return 0;if(!Number.isSafeInteger(value)||value<0||value>=Number.MAX_SAFE_INTEGER)throw Error('reset/invalid-era');return value+1;};
 const existing=RESET_CLOUD_PATHS.filter(path=>at(cloudSnapshot,path)!==undefined&&at(cloudSnapshot,path)!==null);
 if(existing.some(path=>!reviewedLegacyPaths.includes(path)))throw Error('reset/legacy-ownership-not-reviewed');
 const course={...emptyCourseDocument(courseGeneration),era:nextEra(prior.learningV3?.era)};
 const control={schema:1,generation:lifeGeneration,era:nextEra(prior.lifeControl?.era)};
 // Empty RTDB maps are absent. No sentinel is added to the seven Store schemas.
 const atomicUpdate={...Object.fromEntries(existing.map(path=>[path,null])),[root+'/learningV3']:course,[root+'/lifeControl']:control,[root+'/lifeV1/'+lifeGeneration]:null};
 return {...plan,canonicalFence:{path:root+'/learningV3',replacement:course},lifeFence:{path:root+'/lifeControl',replacement:control},
  requiresAuthorizations:['production-deployment','account-reset'],atomicUpdate,atomicUpdateSha256:await digest(canonical(atomicUpdate)),sourceSnapshotSha256:await digest(canonical(cloudSnapshot)),
  emptyLifeNamespace:root+'/lifeV1/'+lifeGeneration,
  blockers:[...plan.blockers,'This blank-start patch abandons legacy progress, including the shared historical XP sources; independent account-reset authorization is mandatory.','Input must be the final frozen server export; offline checks cannot establish provenance, ownership, or global generation uniqueness.']};
}

// Authenticated self-service plan. Uses the same fences and empty document as cutover;
// it never includes shared legacy roots, another UID, or administrator credentials.
export async function createSelfResetPlan({uid,course,life,settings=null,training=null,id=crypto.randomUUID(),allowInitialize=false}={}){
 if(typeof uid!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(uid)||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))throw Error('reset/identity');
 const initializing=allowInitialize&&course===null&&life===null;
 if(initializing){course={schema:3,generation:'uninitialized',era:-1};life={schema:1,generation:'uninitialized',era:-1};}
 if(course?.schema!==3||life?.schema!==1||typeof course.generation!=='string'||typeof life.generation!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(life.generation)||id===course.generation||'life_'+id===life.generation)throw Error('reset/control-unavailable');
 const next=value=>{if(initializing)return 0;if(!Number.isSafeInteger(value)||value<0||value>=Number.MAX_SAFE_INTEGER)throw Error('reset/era');return value+1;};
 const root='users/'+uid,receipt={courseEra:next(course.era),lifeEra:next(life.era),previousCourse:course.generation,previousLife:life.generation,at:{'.sv':'timestamp'}};
 const atomicUpdate={
  [root+'/learningV3']:{...emptyCourseDocument(id),era:receipt.courseEra},
  [root+'/lifeControl']:{schema:1,generation:'life_'+id,era:receipt.lifeEra,resetId:id},
  [root+'/lifeV1/'+life.generation]:null,
  [root+'/resetReceipts/'+id]:receipt
 };
 if(initializing)delete atomicUpdate[root+'/lifeV1/uninitialized'];
 for(const [bucket,value] of [['adaptiveStudy/settings',settings],['training',training]])if(value!==null)atomicUpdate[root+'/lifeV1/life_'+id+'/'+bucket]=value;
 return {uid,id,receipt,atomicUpdate,sha256:await digest(canonical(atomicUpdate))};
}
