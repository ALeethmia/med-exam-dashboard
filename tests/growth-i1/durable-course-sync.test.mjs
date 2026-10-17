import {testCoordination} from '../helpers/course-coordination.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCourseSync,COURSE_JOURNAL_PREFIX,COURSE_SNAPSHOT_PREFIX,courseDocumentPath} from '../../src/study/course-sync.js';
import {emptyCourseDocument,applyCourseRequest} from '../../src/study/course-contract.js';
import {createAccountStorage} from '../../account-storage.js';
import {createMockDatabase} from '../fixtures/mock-database.js';
const uid='synthetic-A',path=courseDocumentPath(uid),tick=()=>new Promise(r=>setTimeout(r,10));
function memory(){const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k),key:i=>[...map.keys()][i]??null,get length(){return map.size;}};}
const seed=(doc=emptyCourseDocument())=>({users:{[uid]:{learningV3:doc}},videos:{legacy:true},gamification:{v1:{awards:{old:{xp:20}}}},otherUsers:{keep:true}});
function setup({db=createMockDatabase(seed(),{delay:0}),backing=memory(),id='A',localOnly=false,locks}={}){
 const account=createAccountStorage(backing);account.bind(uid);const storage=account.view();let n=0,online=true,valid=true;
 const engine=createCourseSync({coordination:testCoordination(backing),storage,uid,localOnly,locks,valid:()=>valid,ready:()=>online,newId:()=>id+'-'+(++n),events:new EventTarget(),prepareDates:changes=>Object.fromEntries(Object.entries(changes).filter(([,v])=>v).map(([p])=>[p.replace('/','__'),'2026-10-15']))});engine.attach(localOnly?null:db);
 return {engine,db,backing,storage,account,online:value=>online=value,close(){valid=false;engine.close();}};
}
const doc=h=>h.db.inspect().tree.users[uid].learningV3;
const empty=h=>assert.equal(h.engine.inspect().pending.length,0);
function faultDB(raw,{before=false,after=false,hold=false}={}){let fail=true,release;return {...raw,ref(p=''){const ref=raw.ref(p);return p===path?{...ref,async transaction(fn,...args){if(fail){fail=false;if(hold)await new Promise(r=>release=r);if(before)throw Error('network');const result=await ref.transaction(fn,...args);if(after)throw Error('lost acknowledgement');return result;}return ref.transaction(fn,...args);}}:ref;},release:()=>release?.()};}
test('single/chapter operations are one atomic bounded document commit, including original first date',async()=>{
 const h=setup();try{h.engine.enqueue({'videos/1':true,'physiology/fc_p_1_a':true});await h.engine.pump();empty(h);assert.equal(doc(h).clock,1);assert.equal(doc(h).courses.videos[1],true);assert.equal(doc(h).firstCompletion.videos__1.day,'2026-10-15');assert.equal(h.db.inspect().writes.length,1);assert.equal(h.db.inspect().writes[0].path,path);assert.deepEqual(h.db.inspect().tree.videos,{legacy:true});assert.equal(h.db.inspect().tree.gamification.v1.awards.old.xp,20);}finally{h.close();}
});
test('same value save is a no-op, and cancel/recheck cannot duplicate first date or XP',async()=>{
 const h=setup();try{h.engine.enqueue({'videos/1':true});await h.engine.pump();const date=doc(h).firstCompletion.videos__1;assert.equal(h.engine.enqueue({'videos/1':true}).noop,true);for(const value of [false,true]){h.engine.enqueue({'videos/1':value});await h.engine.pump();}empty(h);assert.deepEqual(doc(h).firstCompletion.videos__1,date);assert.equal(doc(h).clock,3);assert.equal(h.db.inspect().tree.gamification.v1.awards.old.xp,20);}finally{h.close();}
});
test('offline and refresh preserve queued groups and automatically recover on reconnect',async()=>{
 const h=setup();h.online(false);h.engine.enqueue({'videos/1':true,'videos/2':true});await h.engine.pump();assert.equal(doc(h).clock,0);h.close();const next=setup({db:h.db,backing:h.backing,id:'next'});try{await new Promise(r=>setTimeout(r,3100));await next.engine.pump();empty(next);assert.equal(doc(next).clock,1);}finally{next.close();}
});
for(const after of [false,true])test('unknown result '+(after?'after':'before')+' commit automatically retries the same CAS without duplicate effects',async()=>{
 const raw=createMockDatabase(seed(),{delay:0}),h=setup({db:faultDB(raw,{before:!after,after})});try{await tick();h.engine.enqueue({'videos/1':true});await h.engine.pump();await h.engine.pump();empty(h);assert.equal(doc(h).clock,1);assert.equal(h.engine.inspect().unknown,false);assert.equal(doc(h).firstCompletion.videos__1.day,'2026-10-15');}finally{h.close();}
});
test('original pending Promise is not duplicated by this live sender; ABA generations all settle',async()=>{
 const db=faultDB(createMockDatabase(seed(),{delay:0}),{hold:true}),h=setup({db});try{h.engine.enqueue({'videos/1':true});await tick();h.engine.enqueue({'videos/1':false});h.engine.enqueue({'videos/1':true});assert.equal(h.engine.inspect().pending.length,3);db.release();await h.engine.pump();empty(h);assert.equal(doc(h).clock,3);assert.equal(doc(h).courses.videos[1],true);}finally{h.close();}
});
test('original success with local settlement failure retries local work only',async()=>{
 const h=setup(),set=h.backing.setItem;let fail=true;try{await tick();h.backing.setItem=(key,value)=>{if(fail&&key.includes(COURSE_JOURNAL_PREFIX)&&JSON.parse(value).phase==='acknowledged')throw Error('quota');return set(key,value);};h.engine.enqueue({'videos/1':true});await h.engine.pump();assert.equal(doc(h).clock,1);fail=false;const count=h.db.inspect().writes.length;await h.engine.pump();empty(h);assert.equal(h.db.inspect().writes.length,count);}finally{h.close();}
});
test('refresh after acknowledgement loss and cleanup failure safely recovers from server revision',async()=>{
 const h=setup(),remove=h.backing.removeItem;h.backing.removeItem=key=>{if(key.includes(COURSE_JOURNAL_PREFIX))throw Error('disk');return remove(key);};h.engine.enqueue({'videos/1':true});await h.engine.pump();h.close();h.backing.removeItem=remove;
 const next=setup({db:h.db,backing:h.backing,id:'next'});try{await new Promise(r=>setTimeout(r,3100));await next.engine.pump();empty(next);assert.equal(doc(next).clock,1);}finally{next.close();}
});
test('same UID tabs without Web Locks append independently and preserve unrelated courses',async()=>{
 const backing=memory(),db=createMockDatabase(seed(),{delay:0}),a=setup({backing,db}),b=setup({backing,db,id:'B'});try{a.engine.enqueue({'videos/1':true});b.engine.enqueue({'videos/2':true});await Promise.all([a.engine.pump(),b.engine.pump()]);empty(a);assert.deepEqual(doc(a).courses.videos,{1:true,2:true});assert.equal(doc(a).clock,2);}finally{a.close();b.close();}
});
test('cross-device stale whole batch needs one explicit choice; reapply uses a new unique identity',async()=>{
 const db=createMockDatabase(seed(),{delay:0}),a=setup({db}),b=setup({db,id:'B'});try{await tick();b.online(false);const old=b.engine.enqueue({'videos/1':true,'videos/2':true});a.engine.enqueue({'videos/1':true});await a.engine.pump();b.online(true);await b.engine.pump();assert.equal(b.engine.inspect().pending[0].phase,'review');await b.engine.resolve('videos/1',true);await b.engine.pump();empty(b);assert.equal(doc(b).courses.videos[2],true);assert.notEqual(doc(b).versions.videos__1,old.id);}finally{a.close();b.close();}
});
test('a delayed old request cannot pass stale bases after a newer valid edit, including true-false-true',async()=>{
 const h=setup();try{h.online(false);h.engine.enqueue({'videos/1':true});const old=h.engine.inspect().pending[0];let state=applyCourseRequest(emptyCourseDocument(),old);const newer={...old,id:'newer',changes:{'videos/1':false},bases:{'videos/1':{value:true,version:old.id}}};state=applyCourseRequest(state,newer);assert.deepEqual(applyCourseRequest(state,old),state);assert.equal(state.courses.videos[1],false);}finally{h.close();}
});
test('manual dates share the course CAS writer; tombstones survive automatic first-date retries',async()=>{
 const h=setup();try{h.engine.enqueue({'videos/1':true});await h.engine.pump();h.engine.setDate('videos__1','2026-10-14');await h.engine.pump();assert.equal(doc(h).firstCompletion.videos__1.day,'2026-10-14');h.engine.setDate('videos__1',null);await h.engine.pump();for(const value of [false,true]){h.engine.enqueue({'videos/1':value});await h.engine.pump();}empty(h);assert.equal(doc(h).firstCompletion.videos__1.day,null);}finally{h.close();}
});
test('failed local chapter commit exposes no partial intent/date or remote mutation',async()=>{
 const h=setup();try{h.backing.setItem=()=>{throw Error('quota');};assert.throws(()=>h.engine.enqueue({'videos/1':true,'videos/2':true}),/本機保存失敗/);await h.engine.pump();assert.equal(doc(h).clock,0);assert.equal(Object.keys(doc(h).firstCompletion).length,0);empty(h);}finally{h.close();}
});
test('UID/epoch invalidation prevents old callbacks from settling or submitting new work',async()=>{
 const db=faultDB(createMockDatabase(seed(),{delay:0}),{hold:true}),h=setup({db});h.engine.enqueue({'videos/1':true});await tick();h.close();db.release();await h.engine.pump();assert.equal(doc(h).clock,0);assert.throws(()=>h.engine.enqueue({'videos/2':true}),/登入/);assert.equal(h.engine.inspect().pending.length,1);
});
test('reset generation fences delayed old writes; old intents are retained separately and cannot block new work',async()=>{
 const h=setup();h.online(false);h.engine.enqueue({'videos/1':true});const old=h.engine.inspect().pending[0],reset={...emptyCourseDocument('reset-uuid'),era:1};h.db.replace(seed(reset));await tick();h.online(true);await h.engine.pump();empty(h);assert.equal(h.engine.inspect().retired,1);assert.deepEqual(applyCourseRequest(reset,old),reset);h.engine.enqueue({'videos/2':true});await h.engine.pump();empty(h);assert.deepEqual(doc(h).courses.videos,{2:true});h.close();
});
test('200 rounds/reloads keep bounded metadata/snapshots and never accumulate pending or repeat dates',async()=>{
 let h=setup();try{for(let i=0;i<200;i++){h.engine.enqueue({'videos/1':i%2===0,'videos/2':i%2===0});await h.engine.pump();empty(h);if(i%20===19){h.close();h=setup({db:h.db,backing:h.backing,id:'round-'+i});await tick();}}assert.equal(doc(h).clock,200);assert.equal(Object.keys(doc(h).versions).length,2);assert.equal(Object.keys(doc(h).firstCompletion).length,2);assert.equal(doc(h).receipts,undefined);assert.equal(doc(h).gate,undefined);const snapshots=Array.from({length:h.storage.length},(_,i)=>h.storage.key(i)).filter(k=>k.startsWith(COURSE_SNAPSHOT_PREFIX));assert(snapshots.length<=2);assert.equal(h.db.inspect().tree.gamification.v1.awards.old.xp,20);}finally{h.close();}
});

