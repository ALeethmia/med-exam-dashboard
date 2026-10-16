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
 const canonicalPath=courseDocumentPath(verifiedUID),allowedPaths=[...RESET_CLOUD_PATHS,canonicalPath];
 const cloud=Object.fromEntries(allowedPaths.filter(path=>at(cloudSnapshot,path)!==undefined).map(path=>[path,at(cloudSnapshot,path)]));
 const backup={format:'becoming-reset-review-v1',uid:verifiedUID,cloud,local};const serialized=canonical(backup),sha256=await digest(serialized);
 const prior=at(cloudSnapshot,canonicalPath);const replacement={...emptyCourseDocument('REQUIRES_FRESH_REVIEWED_GENERATION'),era:(prior?.era||0)+1};
 const blockers=['The current owner-only schema uses shared root paths; UID ownership of every cloud child requires independent review.','Production fix must be deployed and accepted before reset.','Server-enforced retirement is required: old course/date roots must deny all writes; canonical reset must rotate generation and increment era. Old non-course clients can still write shared life/task roots; reset is blocked until their retirement is independently proven.','A fresh explicit execution authorization is required.'];
 if(unsettledWrites)blockers.push('Unsettled or unknown writes remain: '+unsettledWrites);
 return {executable:false,uid:verifiedUID,canonicalFence:{path:canonicalPath,replacement},cloudPaths:Object.keys(cloud).map(key=>'/'+key),localKeys:Object.keys(local).sort(),untouchedCloudRoots:Object.keys(cloudSnapshot).filter(key=>!allowedPaths.some(path=>path===key||path.startsWith(key+'/'))).sort(),backup:{serialized,sha256},blockers};
}
export async function verifyResetBackup({serialized,sha256}={},expectedUID){
 if(typeof serialized!=='string'||await digest(serialized)!==sha256)throw Error('reset/backup-checksum');
 const backup=JSON.parse(serialized);if(backup.format!=='becoming-reset-review-v1'||backup.uid!==expectedUID)throw Error('reset/backup-identity');
 const prefix='becoming_uid_v1:'+encodeURIComponent(expectedUID)+':';
 if(Object.keys(backup.cloud||{}).some(key=>![...RESET_CLOUD_PATHS,courseDocumentPath(expectedUID)].includes(key))||Object.keys(backup.local||{}).some(key=>!key.startsWith(prefix)))throw Error('reset/backup-scope');
 return backup;
}
