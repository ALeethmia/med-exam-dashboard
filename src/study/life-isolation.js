// Seven existing Store APIs, one immutable UID/generation binding. No data migration.
export const LIFE_PATHS=Object.freeze({habits:'habits','questOS/v1/training':'training','questOS/v1/adaptiveStudy/settings':'adaptiveStudy/settings','gamification/v2/timeTasks':'timeTasks','gamification/v3/planner/tasks':'planner/tasks',custom_events:'custom_events',checklist:'checklist'});
export const lifeControlPath=uid=>'users/'+encodeURIComponent(uid)+'/lifeControl';
export const lifeGenerationPath=(uid,generation)=>'users/'+encodeURIComponent(uid)+'/lifeV1/'+generation;
export const isLifeKey=key=>/^(med_exam_(daily_planner_v3|life_v1|adaptive_study_v1|time_tasks_v1|custom_events|checklist_cloud|pending_writes_v1|gamification_v1)(?:_local)?|med_exam_habits_.+)$/.test(key);
export function validateLifeControl(value){
 if(!value||value.schema!==1||!Number.isSafeInteger(value.era)||value.era<0||typeof value.generation!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(value.generation))throw Error('life/control-unavailable');
 return {schema:1,generation:value.generation,era:value.era};
}
export function createLifeStorage(storage,generation,{valid=()=>true,onFailure=()=>{}}={}){
 const prefix='life_v1:'+generation+':';
 const mapped=key=>isLifeKey(key)?prefix+key:key;
 const eventKey=key=>{
  if(typeof key!=='string')return null;
  if(key.startsWith(prefix))return isLifeKey(key.slice(prefix.length))?key.slice(prefix.length):null;
  return key.startsWith('life_v1:')||isLifeKey(key)?null:key;
 };
 const keys=()=>storage.keys().map(eventKey).filter(key=>key!==null);
 const mutate=(method,key,value)=>{
  if(isLifeKey(key)&&!valid())throw Error('life/session-stopped');
  try{return storage[method](mapped(key),value);}catch(error){if(isLifeKey(key))onFailure();throw error;}
 };
 return Object.freeze({getItem:key=>storage.getItem(mapped(key)),setItem:(key,value)=>mutate('setItem',key,value),removeItem:key=>mutate('removeItem',key),keys,eventKey,key:i=>keys()[i]??null,get length(){return keys().length;}});
}
export function createLifeDatabase(database,uid,generation,valid=()=>true){
 const root=lifeGenerationPath(uid,generation),entries=new Set();
 function map(path){for(const [legacy,bucket] of Object.entries(LIFE_PATHS))if(path===legacy||path.startsWith(legacy+'/'))return root+'/'+bucket+path.slice(legacy.length);return null;}
 const failure=()=>Object.assign(Error('Life binding is no longer writable'),{code:'life/session-stopped'});
 return Object.freeze({canWrite:()=>valid()&&(!database.canWrite||database.canWrite()),goOffline:()=>database.goOffline?.(),ref(path=''){
  if(/^users(\/|$)/.test(path))throw Error('life/direct-path-disabled');
  const mapped=map(path),ref=database.ref(mapped||path);
  const write=(method,args)=>{
   if(!valid())return Promise.reject(failure());
   if(method==='update'){
    const patch={};for(const [key,value] of Object.entries(args[0])){const full=[path,key].filter(Boolean).join('/'),target=map(full);if(!target)return Promise.reject({code:'life/unsupported-write'});patch[target]=value;}
    return Promise.resolve(database.ref().update(patch)).then(value=>{if(!valid())throw failure();return value;});
   }
   if(!mapped)return Promise.reject({code:'life/unsupported-write'});
   if(method==='transaction'){const updater=args[0],complete=args[1];args[0]=value=>valid()?updater(value):undefined;if(complete)args[1]=(...values)=>{if(valid())complete(...values);};}
   return Promise.resolve(ref[method](...args)).then(value=>{if(!valid())throw failure();return value;});
  };
  return {on(event,callback,cancel){if(!valid())return callback;const wrapped=value=>{if(valid())callback(value);};entries.add({path,event,callback,wrapped,ref});ref.on(event,wrapped,error=>{if(valid())cancel?.(error);});return callback;},
   off(event,callback){for(const item of entries)if(item.path===path&&(!event||item.event===event)&&(!callback||item.callback===callback)){item.ref.off(item.event,item.wrapped);entries.delete(item);}},
   once:(...args)=>valid()?Promise.resolve(ref.once(...args)).then(value=>{if(!valid())throw failure();return value;}):Promise.reject(failure()),
   set:(...args)=>write('set',args),update:(...args)=>write('update',args),transaction:(...args)=>write('transaction',args)};
 }});
}
export function openLifeSession({database,uid,storage,valid=()=>true,onRetire=()=>{},onStorageFailure=()=>{}}){
 return new Promise((resolve,reject)=>{
  const ref=database.ref(lifeControlPath(uid));let control,closed=false,storageOK=true,settled=false;
  const current=()=>!closed&&valid(),writable=()=>current()&&storageOK;
  const close=()=>{closed=true;ref.off('value',receive);};
  const retire=error=>{if(closed)return;close();if(!settled)reject(error);else onRetire(error);};
  function receive(snapshot){
   if(!current()){retire(Error('life/stale-session'));return;}
   let next;try{next=validateLifeControl(snapshot.val());}catch(error){retire(error);return;}
   if(control){if(next.generation!==control.generation||next.era!==control.era)retire(Error('life/generation-changed'));return;}
   control=next;settled=true;
   const view=createLifeStorage(storage,control.generation,{valid:writable,onFailure(){storageOK=false;onStorageFailure();}});
   resolve(Object.freeze({uid,...control,storage:view,valid:writable,close,database:base=>createLifeDatabase(base,uid,control.generation,writable)}));
  }
  ref.on('value',receive,error=>retire(error));
 });
}