test('lease keeps a live claim stable; crashed sender is safely taken over and late callback cannot recreate it',async()=>{const backing=memory(),raw=createMockDatabase(seed(),{delay:0}),held=faultDB(raw,{hold:true}),a=setup({backing,db:held,id:'lease-A'}),b=setup({backing,db:raw,id:'lease-B'});try{a.engine.enqueue({'videos/1':true});await tick();await b.engine.pump();assert.equal(doc(b).clock,0);await new Promise(r=>setTimeout(r,3100));await b.engine.pump();empty(b);assert.equal(doc(b).clock,1);held.release();await a.engine.pump();empty(a);assert.equal(doc(a).clock,1);}finally{a.close();b.close();}});

test('single live tab recovers from a never-resolving acknowledgement after commit without inventing success',async()=>{const raw=createMockDatabase(seed(),{delay:0});let first=true,attempts=0;const db={...raw,ref(p){const ref=raw.ref(p);return {...ref,async transaction(...args){attempts++;if(!first)assert.equal(h.engine.inspect().pending.length,1,'timeout must not remove pending');const result=await ref.transaction(...args);if(first){first=false;return new Promise(()=>{});}return result;}};}};const h=setup({db,id:'never-ack'});try{h.engine.enqueue({'videos/1':true});await h.engine.pump();await h.engine.pump();empty(h);assert.equal(attempts,2);assert.equal(doc(h).clock,1);}finally{h.close();}});

