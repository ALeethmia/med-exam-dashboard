import test from 'node:test';
import assert from 'node:assert/strict';
import {createCourseSync,COURSE_SYNC_PATH,COURSE_JOURNAL_PREFIX} from '../../src/study/course-sync.js';
import {createAccountStorage} from '../../account-storage.js';
import {createMockDatabase} from '../fixtures/mock-database.js';
const wait=()=>new Promise(r=>setTimeout(r,10));
function memory(){const values=new Map();return {getItem:k=>values.get(k)??null,setItem(k,v){values.set(k,String(v));},removeItem:k=>values.delete(k),key:i=>[...values.keys()][i]??null,get length(){return values.size;}};}
function mutex(){let tail=Promise.resolve();return {request(name,opts,fn){const result=tail.then(fn);tail=result.catch(()=>{});return result;}};}
function setup({db=createMockDatabase({}, {delay:0}),backing=memory(),locks=mutex(),id='A',date=false}={}){
 const account=createAccountStorage(backing);account.bind('synthetic-UID');const storage=account.view();let n=0,online=true,valid=true;
 const dates=new Map(),engine=createCourseSync({storage,uid:'synthetic-UID',valid:()=>valid&&account.read().bound,ready:()=>online,locks,newId:()=>id+'-'+(++n),events:new EventTarget(),prepareDates:changes=>date?Object.fromEntries(Object.entries(changes).filter(([,v])=>v).map(([p])=>[p,'2026-10-15'])):{},acceptDates:input=>{for(const [path,day] of Object.entries(input))if(!dates.has(path))dates.set(path,day);return true;}});
 engine.attach(db);return {engine,db,storage,backing,dates,online:value=>online=value,stop(){valid=false;engine.close();},close:()=>engine.close()};
}
const progress=h=>h.db.inspect().tree.videos||{};
const updates=h=>h.db.inspect().writes.filter(w=>w.method==='update');
const completed=h=>assert.equal(h.engine.inspect().pending.length,0);
test('single and chapter groups retain one multi-location update; no-op creates no write/date',async()=>{
 const h=setup({date:true});try{
 h.engine.enqueue({'videos/1':true,'videos/2':true},{baseline:{}});await h.engine.pump();completed(h);assert.deepEqual(progress(h),{1:true,2:true});assert.equal(updates(h).length,1);assert.equal(h.dates.size,2);
 const receipt=h.engine.enqueue({'videos/1':true},{baseline:{'videos/1':true}});assert.equal(receipt.noop,true);await h.engine.pump();assert.equal(updates(h).length,1);assert.equal(h.dates.size,2);
 h.engine.enqueue({'videos/1':false,'videos/2':false},{baseline:{'videos/1':true,'videos/2':true}});await h.engine.pump();completed(h);assert.deepEqual(progress(h),{1:false,2:false});assert.equal(updates(h).length,2);
 }finally{h.close();}
});
test('offline queued operations and refresh before dispatch recover automatically',async()=>{
 const h=setup();h.online(false);h.engine.enqueue({'videos/1':true});await h.engine.pump();assert.equal(updates(h).length,0);assert.equal(h.engine.inspect().pending[0].phase,'queued');h.close();
 const next=setup({db:h.db,backing:h.backing,id:'B'});try{await next.engine.pump();completed(next);assert.equal(progress(next)[1],true);assert.equal(updates(next).length,1);}finally{next.close();}
});
test('true → false → true retains immutable identities; original success cannot delete later requests',async()=>{
 const raw=createMockDatabase({}, {delay:0});let release,first=true;
 const db={...raw,ref(path=''){const ref=raw.ref(path);return {...ref,update:patch=>{if(first){first=false;return new Promise(resolve=>{release=async()=>{await ref.update(patch);resolve();};});}return ref.update(patch);}};}};
 const h=setup({db});try{
 h.engine.enqueue({'videos/1':true});await wait();h.engine.enqueue({'videos/1':false});h.engine.enqueue({'videos/1':true});assert.equal(h.engine.inspect().pending.length,3);
 h.online(false);const attempt=h.engine.pump();await release();await attempt;assert.equal(h.engine.inspect().pending.length,2);assert.equal(updates(h).length,1);
 h.online(true);await h.engine.pump();completed(h);assert.equal(progress(h)[1],true);assert.equal(updates(h).length,3);
 }finally{h.close();}
});
test('original success followed by local acknowledgement failure retries only local work',async()=>{
 const h=setup();const set=h.storage.setItem; // facade is immutable; fault the backing implementation
 const original=h.backing.setItem;let fail=true;
 h.backing.setItem=function(key,value){if(key.includes(COURSE_JOURNAL_PREFIX)&&JSON.parse(value).phase==='acknowledged'&&fail)throw Error('quota');return original.call(this,key,value);};
 try{h.engine.enqueue({'videos/1':true});await h.engine.pump();assert.equal(updates(h).length,1);assert.equal(h.engine.inspect().pending.length,1);fail=false;await h.engine.pump();completed(h);assert.equal(updates(h).length,1);assert.equal(JSON.parse(h.storage.getItem('med_exam_videos_cloud'))[1],true);}finally{h.close();}
});
test('reload after successful remote commit but failed local settlement uses transaction receipt, never Boolean cache',async()=>{
 const h=setup();const remove=h.backing.removeItem;h.backing.removeItem=()=>{throw Error('disk');};h.engine.enqueue({'videos/1':true});await h.engine.pump();assert.equal(updates(h).length,1);h.close();h.backing.removeItem=remove;
 const next=setup({db:h.db,backing:h.backing,id:'B'});try{await next.engine.pump();completed(next);assert.equal(updates(next).length,1);}finally{next.close();}
});
test('same UID tabs share append-only journal and origin lock, without lost courses',async()=>{
 const backing=memory(),locks=mutex(),db=createMockDatabase({}, {delay:0}),a=setup({backing,locks,db}),b=setup({backing,locks,db,id:'B'});
 try{a.engine.enqueue({'videos/1':true});b.engine.enqueue({'videos/2':true});await Promise.all([a.engine.pump(),b.engine.pump()]);completed(a);assert.deepEqual(progress(a),{1:true,2:true});assert.equal(updates(a).length,2);}finally{a.close();b.close();}
});
test('cross-device revision conflicts retain the whole group; explicit reapply is atomic',async()=>{
 const db=createMockDatabase({videos:{1:false,2:false}},{delay:0}),a=setup({db}),b=setup({db,id:'B'});await wait();b.online(false);
 try{b.engine.enqueue({'videos/1':true,'videos/2':true},{baseline:{'videos/1':false,'videos/2':false}});a.engine.enqueue({'videos/1':true},{baseline:{'videos/1':false}});await a.engine.pump();completed(a);
 b.online(true);await b.engine.pump();assert.equal(updates(b).length,1);assert.equal(b.engine.inspect().pending[0].phase,'review');assert.deepEqual(progress(b),{1:true,2:false});
 await b.engine.resolve('videos/1',true);await b.engine.pump();completed(b);assert.deepEqual(progress(b),{1:true,2:true});assert.equal(updates(b).length,2);
 }finally{a.close();b.close();}
});
test('rejection before or after server commit never blindly resends; positive receipt recovers post-commit',async()=>{
 for(const after of [false,true]){
  const raw=createMockDatabase({}, {delay:0});const db={...raw,ref(path=''){const ref=raw.ref(path);return {...ref,async update(patch){if(after)await ref.update(patch);throw Error('permission/network/timeout');}};}};
  const h=setup({db});try{h.engine.enqueue({'videos/1':true});await h.engine.pump();if(!after)assert.equal(h.engine.inspect().pending[0].phase,'sending');await h.engine.pump();assert.equal(updates(h).length,after?1:0);if(after)completed(h);else {assert.equal(h.engine.inspect().unknown,true);assert.match(h.engine.inspect().error,/未知/);}}finally{h.close();}
 }
});
test('matching cached true cannot acknowledge an uncertain batch without its exact receipt',async()=>{
 const h=setup();h.online(false);h.engine.enqueue({'videos/1':true});await h.engine.pump();const row=h.engine.inspect().pending[0];h.storage.setItem(COURSE_JOURNAL_PREFIX+row.id,JSON.stringify({...row,phase:'sending'}));h.db.replace({videos:{1:true}});h.online(true);
 try{await h.engine.pump();assert.equal(h.engine.inspect().unknown,true);assert.equal(updates(h).length,0);assert.equal(h.engine.inspect().pending.length,1);}finally{h.close();}
});
test('failed local batch save exposes no partial request, no date and no remote call',async()=>{
 const h=setup({date:true});h.backing.setItem=()=>{throw Error('quota');};try{assert.throws(()=>h.engine.enqueue({'videos/1':true,'videos/2':true}),/本機保存失敗/);await h.engine.pump();assert.equal(h.engine.inspect().localError,true);completed(h);assert.equal(updates(h).length,0);assert.equal(h.dates.size,0);}finally{h.close();}
});
test('UID or epoch invalidation blocks old acknowledgement and later writes',async()=>{
 const raw=createMockDatabase({}, {delay:0});let release;const db={...raw,ref(path=''){const ref=raw.ref(path);return {...ref,update:patch=>new Promise(resolve=>release=async()=>{await ref.update(patch);resolve();})};}};
 const h=setup({db});h.engine.enqueue({'videos/1':true});await wait();h.stop();await release();await h.engine.pump();assert.equal(h.engine.inspect().pending.length,1);assert.throws(()=>h.engine.enqueue({'videos/2':true}),/登入/);assert.equal(updates(h).length,1);
});
test('missing Web Locks fails closed with a recoverable local request',async()=>{
 const h=setup({locks:{}});try{h.engine.enqueue({'videos/1':true});await h.engine.pump();assert.equal(updates(h).length,0);assert.match(h.engine.inspect().error,/多分頁/);assert.equal(h.engine.inspect().pending.length,1);}finally{h.close();}
});
test('200 rounds of save/retry/reload preserve dates, historical XP and finish without pending',async()=>{
 const db=createMockDatabase({gamification:{v1:{awards:{historical:{xp:20,day:'2026-10-01'}}}}},{delay:0});let h=setup({db,date:true});try{
 for(let n=0;n<200;n++){
  const value=n%2===0;h.engine.enqueue({'videos/1':value,'videos/2':value},{baseline:{'videos/1':n>0?!value:null,'videos/2':n>0?!value:null}});await h.engine.pump();completed(h);await h.engine.pump();
  if(n%20===19){h.close();h=setup({db,backing:h.backing,date:true,id:'round-'+n});await wait();}
 }
 assert.equal(updates(h).length,200);assert.deepEqual(db.inspect().tree.gamification.v1.awards,{historical:{xp:20,day:'2026-10-01'}});assert.deepEqual(progress(h),{1:false,2:false});completed(h);
 }finally{h.close();}
});

