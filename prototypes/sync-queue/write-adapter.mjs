// Isolated B2-B.1 only. The caller supplies an SDK-shaped writer and synthetic lifecycle.
// No product imports, credentials, network endpoints, legacy storage, dates or XP hooks.
import {fault,uidKey} from './contract.mjs';
const sameIntent=(a,b)=>!!a&&!!b&&['uid','path','intentId','generation'].every(k=>a[k]===b[k]);
export function createWriteAdapter({queue,uid,epoch,context,write,intervalMs=1000}={}){
 uidKey(uid);
 if(!Number.isSafeInteger(epoch)||epoch<0||typeof context!=='function'||typeof write!=='function'||!Number.isFinite(intervalMs)||intervalMs<0)throw fault('adapter/invalid-options');
 const initial=context();if(initial?.uid!==uid||initial.epoch!==epoch||initial.status==='signedOut')throw fault('adapter/stale-session');
 const view=queue.bind(uid),attempts=new Map();let closed=false,task=null,timer=null,lastError=null;
 const alive=()=>{const c=context();return !closed&&view.valid()&&c?.uid===uid&&c.epoch===epoch&&c.status!=='signedOut';};
 const ready=()=>alive()&&context().status==='ready';
 function stop(){if(closed)return;closed=true;clearInterval(timer);if(view.valid())queue.unbind();}
 function current(){if(!alive()){stop();return false;}return true;}
 const status=()=>({uid,epoch,sessionId:view.sessionId,active:alive(),lastError,attempts:[...attempts.values()].map(a=>({path:a.row.path,intentId:a.row.intentId,generation:a.row.generation,flightId:a.token.flightId,phase:a.phase,started:a.started,settled:a.settled}))});
 async function release(a,evidence){
  if(a.settled)return;
  const done=await view.settleOwnFlight(a.token,evidence);
  if(!done){const flights=await view.unsettled();if(flights.some(f=>f.flightId===a.token.flightId))throw fault('adapter/settlement-rejected');}
  a.settled=true;
 }
 async function finish(a){
  await release(a,'acknowledged');if(!current())return;
  const latest=(await view.list()).find(r=>sameIntent(r,a.row));
  if(latest)await view.removeIfCurrent(latest); // exact current state CAS, never delete a newer identity
  // A false CAS is safe: a competing transition/new intent won. Re-read on the next pump.
  if((await view.list()).some(r=>sameIntent(r,a.row)))return;
  a.phase='complete';attempts.delete(a.token.flightId);
 }
 async function progress(a){
  if(!current())return;
  if(a.phase==='ack-local-pending'){await finish(a);return;}
  if(a.phase==='rejected-unknown'){
   const row=(await view.list()).find(r=>sameIntent(r,a.row));
   if(row&&['in-flight','awaiting-proof'].includes(row.state))await view.transition(row,'needs-choice');
   return; // rejection is not universal proof of non-commit; never release/retry this flight
  }
  if(a.started)return;
  const latest=(await view.list()).find(r=>r.path===a.row.path);
  if(!sameIntent(latest,a.row)){
   await release(a,'proved-not-sent');a.phase='superseded-unsent';attempts.delete(a.token.flightId);return;
  }
  if(!ready())return; // same live owner knows SDK has not been called; do not re-claim on reconnect
  a.started=true;a.phase='sdk-pending';
  let original;
  try{original=write(a.row.path,a.row.target);}
  catch{a.phase='rejected-unknown';return;}
  if(!original||typeof original.then!=='function'){a.phase='rejected-unknown';return;}
  // Attach immediately to the one original promise, never re-create a Firebase write on retry.
  Promise.resolve(original).then(()=>{if(current()){a.phase='ack-local-pending';void pump();}},()=>{if(current()){a.phase='rejected-unknown';void pump();}});
  const row=(await view.list()).find(r=>sameIntent(r,a.row));
  if(row?.state==='in-flight')await view.transition(row,'awaiting-proof');
 }
 async function drain(){
  if(!current())return;
  try{
   lastError=null;
   for(const a of [...attempts.values()]){await progress(a);if(!current())return;}
   if(!ready())return;
   for(const row of await view.list()){
    if(!ready())return;if(row.state!=='queued')continue;
    const claimed=await view.transition(row,'in-flight');if(!claimed)continue;
    const a={row:claimed,token:claimed.flightToken,phase:'claimed-unsent',started:false,settled:false};attempts.set(a.token.flightId,a);
    await progress(a);
   }
  }catch{if(current())lastError='adapter/local-operation-failed';}
 }
 function pump(){
  if(task)return task;
  task=drain().finally(()=>{task=null;});return task;
 }
 // Cooperative tabs need no leader for correctness. Polling ensures a surviving tab notices
 // that another owner released a blocker; BroadcastChannel/Web Locks are not safety inputs.
 if(intervalMs>0){timer=setInterval(()=>void pump(),intervalMs);timer.unref?.();}
 async function inspect(){
  if(!current())throw fault('adapter/stale-session');
  const intents=await view.list(),flights=await view.unsettled();
  // Diagnostic snapshots only; separate reads are never used as deletion/send authority.
  return {status:status(),intents:intents.map(row=>{
   const blockers=flights.filter(f=>f.path===row.path);
   const own=[...attempts.values()].find(a=>sameIntent(a.row,row));
   return {...row,delivery:own?.phase||(blockers.length?'blocked-by-unknown-flight':row.state==='queued'?'not-sent':'needs-recovery')};
  }),flights};
 }
 return Object.freeze({inspect,async enqueue(path,value){if(!current())throw fault('adapter/stale-session');const row=await view.put(path,value,{epoch});if(!current())throw fault('adapter/stale-session');void pump();return row;},pump,status,close:stop});
}
