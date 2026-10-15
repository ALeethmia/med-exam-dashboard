import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createWriteAdapter} from '../../prototypes/sync-queue/write-adapter.mjs';
// Deliberately small contract double, not an IndexedDB substitute. Chromium covers real transactions.
function fakeQueue(){
 let session=0,id=0,generation=0;const rows=new Map(),flights=new Map();let abortRemove=false,abortSettle=false;
 const q={rows,flights,bind(uid){const owner=++session;return {sessionId:String(owner),valid:()=>owner===session,
  async put(path,value,{epoch}={}){const r={uid,path,intentId:String(++id),generation:++generation,state:'queued',target:value===null?{kind:'delete'}:{kind:'set',value},ownerSession:String(owner),epoch};rows.set(path,r);return structuredClone(r);},
  async list(){return structuredClone([...rows.values()]);},async unsettled(){return structuredClone([...flights.values()]);},
  async transition(expected,to){const r=rows.get(expected.path);if(!r||r.intentId!==expected.intentId||r.state!==expected.state||to==='in-flight'&&[...flights.values()].some(f=>f.path===r.path))return false;const next={...r,state:to};if(to==='in-flight'){next.flightToken={uid,path:r.path,intentId:r.intentId,generation:r.generation,flightId:'f'+(++id),ownerSession:String(owner)};flights.set(next.flightToken.flightId,next.flightToken);}rows.set(r.path,next);return structuredClone(next);},
  async settleOwnFlight(t){if(abortSettle){abortSettle=false;throw Error('injected abort');}if(t.ownerSession!==String(owner))return false;return flights.delete(t.flightId);},
  async removeIfCurrent(r){if(abortRemove){abortRemove=false;throw Error('injected abort');}const latest=rows.get(r.path);if(latest?.intentId!==r.intentId||latest.state!==r.state||[...flights.values()].some(f=>f.path===r.path))return false;return rows.delete(r.path);}
 };},unbind(){session++;},abortRemove(){abortRemove=true;},abortSettle(){abortSettle=true;}};return q;
}
function setup(){const queue=fakeQueue(),state={uid:'fixture-A',epoch:1,status:'ready'},calls=[];const a=createWriteAdapter({queue,uid:state.uid,epoch:1,context:()=>state,intervalMs:0,write(path,target){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});calls.push({path,target,resolve,reject});return promise;}});return {queue,state,calls,a};}
const path='physiology/fc_p_1_a';
async function tick(a){await Promise.resolve();await a.pump();await Promise.resolve();await a.pump();}
test('claim precedes one original SDK invocation and a success clears exact intent',async()=>{const {a,queue,calls}=setup();const row=await a.enqueue(path,true);assert.equal(row.epoch,1);assert.equal(row.ownerSession,a.status().sessionId);await tick(a);assert.equal(calls.length,1);assert.equal(queue.flights.size,1);calls[0].resolve();await tick(a);assert.equal(queue.flights.size,0);assert.equal(queue.rows.size,0);a.close();});
test('reconnect never re-sends an unresolved flight',async()=>{const {a,state,calls}=setup();await a.enqueue(path,true);await tick(a);state.status='loading';await tick(a);state.status='ready';for(let i=0;i<5;i++)await tick(a);assert.equal(calls.length,1);a.close();});
test('ABA old success cannot clear latest intent; it unblocks a distinct next flight',async()=>{const {a,calls,queue}=setup();await a.enqueue(path,true);await tick(a);await a.enqueue(path,false);const current=await a.enqueue(path,true);await tick(a);assert.equal(calls.length,1);calls[0].resolve();await tick(a);assert.equal(calls.length,2);assert.equal(queue.rows.get(path).intentId,current.intentId);calls[1].resolve();await tick(a);assert.equal(queue.rows.size,0);a.close();});
for(const phase of ['abortSettle','abortRemove'])test('acknowledged write retries only local cleanup after '+phase,async()=>{const {a,calls,queue}=setup();await a.enqueue(path,true);await tick(a);queue[phase]();calls[0].resolve();await tick(a);await tick(a);assert.equal(calls.length,1);assert.equal(queue.rows.size,0);a.close();});
for(const code of ['PERMISSION_DENIED','NETWORK_ERROR'])test('rejection '+code+' retains unknown flight and blocks a newer intent',async()=>{const {a,calls,queue}=setup();await a.enqueue(path,true);await tick(a);calls[0].reject({code});await tick(a);assert.equal(queue.rows.get(path).state,'needs-choice');await a.enqueue(path,false);await tick(a);assert.equal(calls.length,1);assert.equal(queue.flights.size,1);assert.equal(queue.rows.get(path).state,'queued');a.close();});
test('epoch change invalidates old success without deleting pending',async()=>{const {a,calls,state,queue}=setup();await a.enqueue(path,true);await tick(a);state.epoch++;calls[0].resolve();await tick(a);assert.equal(queue.rows.size,1);assert.equal(queue.flights.size,1);assert.equal(a.status().active,false);await assert.rejects(()=>a.enqueue(path,false),/stale-session/);});
test('loading permits durable queueing but not sending',async()=>{const {a,calls,state}=setup();state.status='loading';await a.enqueue(path,true);await tick(a);assert.equal(calls.length,0);state.status='ready';await tick(a);assert.equal(calls.length,1);a.close();});
test('bad writer return or synchronous exception is not accepted as acknowledgement',async()=>{for(const write of [()=>undefined,()=>{throw Error('uncertain');}]){const queue=fakeQueue(),state={uid:'fixture-A',epoch:1,status:'ready'};const a=createWriteAdapter({queue,uid:state.uid,epoch:1,context:()=>state,intervalMs:0,write});await a.enqueue(path,true);await tick(a);assert.equal(queue.rows.size,1);assert.equal(queue.flights.size,1);assert.equal(a.status().attempts[0].phase,'rejected-unknown');a.close();}});
test('prototype source is not referenced by product and contains no network, legacy or reward APIs',()=>{const source=readFileSync('prototypes/sync-queue/write-adapter.mjs','utf8').replace(/^\s*\/\/.*$/gm,'');assert(!/\b(fetch|localStorage|firebase|dispatchEvent)\s*[.(]/.test(source));const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(d+'/'+e.name):[d+'/'+e.name]);for(const f of [...readdirSync('.').filter(f=>/\.(js|html)$/.test(f)),...walk('src')])assert(!readFileSync(f,'utf8').includes('write-adapter.mjs'),f);});
test('live claim paused before SDK call resumes exactly once without a second claim',async()=>{
 const queue=fakeQueue(),state={uid:'fixture-A',epoch:1,status:'ready'};let claims=0,calls=0;
 const wrapped={bind(uid){const v=queue.bind(uid);return {...v,async transition(...args){const r=await v.transition(...args);if(r&&args[1]==='in-flight'){claims++;state.status='loading';}return r;}};},unbind:()=>queue.unbind()};
 const a=createWriteAdapter({queue:wrapped,uid:state.uid,epoch:1,context:()=>state,intervalMs:0,write(){calls++;return new Promise(()=>{});}});
 await a.enqueue(path,true);await tick(a);assert.equal(calls,0);assert.equal(claims,1);state.status='ready';await tick(a);assert.equal(calls,1);assert.equal(claims,1);a.close();
});
test('live superseded unsent claim releases only its blocker and schedules latest intent',async()=>{
 const queue=fakeQueue(),state={uid:'fixture-A',epoch:1,status:'ready'};let first=true,calls=0;
 const wrapped={bind(uid){const v=queue.bind(uid);return {...v,async transition(...args){const r=await v.transition(...args);if(r&&args[1]==='in-flight'&&first){first=false;state.status='loading';}return r;}};},unbind:()=>queue.unbind()};
 const a=createWriteAdapter({queue:wrapped,uid:state.uid,epoch:1,context:()=>state,intervalMs:0,write(){calls++;return new Promise(()=>{});}});
 await a.enqueue(path,true);await tick(a);await a.enqueue(path,false);await tick(a);state.status='ready';await tick(a);assert.equal(calls,1);assert.deepEqual(queue.rows.get(path).target,{kind:'set',value:false});a.close();
});
test('invalidating an older adapter never unbinds a newly bound session on the same client',async()=>{
 const queue=fakeQueue(),context=()=>({uid:'fixture-A',epoch:1,status:'ready'}),write=()=>new Promise(()=>{});
 const old=createWriteAdapter({queue,uid:'fixture-A',epoch:1,context,write,intervalMs:0});
 const next=createWriteAdapter({queue,uid:'fixture-A',epoch:1,context,write,intervalMs:0});await old.pump();assert.equal(next.status().active,true);await next.enqueue(path,true);await next.pump();assert.equal(queue.flights.size,1);next.close();
});
