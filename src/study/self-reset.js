import {createSelfResetPlan} from './reset-plan.js';
const PREFIX='reset_evidence_v1:';
export function resetEvidence(storage){return storage.keys().filter(key=>key.startsWith(PREFIX)).map(key=>JSON.parse(storage.getItem(key)));}
export function createResetRest(databaseURL,{fetcher=globalThis.fetch,timeoutMs=15000}={}){
 const base=new URL(databaseURL);
 const loopback=base.protocol==='http:'&&base.hostname==='127.0.0.1';
 if(!loopback&&!(base.protocol==='https:'&&/\.(firebaseio\.com|firebasedatabase\.app)$/.test(base.hostname)))throw Error('reset/database-url');
 if(base.username||base.password||base.hash||base.pathname!=='/'||(!loopback&&base.search))throw Error('reset/database-url');
 return async(path,token,{method='GET',body}={})=>{
  const url=new URL(base);url.pathname='/'+path+'.json';url.searchParams.set('auth',token);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const response=await fetcher(url.href,{method,cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal,
    headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
   if(!response.ok)throw Object.assign(Error('reset/http-'+response.status),{definite:[400,401,403,412].includes(response.status)});
   return method==='GET'?await response.json():true;
  }finally{clearTimeout(timer);}
 };
}
export async function performSelfReset({user,storage,rest,reauthenticate,valid=()=>true,stop=()=>{},reload=()=>{},id,allowInitialize=false}={}){
 if(!user?.uid||!user.email||!valid())throw Error('reset/auth-required');
 if(resetEvidence(storage).some(item=>item.phase!=='confirmed'))throw Error('reset/evidence-pending');
 await reauthenticate(user);
 const result=await user.getIdTokenResult(true),claims=result.claims;
 if(!valid()||claims.sub!==user.uid||claims.email_verified!==true||!Number.isFinite(claims.auth_time)||Math.abs(Date.now()/1000-claims.auth_time)>300)throw Error('reset/recent-verified-account-required');
 const root='users/'+user.uid;
 const contract=await rest(root+'/selfResetContract',result.token);
 if(contract?.version!==1)throw Error('reset/rules-cutover-required');
 const [course,life]=await Promise.all([rest(root+'/learningV3',result.token),rest(root+'/lifeControl',result.token)]);
 if(allowInitialize&&(course!==null||life!==null))throw Error('reset/already-initialized');
 const [settings,training]=life?await Promise.all(['adaptiveStudy/settings','training'].map(bucket=>rest(root+'/lifeV1/'+life.generation+'/'+bucket,result.token))):[null,null];
 const plan=await createSelfResetPlan({uid:user.uid,course,life,settings,training,id,allowInitialize});
 if(!valid())throw Error('reset/account-changed');
 const key=PREFIX+plan.id,evidence={uid:plan.uid,id:plan.id,sha256:plan.sha256,atomicUpdate:plan.atomicUpdate,courseEra:plan.receipt.courseEra,lifeEra:plan.receipt.lifeEra,phase:'prepared',preparedAt:Date.now()};
 // Durable evidence must succeed before retiring writers or making the only PATCH.
 storage.setItem(key,JSON.stringify(evidence));
 stop();
 try{
  await rest('',result.token,{method:'PATCH',body:plan.atomicUpdate});
  storage.setItem(key,JSON.stringify({...evidence,phase:'confirmed'}));
  clearResetCaches(storage);reload();return plan;
 }catch(error){
  // Never resend: even a lost ACK or a persistence failure can follow a commit.
  try{storage.setItem(key,JSON.stringify({...evidence,phase:error.definite?'rejected':'unknown'}));}catch{}
  throw error;
 }
}
export function clearResetCaches(storage){
 for(const key of storage.keys())if((/^med_exam_/.test(key)&&!['med_exam_theme','med_exam_active_tab','med_exam_active_subject'].includes(key))||key.startsWith('life_v1:'))storage.removeItem(key);
}
export async function reconcileSelfReset({user,storage,rest}){
 const pending=resetEvidence(storage).filter(item=>item.phase!=='confirmed');
 if(!pending.length)return true;
 const token=await user.getIdToken(true);
 for(const item of pending){
  if(item.uid!==user.uid)throw Error('reset/evidence-identity');
  const receipt=await rest('users/'+user.uid+'/resetReceipts/'+item.id,token);
  if(!receipt||receipt.courseEra!==item.courseEra||receipt.lifeEra!==item.lifeEra)return false;
  storage.setItem(PREFIX+item.id,JSON.stringify({...item,phase:'confirmed'}));
 }
 clearResetCaches(storage);return true;
}