test('legacy date pending remains quarantined and unchanged through new atomic saves',async()=>{const h=setup();try{const old={videos__1:{value:{day:'2026-01-01',_version:'legacy'},base:null}};h.storage.setItem('med_exam_course_dates_v1',JSON.stringify({records:{},pending:old}));h.engine.enqueue({'videos/1':true});await h.engine.pump();empty(h);assert.deepEqual(JSON.parse(h.storage.getItem('med_exam_course_dates_v1')).pending,old);assert.equal(h.engine.inspect().quarantined,1);assert.equal(doc(h).clock,1);assert.equal(doc(h).firstCompletion.videos__1.day,'2026-10-15');}finally{h.close();}});
test('offline completion then manual date edit survives reload and reconnects without a false conflict',async()=>{
 const h=setup();h.online(false);h.engine.enqueue({'videos/1':true});h.engine.setDate('videos__1','2026-10-14');await h.engine.pump();h.close();
 const next=setup({db:h.db,backing:h.backing,id:'date-reload'});try{await next.engine.pump();empty(next);assert.equal(doc(next).clock,2);assert.equal(doc(next).courses.videos[1],true);assert.equal(doc(next).firstCompletion.videos__1.day,'2026-10-14');}finally{next.close();}
});

test('verified delayed server UUID settles only its immutable row after claim takeover; newer ABA survives',async()=>{const raw=createMockDatabase(seed(),{delay:0});let count=0;const db={...raw,ref(p){const ref=raw.ref(p);return {...ref,async transaction(...args){const n=++count,result=await ref.transaction(...args);if(n===1){await new Promise(r=>setTimeout(r,4000));return result;}if(n===2)return new Promise(()=>{});return result;}};}};const h=setup({db,id:'late-server-proof'});try{h.engine.enqueue({'videos/1':true});await h.engine.pump();await new Promise(r=>setTimeout(r,1500));await h.engine.pump();empty(h);assert.equal(doc(h).clock,1);h.engine.enqueue({'videos/1':false});h.engine.enqueue({'videos/1':true});await h.engine.pump();empty(h);assert.equal(doc(h).clock,3);assert.equal(doc(h).courses.videos[1],true);}finally{h.close();}});
