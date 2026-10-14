// An unbound facade cannot read legacy or another identity's data.
// Legacy keys remain untouched. UID is supplied only by the verified auth callback.
export function createAccountStorage(backing,{prefix='becoming_uid_v1:'}={}){
 let uid=null,epoch=0;const listeners=new Set();
 const requireUID=()=>{if(!uid)throw new Error('storage/unbound');return encodeURIComponent(uid);};
 const full=k=>prefix+requireUID()+':'+String(k);
 const api={getItem:k=>uid?backing.getItem(full(k)):null,setItem:(k,v)=>backing.setItem(full(k),String(v)),removeItem:k=>{if(uid)backing.removeItem(full(k));},
 bind(next){if(typeof next!=='string'||!next.trim())throw Error('storage/invalid-uid');uid=next;epoch++;for(const fn of listeners)fn();return epoch;},unbind(){uid=null;epoch++;for(const fn of listeners)fn();},
 capture(){const owner=uid,version=epoch;return {valid:()=>uid===owner&&epoch===version&&owner!==null};},
 view(){const captured=api.capture(),owner=uid,root=prefix+encodeURIComponent(owner)+':';return Object.freeze({getItem:k=>captured.valid()?backing.getItem(root+String(k)):null,setItem:(k,v)=>{if(captured.valid())backing.setItem(root+String(k),String(v));},removeItem:k=>{if(captured.valid())backing.removeItem(root+String(k));},key:i=>captured.valid()?Array.from({length:backing.length},(_,n)=>backing.key(n)).filter(k=>k?.startsWith(root))[i]?.slice(root.length)??null:null,get length(){return captured.valid()?Array.from({length:backing.length},(_,n)=>backing.key(n)).filter(k=>k?.startsWith(root)).length:0;}});},
 read:()=>({uid,epoch,bound:uid!==null}),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
 acceptsStorageEvent(key){if(!uid||typeof key!=='string')return null;const root=prefix+encodeURIComponent(uid)+':';return key.startsWith(root)?key.slice(root.length):null;},
 legacyKeys(){const result=[];for(let i=0;i<backing.length;i++){const key=backing.key(i);if(key&&!key.startsWith(prefix)&&/^med_exam_(pending|daily_planner|gamification|videos|biochem|physio|pharm|habits|course_dates|life|study|adaptive|time_tasks|custom_events|checklist|pomodoro)/.test(key)&&key!=='med_exam_theme')result.push(key);}return result;},
 key(i){if(!uid)return null;const root=prefix+encodeURIComponent(uid)+':';return Array.from({length:backing.length},(_,n)=>backing.key(n)).filter(k=>k?.startsWith(root))[i]?.slice(root.length)??null;},get length(){if(!uid)return 0;let n=0;while(api.key(n)!==null)n++;return n;}};
 return Object.freeze(api);
}
export function routeAccountStorageEvents(target,storage){
 const forwarded=new WeakSet();
 target.addEventListener('storage',event=>{
  if(forwarded.has(event)||event.key==='med_exam_theme')return;
  const key=storage.acceptsStorageEvent(event.key);event.stopImmediatePropagation();
  if(key!==null){const next=new target.StorageEvent('storage',{key,newValue:event.newValue,oldValue:event.oldValue});forwarded.add(next);target.dispatchEvent(next);}
 },true);
}