test('a delayed pre-commit root callback cannot regress the next local base revision',async()=>{
 const h=setup();try{h.engine.enqueue({'videos/1':true});await h.engine.pump();completed(h);
 // Mock callbacks capture snapshots at scheduling time. Before their delayed delivery,
 // the same origin may have acknowledged and removed the earlier request.
 await wait();h.engine.enqueue({'videos/1':false,'videos/2':true},{baseline:{'videos/1':true}});await h.engine.pump();completed(h);assert.deepEqual(progress(h),{1:false,2:true});assert.equal(updates(h).length,2);
 }finally{h.close();}
});

test('durable original-day handoff survives a first-date storage failure without repeating Firebase',async()=>{
 const {createCourseDates}=await import('../../course-dates.js');
 const backing=memory(),account=createAccountStorage(backing);account.bind('synthetic-UID');const storage=account.view(),db=createMockDatabase({}, {delay:0});let id=0;
 const dates=createCourseDates({keys:new Set(['videos__1']),storage,localOnly:true,events:new EventTarget(),today:()=> '2026-10-16',newId:()=> 'date-'+(++id)});
 const engine=createCourseSync({storage,uid:'synthetic-UID',valid:()=>true,ready:()=>true,locks:mutex(),newId:()=> 'synthetic-handoff',events:new EventTarget(),prepareDates:()=>({'videos__1':'2026-10-15'}),acceptDates:entries=>{for(const [key,day] of Object.entries(entries))dates.set(key,day,{firstOnly:true});return true;}});engine.attach(db);
 const original=backing.setItem;let fail=true;backing.setItem=function(key,value){if(key.includes('med_exam_course_dates')&&fail)throw Error('quota');return original.call(this,key,value);};
 try{engine.enqueue({'videos/1':true});await engine.pump();assert.equal(dates.records().videos__1,undefined);assert.equal(engine.inspect().pending[0].phase,'acknowledged');assert.equal(db.inspect().writes.filter(w=>w.method==='update').length,1);
 fail=false;await engine.pump();assert.equal(engine.inspect().pending.length,0);assert.equal(dates.records().videos__1.day,'2026-10-15');assert.equal(db.inspect().writes.filter(w=>w.method==='update').length,1);
 const version=dates.records().videos__1._version;dates.set('videos__1','2026-10-16',{firstOnly:true});assert.equal(dates.records().videos__1._version,version);
 }finally{engine.close();dates.dispose();}
});

