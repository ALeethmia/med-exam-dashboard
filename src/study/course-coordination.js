// Short local critical sections only: never hold an IndexedDB transaction across network IO.
// Durable claim identity makes a late callback harmless after another tab settles the request.
export function createCourseCoordination({uid,indexedDB=globalThis.indexedDB,locks,exists=()=>true}={}){
 let opening,db,closed=false;const memory=new Map();
 function open(){if(!opening)opening=new Promise((resolve,reject)=>{
  if(!indexedDB){reject(Error('course-sync/storage-coordination-unavailable'));return;}
  const req=indexedDB.open('becoming-course-coordination-v3',1);
  req.onupgradeneeded=()=>req.result.createObjectStore('claims');
  req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('course-sync/coordination-blocked'));
  req.onsuccess=()=>{db=req.result;if(closed){db.close();reject(Error('course-sync/stale-session'));return;}db.onversionchange=()=>db.close();resolve(db);};
 });return opening;}
 return {async run(id,work){
  const key=encodeURIComponent(uid)+':'+id;
  // A separate short Web Lock supplies local exclusion when IndexedDB is unavailable.
  if(!indexedDB&&locks?.request)return locks.request('becoming-course-local:'+uid,{mode:'exclusive'},()=>{const outcome=work(memory.get(key));if(outcome.token===null)memory.delete(key);else memory.set(key,outcome.token);return outcome.result;});
  const database=await open();return new Promise((resolve,reject)=>{
   const tx=database.transaction('claims','readwrite'),store=tx.objectStore('claims');let result,error;
   tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(error||tx.error||Error('course-sync/coordination-aborted'));tx.onerror=()=>{};
   const req=store.get(key);req.onsuccess=()=>{try{const outcome=work(req.result);result=outcome.result;if(outcome.token===null)store.delete(key);else store.put(outcome.token,key);}catch(e){error=e;tx.abort();}};
  });
 },async prune(){if(!indexedDB)return;const database=await open();return new Promise((resolve,reject)=>{const tx=database.transaction('claims','readwrite'),store=tx.objectStore('claims'),prefix=encodeURIComponent(uid)+':';tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);const req=store.getAllKeys();req.onsuccess=()=>{for(const key of req.result)if(key.startsWith(prefix)&&!exists(key.slice(prefix.length)))store.delete(key);};});},close(){closed=true;db?.close();}};
}
