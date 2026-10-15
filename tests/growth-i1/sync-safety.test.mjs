import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createReadiness,observeDatabase} from '../../readiness.js';
import {createAccountStorage} from '../../account-storage.js';
import {createCourseDates,COURSE_DATES_KEY,COURSE_DATES_PATH} from '../../course-dates.js';
import {createMockDatabase} from '../fixtures/mock-database.js';
const source=readFileSync(new URL('../../sync.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
const memory=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k),key:i=>[...values.keys()][i]??null,get length(){return values.size;}};};
class CustomEvent extends Event {constructor(type,{detail}={}){super(type);this.detail=detail;}}
function setup({seed={},pending=null}={}){
 const backing=memory(),account=createAccountStorage(backing);account.bind('fixture-A');const storage=account.view();if(pending)storage.setItem('med_exam_pending_writes_v1',JSON.stringify(pending));
 const lifecycle=createReadiness({paths:['videos'],timeoutMs:0});lifecycle.start({displayName:'Fixture A'});
 const database=createMockDatabase(seed,{delay:1});const target=new EventTarget(),status={};let wrapped;
 Object.assign(target,{learningStorage:storage,becomingStorage:account,workspaceLocalOnly:false,i3Runtime:{lifecycle,read:lifecycle.read,subscribe:lifecycle.subscribe,wrap:db=>(wrapped=observeDatabase(db,lifecycle)),retry:()=>wrapped.retry()}});
 vm.runInNewContext(source,{window:target,document:{getElementById:()=>status},Event,CustomEvent});target.attachLearningDB(database);
 const attach=()=>wrapped.ref('videos').on('value',snap=>target.mergeLearningSnapshot('videos',snap.val()));
 const saved=()=>JSON.parse(storage.getItem('med_exam_pending_writes_v1')||'{}');
 return {window:target,status,lifecycle,database,account,storage,backing,attach,saved,dispose:()=>lifecycle.dispose()};
}
test('offline → connected/loading → ready reconciles matching pending without duplicate submission',async()=>{
 const h=setup({seed:{videos:{1:true}},pending:{'videos/1':true}});await tick();assert.equal(h.lifecycle.read().status,'loading');assert.equal(h.database.inspect().writes.length,0);h.attach();await tick();assert.equal(h.lifecycle.read().status,'ready');assert.deepEqual(h.saved(),{});assert.equal(h.database.inspect().writes.length,0);h.window.retryLearningSync();await tick();assert.equal(h.database.inspect().writes.length,0);h.dispose();
});
test('unversioned offline differences pause; explicit local decision alone submits once',async()=>{
 const h=setup({seed:{videos:{1:false}}});await tick();h.window.persistCourseChanges({'videos/1':true});assert.equal(h.saved()['videos/1'],true);h.attach();await tick();assert.equal(h.window.learningSyncStatus('videos/1').review,true);assert.match(h.status.textContent,/待確認/);assert.equal(h.database.inspect().writes.length,0);await h.window.resolveLearningSync('videos/1',true);await tick();assert.equal(h.database.inspect().tree.videos[1],true);assert.deepEqual(h.saved(),{});h.window.retryLearningSync();await tick();assert.equal(h.database.inspect().writes.length,1);assert.equal(h.database.inspect().tree.gamification,undefined);h.dispose();
});
test('newer remote cancellation is never silently overwritten on reconnect; adopt remote keeps unrelated pending',async()=>{
 const h=setup({seed:{videos:{1:true,2:false}},pending:{'videos/1':true,'videos/2':true}});h.attach();await tick();assert.equal(h.saved()['videos/1'],undefined);h.database.connection(false);await tick();h.window.persistCourseChanges({'videos/1':true});h.database.replace({videos:{1:false,2:false}});await tick();h.database.connection(true);await tick();assert.equal(h.database.inspect().tree.videos[1],false);assert.equal(h.database.inspect().writes.length,0);await h.window.resolveLearningSync('videos/1',false);await tick();assert.equal(h.saved()['videos/1'],undefined);assert.equal(h.saved()['videos/2'],true);assert.equal(h.database.inspect().writes.length,0);h.dispose();
});
test('read failure then retry waits for successful snapshots before reconciling pending',async()=>{
 const h=setup({seed:{videos:{1:true}},pending:{'videos/1':true}});h.attach();h.database.reject('PERMISSION_DENIED');await tick();assert.equal(h.lifecycle.read().status,'error');assert.equal(h.saved()['videos/1'],true);h.window.retryLearningSync();await tick();assert.equal(h.database.inspect().writes.length,0);h.window.i3Runtime.retry();await tick();assert.equal(h.lifecycle.read().status,'ready');assert.deepEqual(h.saved(),{});h.dispose();
});
test('ready notification while a rejected write is settling is not lost',async()=>{
 const h=setup({seed:{videos:{1:false}}});h.attach();await tick();const real=h.window.learningDB;let reject;
 h.window.learningDB={ref:path=>path?real.ref(path):{update:()=>new Promise((_,r)=>{reject=r;})}};
 h.window.persistCourseChanges({'videos/1':true});await tick();h.database.replace({videos:{1:true}});h.lifecycle.reload();h.lifecycle.success('videos');h.window.learningDB=real;reject({code:'write/not-ready'});await tick();assert.deepEqual(h.saved(),{});assert.equal(h.database.inspect().writes.length,0);h.dispose();
});
test('UID switch stops old callbacks, queues and writes; local demo never connects',async()=>{
 const h=setup({seed:{videos:{1:false}},pending:{'videos/1':true}}),old=h.database.captureCallbacks();h.attach();await tick();h.account.unbind();h.lifecycle.start(null);for(const entry of old)entry.callback(entry.snapshot);h.account.bind('fixture-B');h.window.retryLearningSync();h.window.persistCourseChanges({'videos/1':false});await tick();assert.equal(h.database.inspect().writes.length,0);assert.equal(h.database.inspect().listeners,0);assert.equal(h.account.getItem('med_exam_pending_writes_v1'),null);h.account.bind('fixture-A');assert.equal(JSON.parse(h.account.getItem('med_exam_pending_writes_v1'))['videos/1'],true);h.dispose();
 const demo=setup();demo.window.workspaceLocalOnly=true;demo.window.persistCourseChanges({'videos/1':true});await tick();assert.equal(demo.database.inspect().writes.length,0);assert.deepEqual(demo.saved(),{});demo.dispose();
});
test('confirmed online complete/cancel intents submit once each and preserve historical XP',async()=>{
 const h=setup({seed:{videos:{1:false},gamification:{v1:{awards:{old:{xp:20,day:'2026-10-01'}}}}}});h.attach();await tick();for(const value of [true,false]){h.window.persistCourseChanges({'videos/1':value});await tick();assert.equal(h.database.inspect().tree.videos[1],value);assert.deepEqual(h.saved(),{});h.window.retryLearningSync();await tick();}assert.equal(h.database.inspect().writes.length,2);assert.deepEqual(h.database.inspect().tree.gamification.v1.awards,{old:{xp:20,day:'2026-10-01'}});h.dispose();
});
function dates(h){let id=0;return createCourseDates({keys:new Set(['videos__1']),db:h.window.learningDB,storage:h.storage,events:new EventTarget(),today:()=> '2026-10-15',newId:()=> 'fixture-date-'+(++id),lifecycle:h.lifecycle});}
test('first date waits for ready, failed write persists and ready retry succeeds without replacing remote first date',async()=>{
 const h=setup(),store=dates(h);store.set('videos__1','2026-10-15',{firstOnly:true});await tick();assert.equal(store.status('videos__1').pending,true);assert.equal(h.database.inspect().writes.length,0);h.attach();await tick();assert.equal(store.status('videos__1').pending,false);assert.equal(h.database.inspect().tree.questOS.v1.courseFirstCompletion.videos__1.day,'2026-10-15');
 h.database.connection(false);await tick();store.set('videos__1','2026-10-14');await tick();assert.equal(store.status('videos__1').pending,true);h.database.connection(true);await tick();assert.equal(store.status('videos__1').pending,false);assert.equal(store.records().videos__1.day,'2026-10-14');h.dispose();assert.equal(h.database.inspect().listeners,0);
});
test('failed date transaction retries after ready even when ready arrived during rejection',async()=>{
 const h=setup();h.attach();await tick();const real=h.window.learningDB;let reject,first=true;
 const db={ref(path){const ref=real.ref(path);return path.startsWith(COURSE_DATES_PATH+'/')?{...ref,transaction:(...args)=>{if(first){first=false;return new Promise((_,r)=>{reject=r;});}return ref.transaction(...args);}}:ref;}};
 const store=createCourseDates({keys:new Set(['videos__1']),db,storage:h.storage,events:new EventTarget(),today:()=> '2026-10-15',newId:()=> 'fixture-date',lifecycle:h.lifecycle});store.set('videos__1','2026-10-15');await tick();h.lifecycle.reload();h.lifecycle.success('videos');reject({code:'write/not-ready'});await tick();assert.equal(store.status('videos__1').pending,false);assert.equal(h.database.inspect().tree.questOS.v1.courseFirstCompletion.videos__1.day,'2026-10-15');assert.equal(h.database.inspect().writes.length,1);store.dispose();h.dispose();
});
test('date version conflicts stay pending, and logout never resolves or writes old user data',async()=>{
 const h=setup({seed:{questOS:{v1:{courseFirstCompletion:{videos__1:{day:'2026-10-12',_version:'remote'}}}}}}),store=dates(h);store.set('videos__1','2026-10-15');h.attach();await tick();assert.equal(store.status('videos__1').conflict,true);assert.equal(store.status('videos__1').pending,true);assert.equal(h.database.inspect().tree.questOS.v1.courseFirstCompletion.videos__1.day,'2026-10-12');const before=h.storage.getItem(COURSE_DATES_KEY),writes=h.database.inspect().writes.length;h.lifecycle.start(null);store.resolve('videos__1',true);store.set('videos__1',null);await store.retry();assert.equal(h.storage.getItem(COURSE_DATES_KEY),before);assert.equal(h.database.inspect().writes.length,writes);assert.equal(h.database.inspect().listeners,0);h.dispose();
});
test('synchronous reconnect marks connection before ready callbacks may write',async()=>{
 const callbacks=new Map();let connected=true,writes=0;
 const db={ref(path=''){return {on(event,callback){callbacks.set(path,callback);callback({val:()=>path==='.info/connected'?connected:{}});},off(){},async set(){writes++;}};}};
 const lifecycle=createReadiness({paths:['videos'],timeoutMs:0});lifecycle.start({displayName:'Fixture'});const facade=observeDatabase(db,lifecycle);facade.ref('videos').on('value',()=>{});assert.equal(lifecycle.read().status,'ready');
 let attempt;lifecycle.subscribe(state=>{if(state.status==='ready')attempt=facade.ref('videos/1').set(true);});connected=false;callbacks.get('.info/connected')({val:()=>false});connected=true;callbacks.get('.info/connected')({val:()=>true});await attempt;assert.equal(writes,1);lifecycle.dispose();
});
test('signout during the async auth bootstrap never appends the stale learning script',async()=>{
 const auth=readFileSync(new URL('../../auth.js',import.meta.url),'utf8');let resolve,appended=0,current=true;
 const code=auth.slice(auth.indexOf('async function startLearning('),auth.indexOf('\nfunction dialog(')).replace("await import('./sync.js')",'await barrier').replace("await import('./workspace.js')",'await Promise.resolve()');
 const context={window:{becomingStorage:{view:()=>({})},SubjectUI:{bindStorage(){}}},document:{createElement:()=>({}),getElementById:()=>({textContent:''}),body:{append(){appended++;}}},preserveRewardCache(){},barrier:new Promise(r=>{resolve=r;})};
 vm.runInNewContext('let started=false;'+code+';globalThis.bootstrap=startLearning;',context);const pending=context.bootstrap(()=>current);current=false;resolve();await pending;assert.equal(appended,0);
});
test('rapid complete/cancel while the first acknowledgement is delayed coalesces without duplicate writes',async()=>{
 const h=setup({seed:{videos:{1:false}}});h.attach();await tick();const real=h.window.learningDB;let release,first=true;
 h.window.learningDB={ref(path){const ref=real.ref(path);return path?ref:{update:patch=>{if(first){first=false;return new Promise(resolve=>{release=async()=>{await ref.update(patch);resolve();};});}return ref.update(patch);}};}};
 h.window.persistCourseChanges({'videos/1':true});h.window.persistCourseChanges({'videos/1':false});h.window.retryLearningSync();h.window.retryLearningSync();await release();await tick();assert.equal(h.database.inspect().tree.videos[1],false);assert.equal(h.database.inspect().writes.length,2);assert.deepEqual(h.saved(),{});assert.equal(h.window.learningSyncStatus('videos/1').review,false);h.dispose();
});
