import {DB_PREFIX,fault,storageFault,uidKey,courseKey,targetValue,expectedKey,matches,transitionAllowed,flightKey,matchesFlight} from './contract.mjs';
const stores=['intents','revisions','flights'];
// Explicit prototype name is mandatory. Never opens/migrates a production or legacy database.
export async function openPrototypeQueue({name,indexedDB=globalThis.indexedDB,makeId=()=>globalThis.crypto.randomUUID(),now=()=>Date.now(),openTimeoutMs=3000}={}){
 if(typeof name!=='string'||!name.startsWith(DB_PREFIX)||name.length<=DB_PREFIX.length)throw fault('queue/prototype-name-required');
 if(!indexedDB||!Number.isFinite(openTimeoutMs)||openTimeoutMs<=0)throw fault('queue/unavailable');
 const database=await new Promise((resolve,reject)=>{
  let settled=false,request;
  const finish=(error,db)=>{if(settled){db?.close();return;}settled=true;clearTimeout(timer);error?reject(storageFault(error)):resolve(db);};
  const timer=setTimeout(()=>finish(fault('queue/open-timeout')),openTimeoutMs);
  try{request=indexedDB.open(name,1);}catch(error){finish(error);return;}
  request.onupgradeneeded=()=>{
   const db=request.result;
   for(const store of stores){const s=db.createObjectStore(store,{keyPath:store==='flights'?['uid','path','intentId','generation']:['uid','path']});s.createIndex('uid','uid');if(store==='flights')s.createIndex('course',['uid','path']);}
  };
  request.onblocked=()=>finish(fault('queue/open-blocked'));
  request.onerror=()=>finish(request.error);
  request.onsuccess=()=>{
   const db=request.result;if(settled){db.close();return;}
   try{if(!stores.every(store=>db.objectStoreNames.contains(store)))throw fault('queue/schema-mismatch');finish(null,db);}catch(error){db.close();finish(error);}
  };
 });
 let closed=false,current=null,epoch=0;const active=new Set();
 const freshId=()=>{const id=makeId();if(typeof id!=='string'||!id||id.length>128)throw fault('queue/invalid-id');return id;};
 const valid=session=>!closed&&current===session&&session.epoch===epoch;
 function invalidate(){epoch++;current=null;for(const tx of [...active])try{tx.abort();}catch{}}
 database.onversionchange=()=>{closed=true;invalidate();database.close();};
 database.onclose=()=>{closed=true;invalidate();};
 function run(session,mode,work){
  return new Promise((resolve,reject)=>{
   if(!valid(session)){reject(fault('queue/stale-session'));return;}
   let tx,problem,result;
   const fail=error=>{problem=storageFault(error);try{tx.abort();}catch{reject(problem);}};
   try{tx=mode==='readwrite'?database.transaction(stores,mode,{durability:'strict'}):database.transaction(stores,mode);}catch(error){reject(storageFault(error));return;}
   active.add(tx);
   tx.oncomplete=()=>{active.delete(tx);valid(session)?resolve(result):reject(fault('queue/stale-session'));};
   tx.onabort=()=>{active.delete(tx);reject(!valid(session)?fault('queue/stale-session'):problem||storageFault(tx.error||{name:'AbortError'}));};
   tx.onerror=()=>{if(!problem&&tx.error)problem=storageFault(tx.error);};
   const request=(req,callback)=>{req.onerror=()=>{problem=storageFault(req.error);};req.onsuccess=()=>{if(!valid(session)){fail(fault('queue/stale-session'));return;}try{callback(req.result);}catch(error){fail(error);}};};
   try{work({store:n=>tx.objectStore(n),request,done:value=>{result=value;},fail});}catch(error){fail(error);}
  });
 }
 function bind(uid){
  uidKey(uid);invalidate();const session={uid,epoch,id:freshId()};current=session;
  const getAll=store=>run(session,'readonly',({store:s,request,done})=>request(s(store).index('uid').getAll(uid),done));
  return Object.freeze({uid,sessionId:session.id,
   list:()=>getAll('intents'),unsettled:()=>getAll('flights'),
   put(path,value,{epoch=null}={}){
    if(epoch!==null&&(!Number.isSafeInteger(epoch)||epoch<0))throw fault('queue/invalid-epoch');
    courseKey(path);const target=targetValue(value),intentId=freshId();
    return run(session,'readwrite',({store,request,done})=>{
     const key=[uid,path];request(store('revisions').get(key),previous=>{
      const generation=(previous?.generation||0)+1;if(!Number.isSafeInteger(generation))throw fault('queue/generation-exhausted');
      const row={uid,path,intentId,generation,target,state:'queued',ownerSession:session.id,epoch,createdAt:now()};
      store('revisions').put({uid,path,generation});store('intents').put(row);done(row);
     });
    });
   },
   transition(expected,to){
    const key=expectedKey(expected,uid);if(!transitionAllowed(expected.state,to))throw fault('queue/invalid-transition');
    return run(session,'readwrite',({store,request,done})=>request(store('intents').get(key),row=>{
     if(!matches(row,expected)){done(false);return;}
     const apply=()=>{const next={...row,state:to,updatedAt:now()};
      if(to==='in-flight'){
       const flightToken={kind:'flight-token',uid,path:row.path,intentId:row.intentId,generation:row.generation,flightId:freshId(),ownerSession:session.id};
       next.flightToken=flightToken;store('flights').put({...flightToken,kind:'flight',phase:'unsettled',target:row.target,createdAt:now()});
      }
      store('intents').put(next);done(next);
     };
     if(to==='in-flight')request(store('flights').index('course').count(key),count=>count?done(false):apply());else apply();
    }));
   },
   removeIfCurrent(expected){
    const key=expectedKey(expected,uid);
    return run(session,'readwrite',({store,request,done})=>request(store('intents').get(key),row=>{
     if(!matches(row,expected)){done(false);return;}
     request(store('flights').index('course').count(key),count=>{if(count){done(false);return;}store('intents').delete(key);done(true);});
    }));
   },
   // Caller-supplied evidence is NOT validated against a server in this prototype.
   // Only the original session can settle its own flight; recovery does not guess.
   settleOwnFlight(token,evidence){
    const key=flightKey(token,uid);if(!['acknowledged','proved-not-sent'].includes(evidence))throw fault('queue/invalid-evidence');
    return run(session,'readwrite',({store,request,done})=>{
     request(store('flights').get(key),flight=>{
      if(!matchesFlight(flight,token)||token.ownerSession!==session.id){done(false);return;}store('flights').delete(key);done(true);
     });
    });
   },
   valid:()=>valid(session)
  });
 }
 return Object.freeze({bind,unbind:invalidate,close(){closed=true;invalidate();database.close();}});
}
