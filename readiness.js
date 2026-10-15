// Observe completion of existing Store subscriptions, never infer readiness from values.
export const REQUIRED_PATHS=Object.freeze(['videos','biochem','physiology','pharmacology','gamification/v1/awards','gamification/v2/timeTasks','gamification/v3/planner/tasks','habits','questOS/v1/courseFirstCompletion','questOS/v1/adaptiveStudy/settings']);
export function createReadiness({paths=REQUIRED_PATHS,timeoutMs=15000}={}){
 let epoch=0,status='signedOut',identity=null,error=null,timer=null,disposed=false;const ready=new Set(),listeners=new Set(),cleanups=new Set();
 const read=()=>Object.freeze({epoch,status,identity:identity?{displayName:identity.displayName??null}:null,error,ready:Object.freeze([...ready])});
 const emit=()=>{for(const fn of [...listeners])fn(read());};
 const clear=()=>{clearTimeout(timer);for(const fn of [...cleanups])fn();cleanups.clear();ready.clear();};
 const api={read,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},track(fn){cleanups.add(fn);return()=>cleanups.delete(fn);},
 start(user){clear();epoch++;disposed=false;identity=user?{displayName:user.displayName??null}:null;error=null;status=user?'loading':'signedOut';emit();if(user&&timeoutMs>0){const e=epoch;timer=setTimeout(()=>api.fail('read/timeout',e),timeoutMs);timer.unref?.();}return epoch;},
 valid:e=>!disposed&&e===epoch&&status!=='signedOut',
 success(path,e=epoch){if(!api.valid(e)||!paths.includes(path)||status==='error')return;ready.add(path);if(paths.every(p=>ready.has(p))){status='ready';clearTimeout(timer);}emit();},
 fail(code='read/failed',e=epoch){if(!api.valid(e))return;status='error';error=/^[a-zA-Z0-9_/-]{1,80}$/.test(code)?code:'read/failed';ready.clear();clearTimeout(timer);emit();},
 reload(){if(status==='signedOut')return;ready.clear();error=null;status='loading';clearTimeout(timer);if(timeoutMs>0){const e=epoch;timer=setTimeout(()=>api.fail('read/timeout',e),timeoutMs);timer.unref?.();}emit();},
 dispose(){clear();epoch++;status='signedOut';identity=null;error=null;disposed=true;emit();listeners.clear();}
 };return Object.freeze(api);
}
// Firebase compat facade: same subscriptions feed existing Stores and readiness.
// No additional XP source, schema or database read subscription is created per Store path.
export function observeDatabase(database,lifecycle){
 const epoch=lifecycle.read().epoch,entries=new Set();let disposed=false,connected=false,lost=false,connectionCallback;
 const valid=()=>!disposed&&lifecycle.valid(epoch);
 function detach(entry){entry.revision++;if(entry.wrapped)entry.ref.off(entry.event,entry.wrapped);entry.wrapped=null;}
 function attach(entry){if(!valid())return;const revision=++entry.revision;entry.wrapped=snap=>{if(!valid()||revision!==entry.revision)return;try{entry.callback(snap);lifecycle.success(entry.path,epoch);}catch{lifecycle.fail('read/apply-failed',epoch);}};entry.ref.on(entry.event,entry.wrapped,e=>{if(!valid()||revision!==entry.revision)return;lifecycle.fail(e?.code||'read/failed',epoch);entry.cancel?.(e);});}
 function retry(){if(!valid())return;lifecycle.reload();for(const e of entries){detach(e);attach(e);}}
 function dispose(){if(disposed)return;disposed=true;for(const e of entries)detach(e);entries.clear();database.ref('.info/connected').off('value',connectionCallback);untrack();}
 const untrack=lifecycle.track(dispose);
 connectionCallback=snap=>{if(!valid())return;const next=snap.val()===true,wasConnected=connected;connected=next;if(!next&&wasConnected){lost=true;lifecycle.fail('read/disconnected',epoch);}if(next&&lost){lost=false;retry();}};
 if(valid())database.ref('.info/connected').on('value',connectionCallback,e=>lifecycle.fail(e?.code||'read/connection',epoch));
 function ref(path=''){
 const original=database.ref(path);const writable=()=>valid()&&connected&&lifecycle.read().status==='ready';
 const guarded=method=>(...args)=>{
  const writing=method!=='once';
  if(!valid())return Promise.reject({code:'read/stale-session'});
  if(writing&&!writable())return Promise.reject({code:'write/not-ready'});
  if(method==='transaction'){
   const updater=args[0],completion=args[1];
   args[0]=current=>writable()?updater(current):undefined;
   if(completion)args[1]=(...values)=>{if(valid())completion(...values);};
  }
  return Promise.resolve(original[method](...args)).then(value=>{if(!valid())throw {code:'read/stale-session'};return value;});
 };
 return {on(event,callback,cancel){if(!valid())return callback;const e={path,event,callback,cancel,ref:original,revision:0};entries.add(e);attach(e);return callback;},off(event,callback){for(const e of entries)if(e.path===path&&(!event||e.event===event)&&(!callback||e.callback===callback)){detach(e);entries.delete(e);}},once:guarded('once'),transaction:guarded('transaction'),update:guarded('update'),set:guarded('set')};
 }
 return Object.freeze({ref,retry,dispose,goOffline(){dispose();database.goOffline?.();},listenerCount:()=>entries.size});
}
