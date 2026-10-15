// Isolated B2-B.2a storage extension. Never opens the B2-A database or production storage.
import {fault,storageFault,uidKey,courseKey,targetValue} from './contract.mjs';
export const PERSISTENCE_PREFIX='becoming-b2b2a-prototype:';
const stores=['intents','revisions','batches','handoffs'];
const boundedError=e=>typeof e?.code==='string'&&e.code.startsWith('persistence/')?e:storageFault(e);
const identity=v=>{if(typeof v!=='string'||!v||v.length>128)throw fault('persistence/invalid-id');return v;};
export function normalizeRequest({requestId,source,changes}={}){
 identity(requestId);if(source!=='new-course-action'||!Array.isArray(changes)||!changes.length||changes.length>500)throw fault('persistence/invalid-request');
 const seen=new Set();const entries=changes.map(({path,value,dateHandoff}={})=>{
  courseKey(path);if(seen.has(path))throw fault('persistence/duplicate-path');seen.add(path);const target=targetValue(value);let date=null;
  if(dateHandoff!==undefined){const {day,eligible}=dateHandoff||{};
   if(typeof eligible!=='boolean'||typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day)||Number.isNaN(Date.parse(day+'T00:00:00Z'))||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)throw fault('persistence/invalid-date');
   if(eligible){if(value!==true)throw fault('persistence/invalid-date');date={day,firstOnly:true};}
  }
  return {path,target,date};
 }).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 return {requestId,entries,fingerprint:JSON.stringify(entries)};
}
export async function openPersistenceStore({name,uid,epoch,context,indexedDB=globalThis.indexedDB,makeId=()=>crypto.randomUUID(),timeoutMs=3000}={}){
 uidKey(uid);if(typeof name!=='string'||!name.startsWith(PERSISTENCE_PREFIX)||name.length<=PERSISTENCE_PREFIX.length||!Number.isSafeInteger(epoch)||epoch<0||typeof context!=='function'||!indexedDB||!Number.isFinite(timeoutMs)||timeoutMs<=0)throw fault('persistence/invalid-options');
 const sessionId=identity(makeId());let closed=false;const transactions=new Set();
 const valid=()=>{const s=context();return !closed&&s?.uid===uid&&s.epoch===epoch&&s.status!=='signedOut';};
 if(!valid())throw fault('persistence/stale-session');
 const db=await new Promise((resolve,reject)=>{
  let done=false,req;const finish=(error,value)=>{if(done){value?.close();return;}done=true;clearTimeout(timer);if(error){value?.close();reject(boundedError(error));}else resolve(value);};
  const timer=setTimeout(()=>finish(fault('persistence/open-timeout')),timeoutMs);
  try{req=indexedDB.open(name,1);}catch(e){finish(e);return;}
  req.onupgradeneeded=()=>{for(const name of stores){const s=req.result.createObjectStore(name,{keyPath:name==='batches'?['uid','requestId']:name==='handoffs'?['uid','handoffId']:['uid','path']});s.createIndex('uid','uid');}};
  req.onblocked=()=>finish(fault('persistence/open-blocked'));req.onerror=()=>finish(req.error);
  req.onsuccess=()=>{if(!valid())return finish(fault('persistence/stale-session'),req.result);if(!stores.every(s=>req.result.objectStoreNames.contains(s))){req.result.close();return finish(fault('persistence/schema-mismatch'));}finish(null,req.result);};
 });
 function close(){if(closed)return;closed=true;for(const tx of transactions)try{tx.abort();}catch{}db.close();}
 db.onversionchange=close;db.onclose=close;
 function run(mode,work){return new Promise((resolve,reject)=>{
  if(!valid()){close();reject(fault('persistence/stale-session'));return;}
  let tx,result,error;try{tx=mode==='readwrite'?db.transaction(stores,mode,{durability:'strict'}):db.transaction(stores,mode);}catch(e){reject(boundedError(e));return;}
  transactions.add(tx);const fail=e=>{error=boundedError(e);try{tx.abort();}catch{reject(error);}};
  tx.oncomplete=()=>{transactions.delete(tx);valid()?resolve(result):reject(fault('persistence/stale-session'));};
  tx.onabort=()=>{transactions.delete(tx);reject(!valid()?fault('persistence/stale-session'):error||boundedError(tx.error||{name:'AbortError'}));};
  tx.onerror=()=>{error||=boundedError(tx.error);};
  const request=(r,fn)=>{r.onerror=()=>{error=storageFault(r.error);};r.onsuccess=()=>{if(!valid())return fail(fault('persistence/stale-session'));try{fn(r.result);}catch(e){fail(e);}};};
  try{work({store:n=>tx.objectStore(n),request,done:r=>result=r,fail});}catch(e){fail(e);}
 });}
 const receipt=batch=>({kind:'local-commit',saved:true,sync:'held-group-contract',uid,batchId:batch.batchId,requestId:batch.requestId,members:batch.members});
 return Object.freeze({uid,epoch,sessionId,valid,close,
  save(input){const normalized=normalizeRequest(input);return run('readwrite',({store,request,done})=>request(store('batches').get([uid,normalized.requestId]),prior=>{
   if(prior){if(prior.fingerprint!==normalized.fingerprint)throw fault('persistence/request-id-reused');done(receipt(prior));return;}
   const batchId=identity(makeId()),members=[];let i=0;
   const next=()=>{if(i===normalized.entries.length){const batch={uid,requestId:normalized.requestId,batchId,fingerprint:normalized.fingerprint,members,state:'held-group-contract',authorSession:sessionId,epoch};store('batches').add(batch);done(receipt(batch));return;}
    const item=normalized.entries[i++];request(store('revisions').get([uid,item.path]),prior=>{
     const generation=(prior?.generation||0)+1;if(!Number.isSafeInteger(generation))throw fault('persistence/generation-exhausted');
     const row={uid,path:item.path,intentId:identity(makeId()),generation,batchId,epoch,authorSession:sessionId,target:item.target,state:'held-group-contract'};
     store('revisions').put({uid,path:item.path,generation});store('intents').put(row);members.push(row);
     if(item.date)store('handoffs').add({uid,handoffId:batchId+':'+item.path,batchId,intentId:row.intentId,generation,path:item.path,date:item.date,state:'pending'});
     next();
    });
   };next();
  }));},
  inspect(){return run('readonly',({store,request,done})=>{const result={};let n=0;for(const s of stores)request(store(s).index('uid').getAll(uid),rows=>{result[s]=rows;if(++n===stores.length)done(result);});});},
  acknowledgeDate(expected,proof){
   if(expected?.uid!==uid||typeof expected.handoffId!=='string'||proof?.kind!=='mock-date-accepted'||proof.uid!==uid||proof.handoffId!==expected.handoffId)throw fault('persistence/invalid-date-receipt');
   return run('readwrite',({store,request,done})=>request(store('handoffs').get([uid,expected.handoffId]),row=>{
    if(!row||row.intentId!==expected.intentId||row.generation!==expected.generation||row.state!=='pending'){done(false);return;}
    store('handoffs').put({...row,state:'accepted-by-mock'});done(true);
   }));
  }
 });
}
