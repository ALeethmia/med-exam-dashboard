// Immutable local batches, original SDK promises and cooperative server reservations.
export const COURSE_JOURNAL_PREFIX='med_exam_course_write_v2:';
export const COURSE_REVISION_PREFIX='med_exam_course_revision_v2:';
export const COURSE_SYNC_PATH='questOS/v1/courseSyncV2';
const isCourse=path=>/^(videos|biochem|physiology|pharmacology)\/[A-Za-z0-9_-]{1,128}$/.test(path);
const clone=value=>JSON.parse(JSON.stringify(value));
const read=(root,path)=>path.split('/').reduce((v,k)=>v?.[k],root)??null;
const token=path=>path.replace('/','__');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function createCourseSync({storage,uid,valid,ready,locks,localOnly=false,newId=()=>crypto.randomUUID(),onChange=()=>{},onProjection=()=>{},events=globalThis.window,prepareDates=()=>({}),acceptDates=()=>false}={}){
 let database=null,running=null,requested=false,closed=false,lastError='',localError=false,observed={},listener=null;
 const acknowledged=new Set(),own=new Set();
 const alive=()=>!closed&&valid();
 function rows(){
  const result=[];
  for(let i=0;i<storage.length;i++){const key=storage.key(i);if(!key?.startsWith(COURSE_JOURNAL_PREFIX))continue;
   const row=JSON.parse(storage.getItem(key));
   if(!row||row.uid!==uid||key!==COURSE_JOURNAL_PREFIX+row.id||!['queued','sending','acknowledged','review'].includes(row.phase)||!Object.keys(row.changes||{}).length||!Object.entries(row.changes).every(([p,v])=>isCourse(p)&&typeof v==='boolean'))throw Error('course-sync/corrupt-journal');
   result.push(row);
  }
  return result.sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
 }
 const persist=row=>{if(!alive())throw Error('course-sync/stale-session');storage.setItem(COURSE_JOURNAL_PREFIX+row.id,JSON.stringify(row));};
 function notify(){if(alive())onChange();}
 const serverVersion=(root,path)=>read(root,COURSE_SYNC_PATH+'/versions/'+token(path));
 function baseVersion(path){
  const cached=JSON.parse(storage.getItem(COURSE_REVISION_PREFIX+path)||'null');
  // A delayed root callback may predate our acknowledged update. An immutable receipt
  // proves whether that observation includes the last commit from this origin.
  if(cached&&!read(observed,COURSE_SYNC_PATH+'/receipts/'+cached.version))return cached.version;
  return serverVersion(observed,path);
 }
 function finishDates(row){if(Object.keys(row.dates||{}).length&&!acceptDates(clone(row.dates)))return false;return true;}
 function finalize(row){
  const caches={videos:'med_exam_videos_cloud',biochem:'med_exam_biochem_cloud',physiology:'med_exam_physio_cloud',pharmacology:'med_exam_pharm_cloud'};
  for(const [subject,key] of Object.entries(caches)){const entries=Object.entries(row.changes).filter(([path])=>path.startsWith(subject+'/'));if(!entries.length)continue;const state=JSON.parse(storage.getItem(key)||'{}');for(const [path,value] of entries){const includesCommit=!!read(observed,COURSE_SYNC_PATH+'/receipts/'+row.id);const next=includesCommit?read(observed,path):value;if(next===null)delete state[path.slice(subject.length+1)];else state[path.slice(subject.length+1)]=next;}storage.setItem(key,JSON.stringify(state));}
  for(const path of Object.keys(row.changes)){const version=read(observed,COURSE_SYNC_PATH+'/receipts/'+row.id)?serverVersion(observed,path):row.id;storage.setItem(COURSE_REVISION_PREFIX+path,JSON.stringify({version}));}
  if(!finishDates(row))throw Error('course-sync/date-handoff-unavailable');
  // This key belongs exclusively to this immutable batch. Never compare Boolean values.
  storage.removeItem(COURSE_JOURNAL_PREFIX+row.id);acknowledged.delete(row.id);own.delete(row.id);onProjection();
 }
 const matchesReceipt=(receipt,row)=>receipt?.uid===uid&&receipt.id===row.id&&receipt.fingerprint===JSON.stringify(row.changes);
 async function refreshProjection(){
  const result=await database.ref().transaction(current=>alive()&&ready()?(current||{}):undefined,undefined,false);
  if(!alive()||!result.committed)return false;observed=result.snapshot.val()||{};return true;
 }
 async function recover(row){
  // A committed transaction round trip is proof; once/get/value/Boolean equality are not.
  const result=await database.ref(COURSE_SYNC_PATH+'/receipts/'+row.id).transaction(current=>matchesReceipt(current,row)?current:undefined,undefined,false);
  if(!alive())return false;
  if(result.committed&&matchesReceipt(result.snapshot.val(),row)){if(!await refreshProjection())return false;acknowledged.add(row.id);persist({...row,phase:'acknowledged'});finalize(row);return true;}
  lastError='有一批寫入結果未知，已停止後續傳送；請保留資料並交由維護者核對，勿重置帳號。';return false;
 }
 async function drain(){
  if(!alive())return;
  if(!locks?.request){lastError='此瀏覽器無法安全協調多分頁同步，操作仍保存在本機。';return;}
  await locks.request('becoming-course-sync:'+uid,{mode:'exclusive'},async()=>{
   if(!alive())return;
   for(const row of rows()){
    if(!alive())return;
    if(row.phase==='acknowledged'&&!acknowledged.has(row.id)){if(!localOnly&&(!ready()||!database||!await refreshProjection()))return;acknowledged.add(row.id);}
    if(acknowledged.has(row.id)){finalize(row);lastError='';continue;}
    if(!ready()||!database)return;
    if(row.phase==='review'){lastError='整批課程在其他裝置變更，請選擇保留哪份紀錄。';return;}
    if(row.phase==='sending'){if(await recover(row)){lastError='';continue;}return;}
    // Mark uncertain before any remote call; interrupted reservation must not be replayed.
    persist({...row,phase:'sending'});own.add(row.id);notify();
    let outcome;
    try{
     // This changes only coordination metadata, preserving every other root child.
     // The server reruns the updater on concurrent changes; comparison is value + revision.
     outcome=await database.ref().transaction(current=>{
      if(!alive()||!ready())return;
      const root=clone(current||{}),meta=read(root,COURSE_SYNC_PATH)||{};
      if(meta.gate&&meta.gate.id!==row.id&&meta.gate.phase!=='committed')return root;
      if(Object.entries(row.changes).some(([path])=>!equal({value:read(root,path),version:serverVersion(root,path)},row.bases[path])))return root;
      root.questOS??={};root.questOS.v1??={};root.questOS.v1.courseSyncV2={...meta,gate:{id:row.id,uid,phase:'reserved'}};return root;
     },undefined,false);
    }catch{
     // This owner knows no course update has been invoked. The reservation may be unknown.
     own.delete(row.id);lastError='同步保留程序失敗，已停止傳送；本機操作仍保留。';return;
    }
    if(!alive())return;
    const root=outcome.snapshot.val(),gate=read(root,COURSE_SYNC_PATH+'/gate');
    if(!outcome.committed){own.delete(row.id);persist({...row,phase:'queued'});return;}
    if(gate?.id!==row.id||gate.phase!=='reserved'){
     own.delete(row.id);
     if(gate&&gate.phase!=='committed'){
      // No course SDK call has happened. This request is safe to retry after the blocker settles.
      persist({...row,phase:'queued'});lastError='另一裝置有未確認的寫入，操作已保存在本機，等待核對。';return;
     }
     persist({...row,phase:'review',remote:Object.fromEntries(Object.keys(row.changes).map(path=>[path,{value:read(root,path),version:serverVersion(root,path)}]))});
     lastError='整批課程在其他裝置變更，請選擇保留哪份紀錄。';return;
    }
    // Exactly one atomic multi-location update, retaining chapter/group membership.
    const patch={...row.changes,[COURSE_SYNC_PATH+'/gate']:{id:row.id,uid,phase:'committed'},[COURSE_SYNC_PATH+'/receipts/'+row.id]:{id:row.id,uid,fingerprint:JSON.stringify(row.changes)}};
    for(const path of Object.keys(row.changes))patch[COURSE_SYNC_PATH+'/versions/'+token(path)]=row.id;
    let original;
    try{original=database.ref().update(patch);}catch{own.delete(row.id);lastError='寫入結果未知，資料仍保存在本機；已停止重送。';return;}
    try{await original;}catch{own.delete(row.id);if(alive())lastError='寫入結果未知，資料仍保存在本機；已停止重送。';return;}
    if(!alive())return;
    acknowledged.add(row.id);
    if(!read(observed,COURSE_SYNC_PATH+'/receipts/'+row.id)){observed=clone(root||{});
    for(const [path,value] of Object.entries(patch)){const keys=path.split('/');let node=observed;for(const key of keys.slice(0,-1))node=node[key]??={};node[keys.at(-1)]=clone(value);}}
    // Failure here retries only local settlement. The original success remains in RAM.
    persist({...row,phase:'acknowledged'});finalize(row);lastError='';
   }
  });
 }
 function pump(){
  if(running){requested=true;return running;}
  running=(async()=>{do{requested=false;await drain();}while(requested&&alive());})().catch(()=>{if(alive())lastError='本機同步紀錄無法讀寫或日期尚未保存；操作保留，請重試。';}).finally(()=>{running=null;notify();});return running;
 }
 function enqueue(changes,{baseline={}}={}){
  if(!alive())throw Error('登入狀態已改變，未保存課程操作。');
  if(!Object.keys(changes||{}).length||!Object.entries(changes).every(([p,v])=>isCourse(p)&&typeof v==='boolean'))throw Error('課程操作無效。');
  let existing;
  try{existing=rows();}catch{localError=true;notify();throw Error('本機紀錄無法讀取，未保存操作。');}
  const latest=Object.assign({},baseline,...existing.map(row=>row.changes));
  if(Object.entries(changes).every(([path,value])=>latest[path]===value))return {saved:true,changes:{},noop:true};
  const bases={};
  for(const path of Object.keys(changes)){
   const previous=existing.filter(row=>Object.hasOwn(row.changes,path)).at(-1);
   bases[path]=previous?{value:previous.changes[path],version:previous.id}:{value:baseline[path]??null,version:baseVersion(path)};
  }
  const row={id:newId(),uid,order:Math.max(Date.now(),...existing.map(r=>r.order+1)),phase:localOnly?'acknowledged':'queued',changes:clone(changes),bases,dates:prepareDates(changes)};
  try{persist(row);}catch{localError=true;notify();throw Error('本機保存失敗，進度未變更，請重新操作。');}
  localError=false;lastError='';notify();void pump();return {saved:true,changes:clone(changes),id:row.id};
 }
 async function resolve(path,keepLocal){
  if(!alive()||!ready()||!database||!locks?.request)return;
  await locks.request('becoming-course-sync:'+uid,{mode:'exclusive'},async()=>{
   if(!alive())return;
   const row=rows().find(row=>row.phase==='review'&&Object.hasOwn(row.changes,path));if(!row)return;
   // Explicit choice applies to the entire atomic group. Recheck server state on next claim.
   if(keepLocal)persist({...row,phase:'queued',bases:row.remote});
   else{
    if(!await refreshProjection())return;
    // Dependents were authored on top of this batch. Preserve them for a separate choice.
    for(const next of rows().filter(next=>next.order>row.order&&Object.values(next.bases).some(base=>base.version===row.id)))persist({...next,phase:'review',remote:Object.fromEntries(Object.keys(next.changes).map(path=>[path,{value:read(observed,path),version:serverVersion(observed,path)}]))});
    storage.removeItem(COURSE_JOURNAL_PREFIX+row.id);
   }
   lastError='';
  });notify();void pump();
 }
 const onStorage=event=>{if(event.key?.startsWith(COURSE_JOURNAL_PREFIX)){onProjection();notify();void pump();}};
 events?.addEventListener?.('storage',onStorage);
 const timer=setInterval(()=>{if(alive())void pump();},1000);timer.unref?.();
 return Object.freeze({enqueue,pump,resolve,attach(db){if(database&&listener)database.ref().off('value',listener);database=db;if(db){listener=snap=>{if(alive()){observed=snap.val()||{};notify();}};db.ref().on('value',listener,()=>{if(alive()){lastError='同步版本無法讀取；本機操作仍保留。';notify();}});}void pump();},overlay(path,value){const result={...(value||{})};let pending;try{pending=rows();}catch{return result;}for(const row of pending)for(const [full,v] of Object.entries(row.changes))if(full.startsWith(path+'/'))result[full.slice(path.length+1)]=v;return result;},
  inspect(){let pending;try{pending=rows();}catch{return {pending:[],localError:true,error:'本機同步紀錄損壞，已停止保存與傳送；請保留資料供維護者檢查。',unknown:true};}return {pending,localError,error:lastError,unknown:pending.some(row=>row.phase==='sending'&&!own.has(row.id)&&!acknowledged.has(row.id))};},
  status(path){let all;try{all=rows();}catch{return {pending:true,review:true,failed:true,localError:true};}const pending=all.filter(row=>Object.hasOwn(row.changes,path));return {pending:pending.length>0,review:pending.some(row=>row.phase==='review'||row.phase==='sending'&&!acknowledged.has(row.id)&&!own.has(row.id)),failed:!!lastError,localError};},
  close(){closed=true;clearInterval(timer);if(database&&listener)database.ref().off('value',listener);events?.removeEventListener?.('storage',onStorage);},get busy(){return !!running;}});
}
if(typeof window!=='undefined')window.createCourseSync=createCourseSync;