test('receipt recovery of an older commit does not resurrect it over a later device value',async()=>{
 const h=setup();const remove=h.backing.removeItem;h.backing.removeItem=()=>{throw Error('disk');};h.engine.enqueue({'videos/1':true});await h.engine.pump();h.close();h.backing.removeItem=remove;
 const peer=setup({db:h.db,id:'peer'});await wait();peer.engine.enqueue({'videos/1':false},{baseline:{'videos/1':true}});await peer.engine.pump();completed(peer);peer.close();
 const restored=setup({db:h.db,backing:h.backing,id:'restored'});try{await wait();await restored.engine.pump();completed(restored);assert.equal(progress(restored)[1],false);assert.equal(JSON.parse(restored.storage.getItem('med_exam_videos_cloud'))[1],false);assert.equal(updates(restored).length,2);}finally{restored.close();}
});

test('explicit local mode uses the same atomic local commit and never calls Firebase',async()=>{
 const backing=memory(),account=createAccountStorage(backing);account.bind('local-demo');const storage=account.view();const engine=createCourseSync({storage,uid:'local-demo',valid:()=>true,ready:()=>false,localOnly:true,locks:mutex(),events:new EventTarget()});
 try{engine.enqueue({'videos/1':true,'videos/2':true});await engine.pump();assert.equal(engine.inspect().pending.length,0);assert.deepEqual(JSON.parse(storage.getItem('med_exam_videos_cloud')),{1:true,2:true});const set=backing.setItem;backing.setItem=()=>{throw Error('quota');};assert.throws(()=>engine.enqueue({'videos/1':false}),/本機保存失敗/);assert.equal(JSON.parse(storage.getItem('med_exam_videos_cloud'))[1],true);backing.setItem=set;}finally{engine.close();}
});
