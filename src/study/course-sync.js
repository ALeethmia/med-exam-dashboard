import {createCourseCoordination} from './course-coordination.js';
import {COURSE_SYNC_PATH,INITIAL_GENERATION,courseDocumentPath,coursePath,courseToken,emptyCourseDocument,normalizeDocument,copy,decision,applyCourseRequest} from './course-contract.js';
export {COURSE_SYNC_PATH,courseDocumentPath} from './course-contract.js';
export const COURSE_JOURNAL_PREFIX='med_exam_course_write_v3:';
export const COURSE_SNAPSHOT_PREFIX='med_exam_course_snapshot_v3:';
const DATE_KEY='med_exam_course_dates_v1';
const caches={videos:'med_exam_videos_cloud',biochem:'med_exam_biochem_cloud',physiology:'med_exam_physio_cloud',pharmacology:'med_exam_pharm_cloud'};
export function createCourseSync({storage,uid,valid,ready,locks,localOnly=false,newId=()=>crypto.randomUUID(),onChange=()=>{},onProjection=()=>{},events=globalThis.window,prepareDates=()=>({}),acceptDates=()=>true,coordination=null}={}){
 let database=null,observed=null,running=null,requested=false,closed=false,localError=false,lastError='',listener=null,initialLocal=null,retryDelay=1000,nextRetry=0;
 const coordinate=coordination||createCourseCoordination({uid,locks,exists:id=>!!storage.getItem(COURSE_JOURNAL_PREFIX+id)});
 const acknowledged=new Map(),alive=()=>!closed&&valid();
 function keys(prefix){return (storage.keys?storage.keys():Array.from({length:storage.length},(_,i)=>storage.key(i))).filter(key=>key?.startsWith(prefix));}
 function rows(){return keys(COURSE_JOURNAL_PREFIX).map(key=>{
  const row=JSON.parse(storage.getItem(key));
  if(!row||row.uid!==uid||key!==COURSE_JOURNAL_PREFIX+row.id||!['queued','sending','acknowledged','review'].includes(row.phase)||!Object.entries(row.changes||{}).every(([p,v])=>coursePath(p)&&typeof v==='boolean')||!Object.keys(row.changes||{}).length&&!Object.keys(row.manualDates||{}).length)throw Error('course-sync/corrupt-journal');
  return row;
 }).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));}
 function persist(row){if(!alive())throw Error('course-sync/stale-session');storage.setItem(COURSE_JOURNAL_PREFIX+row.id,JSON.stringify(row));}
 function snapshot(){
  const docs=keys(COURSE_SNAPSHOT_PREFIX).map(key=>JSON.parse(storage.getItem(key)));
  if(observed)docs.push(observed);
  const latest=docs.sort((a,b)=>(b.era||0)-(a.era||0)||b.clock-a.clock)[0];if(latest)return latest;
  if(localOnly&&initialLocal)return initialLocal;
  const initial=emptyCourseDocument();
  if(localOnly){for(const [subject,key] of Object.entries(caches))initial.courses[subject]=JSON.parse(storage.getItem(key)||'{}');initial.firstCompletion=JSON.parse(storage.getItem(DATE_KEY+'_local')||'{}').records||{};}
  if(localOnly)initialLocal=initial;return initial;
 }
 function publish(doc){
  if(!alive())return;
  const current=snapshot();
  if(doc.era<current.era||doc.era===current.era&&doc.clock<current.clock)return;
  storage.setItem(COURSE_SNAPSHOT_PREFIX+doc.era+':'+doc.generation+':'+doc.clock,JSON.stringify(doc));observed=doc;
  // Immutable clocks permit safe concurrent pruning: never delete a newer snapshot.
  for(const key of keys(COURSE_SNAPSHOT_PREFIX)){const old=JSON.parse(storage.getItem(key));if(old.era<doc.era||old.era===doc.era&&old.generation===doc.generation&&old.clock<doc.clock-1)storage.removeItem(key);}
 }
 function notify(){if(alive())onChange();}
 function historicalDates(){try{return Object.keys(JSON.parse(storage.getItem(DATE_KEY+(localOnly?'_local':''))||'{}').pending||{}).length;}catch{return 1;}}
 function project(){
  const doc=snapshot();
  for(const [subject,key] of Object.entries(caches))storage.setItem(key,JSON.stringify(doc.courses[subject]||{}));
  const saved=JSON.parse(storage.getItem(DATE_KEY+(localOnly?'_local':''))||'{}');
  storage.setItem(DATE_KEY+(localOnly?'_local':''),JSON.stringify({...saved,records:doc.firstCompletion,pending:saved.pending||{}}));
  onProjection();
 }
 function finalize(row,doc){
  publish(doc);project();
  if(!acceptDates(copy(row.dates||{}),copy(doc.firstCompletion)))throw Error('course-sync/projection-unavailable');
  storage.removeItem(COURSE_JOURNAL_PREFIX+row.id);acknowledged.delete(row.id);onProjection();
 }
 async function attempt(row){
  if(row.phase==='review')return false;
  if(acknowledged.has(row.id)){
   const proof=acknowledged.get(row.id);
   return coordinate.run(row.id,token=>{if(!alive()||decision(proof.doc,row)!=='acknowledged'||!storage.getItem(COURSE_JOURNAL_PREFIX+row.id)){acknowledged.delete(row.id);return {token:token??null,result:true};}finalize(row,proof.doc);lastError='';nextRetry=0;retryDelay=1000;return {token:null,result:true};});
  }
  if(!localOnly&&(!database||!ready()))return false;
  const token={id:newId(),until:Date.now()+3000};
  const claimed=await coordinate.run(row.id,current=>{
   if(!alive()||!storage.getItem(COURSE_JOURNAL_PREFIX+row.id))return {token:current??null,result:false};
   if(current?.until>Date.now())return {token:current,result:'busy'};
   if(localOnly){const doc=applyCourseRequest(snapshot(),row);settle(row,doc,token);return {token:null,result:false};}
   persist({...row,phase:'sending'});return {token,result:true};
  });
  if(claimed==='busy')return false;
  if(!claimed)return true;notify();
  let deadline;
  try{
   // Retry the immutable CAS. Only a committed server snapshot proves the operation revision.
   const original=database.ref(courseDocumentPath(uid)).transaction(current=>alive()&&storage.getItem(COURSE_JOURNAL_PREFIX+row.id)?applyCourseRequest(current,row):undefined,undefined,false);
   // Claim ownership schedules work. A committed server UUID proves the immutable operation
   // even if its original SDK response arrives after a retry acquired another claim.
   const completion=original.then(async response=>{
    if(!alive()||!response.committed)return false;
    const doc=normalizeDocument(response.snapshot.val());
    return coordinate.run(row.id,current=>{
     if(!alive()||!storage.getItem(COURSE_JOURNAL_PREFIX+row.id))return {token:current??null,result:true};
     if(current?.id!==token.id&&decision(doc,row)!=='acknowledged')return {token:current??null,result:true};
     return {token:null,result:settle(row,doc,token)};
    });
   }).then(value=>{notify();return value;});
   return await Promise.race([completion,new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('course-sync/retry-uncertain')),3000);})]);
  }catch{
   await coordinate.run(row.id,current=>({token:current?.id===token.id?null:current??null,result:false}));
   nextRetry=Date.now()+retryDelay;retryDelay=Math.min(30000,retryDelay*2);
   if(alive()&&storage.getItem(COURSE_JOURNAL_PREFIX+row.id))lastError='暫時無法同步，操作已安全保存；連線恢復後會自動重試。';
   return false;
  }finally{clearTimeout(deadline);}
 }
 function settle(row,doc,token){
  const state=decision(doc,row);
  if(state==='acknowledged'){
   acknowledged.set(row.id,{doc,token});persist({...row,phase:'acknowledged'});finalize(row,doc);lastError='';nextRetry=0;retryDelay=1000;return true;
  }
  publish(doc);
  if(state==='retired'){
   // A reset generation is a permanent fence. Preserve the old request as visible history.
   storage.setItem('med_exam_course_retired_v3:'+row.id,JSON.stringify(row));storage.removeItem(COURSE_JOURNAL_PREFIX+row.id);onProjection();lastError='前次帳號狀態的操作已隔離保留，未套用至重置後資料。';return true;
  }
  persist({...row,phase:'review',remote:doc});lastError='課程或日期已在其他裝置變更，請選擇保留哪份整批紀錄。';notify();return false;
 }
 async function drain(){
  const run=async()=>{if(!alive())return;if(!rows().length&&!localError)lastError='';if(rows().length)await coordinate.prune?.();const blocked=new Set();for(const row of rows()){if(!alive())return;const paths=[...Object.keys(row.changes).map(courseToken),...Object.keys(row.manualDates||{})];if(row.phase==='review'){paths.forEach(path=>blocked.add(path));continue;}if(paths.some(path=>blocked.has(path)))continue;if(!await attempt(row)){const review=rows().find(current=>current.id===row.id)?.phase==='review';if(review){paths.forEach(path=>blocked.add(path));continue;}return;}}};
  // Cloud CAS supplies correctness without Web Locks. Locks only avoid redundant requests.
  if(locks?.request)await locks.request('becoming-course-sync:'+uid,{mode:'exclusive'},run);
  else await run();
 }
 function pump(){if(running){requested=true;return running;}
  running=(async()=>{do{requested=false;await drain();}while(requested&&alive());})().catch(()=>{if(alive())lastError='本機同步紀錄暫時無法讀寫；操作仍保留，請重試。';}).finally(()=>{running=null;notify();});return running;
 }
 function enqueue(changes,{baseline={},manualDates={}}={}){
  if(!alive())throw Error('登入狀態已改變，未保存課程操作。');
  if(!Object.entries(changes||{}).every(([p,v])=>coursePath(p)&&typeof v==='boolean')||!Object.keys(changes).length&&!Object.keys(manualDates).length)throw Error('課程操作無效。');
  let existing,doc;try{existing=rows();doc=snapshot();}catch{localError=true;notify();throw Error('本機紀錄無法讀取，未保存操作。');}
  existing=existing.filter(row=>row.generation===doc.generation);
  const latest=Object.assign({},baseline,...Object.entries(doc.courses).map(([subject,state])=>Object.fromEntries(Object.entries(state).map(([id,value])=>[subject+'/'+id,value]))),...existing.map(row=>row.changes));
  if(!Object.keys(manualDates).length&&Object.entries(changes).every(([path,value])=>latest[path]===value))return {saved:true,changes:{},noop:true};
  const bases={},dateBases={};
  for(const path of Object.keys(changes)){const previous=existing.filter(row=>Object.hasOwn(row.changes,path)).at(-1);bases[path]=previous?{value:previous.changes[path],version:previous.id}:{value:latest[path]??null,version:doc.versions[courseToken(path)]??null};}
  for(const key of Object.keys(manualDates)){const previous=existing.filter(row=>Object.hasOwn(row.manualDates||{},key)).at(-1);dateBases[key]=previous?.id??doc.firstCompletion[key]?._version??null;}
  const row={id:newId(),uid,generation:doc.generation,order:Math.max(Date.now(),...existing.map(row=>row.order+1)),phase:'queued',changes:copy(changes),bases,manualDates:copy(manualDates),dateBases,dates:prepareDates(changes)};
  try{persist(row);}catch{localError=true;notify();throw Error('本機保存失敗，進度未變更，請重新操作。');}
  localError=false;lastError='';notify();void pump();return {saved:true,changes:copy(changes),id:row.id};
 }
 async function resolve(path,keepLocal){
  if(!alive())return;
  const found=rows().find(row=>row.phase==='review'&&(Object.hasOwn(row.changes,path)||Object.hasOwn(row.manualDates||{},path)));if(!found)return;
  await coordinate.run(found.id,current=>{
  const row=rows().find(row=>row.id===found.id&&row.phase==='review');if(!alive()||!row)return {token:current??null,result:false};
  // A committed conflict snapshot proves the old immutable bases can never apply again.
  if(keepLocal){
   const bases=Object.fromEntries(Object.keys(row.changes).map(path=>{const [subject,id]=path.split('/');return [path,{value:row.remote.courses[subject]?.[id]??null,version:row.remote.versions[courseToken(path)]??null}];}));
   const next={...row,id:newId(),phase:'queued',bases,dateBases:Object.fromEntries(Object.keys(row.manualDates||{}).map(key=>[key,row.remote.firstCompletion[key]?._version??null]))};persist(next);
   for(const dependent of rows().filter(candidate=>candidate.id!==row.id&&candidate.id!==next.id)){let changed=false;for(const base of Object.values(dependent.bases))if(base.version===row.id){base.version=next.id;changed=true;}for(const key of Object.keys(dependent.dateBases||{}))if(dependent.dateBases[key]===row.id){dependent.dateBases[key]=next.id;changed=true;}if(changed)persist(dependent);}
   storage.removeItem(COURSE_JOURNAL_PREFIX+row.id);
  }else{publish(row.remote);storage.removeItem(COURSE_JOURNAL_PREFIX+row.id);project();}
  return {token:null,result:true};});
  notify();void pump();
 }
 const onStorage=event=>{if(event.key?.startsWith(COURSE_JOURNAL_PREFIX)||event.key?.startsWith(COURSE_SNAPSHOT_PREFIX)){if(alive()){onProjection();notify();void pump();}}};
 events?.addEventListener?.('storage',onStorage);const timer=setInterval(()=>{if(alive()&&Date.now()>=nextRetry){try{if(rows().length||acknowledged.size)void pump();}catch{void pump();}}},1000);timer.unref?.();
 const api={enqueue,pump,resolve,attach(db){if(database&&listener)database.ref(courseDocumentPath(uid)).off('value',listener);database=db;if(db){listener=snap=>{if(!alive())return;try{const next=normalizeDocument(snap.val());const old=snapshot();if(!observed||next.generation!==observed.generation||next.clock>=old.clock)publish(next);onProjection();notify();}catch{lastError='課程資料格式不相容，已停止自動保存。';notify();}};db.ref(courseDocumentPath(uid)).on('value',listener,()=>{if(alive()){lastError='課程同步暫時無法讀取；操作已保存，可重試。';notify();}});}void pump();},
  overlay(path,value){try{const doc=snapshot(),result={...(Object.hasOwn(caches,path)?doc.courses[path]||{}:value||{})};for(const row of rows().filter(row=>row.generation===doc.generation))for(const [full,v] of Object.entries(row.changes))if(full.startsWith(path+'/'))result[full.slice(path.length+1)]=v;return result;}catch{return {...value};}},
  inspect(){try{return {pending:rows(),localError,error:lastError,unknown:false,retired:keys('med_exam_course_retired_v3:').length,quarantined:keys('med_exam_course_write_v2:').length+keys('med_exam_course_retired_v3:').length+historicalDates()};}catch{return {pending:[],localError:true,error:'本機同步紀錄損壞，請保留資料並重試。',unknown:true};}},
  status(path){try{const pending=rows().filter(row=>Object.hasOwn(row.changes,path)||Object.hasOwn(row.manualDates||{},path));return {pending:!!pending.length,review:pending.some(row=>row.phase==='review'),failed:!!lastError,localError};}catch{return {pending:true,review:true,failed:true,localError:true};}},
  setDate(key,day,{firstOnly=false}={}){if(firstOnly&&Object.hasOwn(api.dateRecords(),key))return;return enqueue({},{manualDates:{[key]:day}});},
  dateRecords(){const doc=snapshot(),result=copy(doc.firstCompletion);for(const row of rows().filter(row=>row.generation===doc.generation)){for(const [key,day] of Object.entries(row.dates||{}))result[key]??={day,_version:row.id};for(const [key,day] of Object.entries(row.manualDates||{}))result[key]={day,_version:row.id};}return result;},
  dateStatus:key=>({...api.status(key),conflict:api.status(key).review,error:lastError}),resolveDate:(key,keep)=>resolve(key,keep),
  close(){closed=true;clearInterval(timer);coordinate.close?.();if(database&&listener)database.ref(courseDocumentPath(uid)).off('value',listener);events?.removeEventListener?.('storage',onStorage);},get busy(){return !!running;}};
 return Object.freeze(api);
}
if(typeof window!=='undefined')window.createCourseSync=createCourseSync;
