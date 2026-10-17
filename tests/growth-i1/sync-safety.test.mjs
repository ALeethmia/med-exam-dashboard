import {testCoordination} from '../helpers/course-coordination.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createReadiness,observeDatabase} from '../../readiness.js';
import {createAccountStorage} from '../../account-storage.js';
import {createCourseSync,courseDocumentPath} from '../../src/study/course-sync.js';
import {createCourseDatabase,emptyCourseDocument} from '../../src/study/course-contract.js';
import {createMockDatabase} from '../fixtures/mock-database.js';
const source=readFileSync(new URL('../../sync.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,15));
function memory(){const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k),key:i=>[...values.keys()][i]??null,get length(){return values.size;}};}
class CustomEvent extends Event{constructor(name,{detail}={}){super(name);this.detail=detail;}}
function setup({pending={},localOnly=false,uid='fixture-A'}={}){
 const account=createAccountStorage(memory());account.bind(uid);const storage=account.view();storage.setItem('med_exam_pending_writes_v1',JSON.stringify(pending));
 const lifecycle=createReadiness({paths:['videos'],timeoutMs:0});lifecycle.start({displayName:'Synthetic'});const db=createMockDatabase({users:{[uid]:{learningV3:emptyCourseDocument()}}},{delay:0}),target=new EventTarget(),status={};let wrapped;
 Object.assign(target,{learningStorage:storage,becomingStorage:account,workspaceLocalOnly:localOnly,createCourseSync:options=>createCourseSync({...options,coordination:testCoordination()}),createCourseDatabase,navigator:{},acceptCourseDates:()=>true,i3Runtime:{lifecycle,read:lifecycle.read,subscribe:lifecycle.subscribe,wrap:raw=>raw?(wrapped=observeDatabase(raw,lifecycle)):null,retry:()=>wrapped?.retry()}});
 if(localOnly)target.navigator.locks={request:(name,options,fn)=>fn()};
 vm.runInNewContext(source,{window:target,document:{getElementById:()=>status},Event,CustomEvent});target.attachLearningDB(db);
 const attach=()=>wrapped?.ref('videos').on('value',snap=>target.mergeLearningSnapshot('videos',snap.val()));
 const saved=()=>storage.getItem('med_exam_pending_writes_v1');return {target,status,account,storage,lifecycle,db,attach,saved,close(){target.courseSync.close();lifecycle.dispose();}};
}
test('historical matching Boolean remains quarantined; cached equality and retry cannot acknowledge or replay it',async()=>{
 const h=setup({pending:{'videos/1':true}});try{h.attach();await tick();const before=h.saved();await h.target.resolveLearningSync('videos/1',true);await h.target.resolveLearningSync('videos/1',false);h.target.retryLearningSync();await tick();assert.equal(h.saved(),before);assert.equal(h.db.inspect().writes.length,0);assert.equal(h.target.learningSyncStatus('videos/1').legacyPending,true);}finally{h.close();}
});
test('historical intent neither overlays nor blocks a new operation on the same course',async()=>{
 const h=setup({pending:{'videos/1':false}});try{h.attach();await tick();const before=h.saved();h.target.persistCourseChanges({'videos/1':true});await h.target.courseSync.pump();assert.equal(h.target.courseSync.inspect().pending.length,0);assert.equal(h.db.inspect().tree.users['fixture-A'].learningV3.courses.videos[1],true);assert.equal(h.saved(),before);assert.equal(h.target.mergeLearningSnapshot('videos',{1:true})[1],true);assert.equal(h.db.inspect().tree.videos,undefined);}finally{h.close();}
});
test('offline new work stays queued and resumes automatically with no review choice',async()=>{
 const h=setup();try{h.attach();await tick();h.db.connection(false);await tick();h.target.persistCourseChanges({'videos/1':true,'videos/2':true});await h.target.courseSync.pump();assert.equal(h.target.courseSync.inspect().pending[0].phase,'queued');h.db.connection(true);await tick();await h.target.courseSync.pump();assert.equal(h.target.courseSync.inspect().pending.length,0);assert.deepEqual(h.db.inspect().tree.users['fixture-A'].learningV3.courses.videos,{1:true,2:true});}finally{h.close();}
});
test('UID change invalidates old writer, subscriptions and local settlements',async()=>{
 const h=setup();try{h.attach();await tick();h.account.unbind();h.lifecycle.start(null);h.account.bind('fixture-B');assert.throws(()=>h.target.persistCourseChanges({'videos/1':true}),/登入/);await h.target.courseSync.pump();assert.equal(h.db.inspect().writes.length,0);assert.equal(h.account.getItem('med_exam_course_dates_v1'),null);assert.equal(h.db.inspect().listeners,0);}finally{h.close();}
});
test('read errors remain distinct from sync evidence; retry restores only completed subscriptions',async()=>{
 const h=setup();try{h.attach();h.db.reject('PERMISSION_DENIED');await tick();assert.equal(h.lifecycle.read().status,'error');h.target.retryLearningSync();assert.equal(h.lifecycle.read().status,'error');h.target.i3Runtime.retry();await tick();assert.equal(h.lifecycle.read().status,'ready');assert.equal(h.db.inspect().writes.length,0);}finally{h.close();}
});
test('all course writes through the compatibility facade are rejected, including root multi-location writes',async()=>{
 const raw=createMockDatabase(),db=createCourseDatabase(raw,'fixture-A');for(const operation of [()=>db.ref('videos/1').set(true),()=>db.ref('physiology').transaction(()=>({a:true})),()=>db.ref().update({'videos/1':true}),()=>db.ref().update({'questOS/v1/courseFirstCompletion/a':{day:'2026-01-01'}}),()=>db.ref('questOS/v1').update({'courseFirstCompletion/a':{day:'2026-01-01'}}),()=>db.ref().transaction(()=>({videos:{1:true}})),()=>db.ref('users/fixture-A/learningV3').set({schema:3})])await assert.rejects(operation(),e=>e.code==='course-sync/legacy-writer-disabled');assert.equal(raw.inspect().writes.length,0);await db.ref('habits/day').update({sport:true});assert.equal(raw.inspect().tree.habits.day.sport,true);
});
test('without the dedicated writer course saving fails visibly rather than using a second legacy route',()=>{
 const h=setup();h.close();const target={learningStorage:h.storage,workspaceLocalOnly:true,dispatchEvent(){}};vm.runInNewContext(source,{window:target,document:{getElementById:()=>({})},Event,CustomEvent});assert.throws(()=>target.persistCourseChanges({'videos/1':true}),/尚未就緒/);
});
test('local demo persists atomically without Firebase and uses the same date contract',async()=>{
 const h=setup({localOnly:true});try{h.target.prepareCourseDates=()=>({'videos__1':'2026-10-15'});h.target.persistCourseChanges({'videos/1':true});await h.target.courseSync.pump();assert.equal(h.target.courseSync.dateRecords().videos__1.day,'2026-10-15');assert.equal(h.db.inspect().writes.length,0);assert.equal(h.target.courseSync.inspect().pending.length,0);}finally{h.close();}
});
test('signout during asynchronous module bootstrap never appends the stale learning script',async()=>{
 const auth=readFileSync(new URL('../../auth.js',import.meta.url),'utf8');let release,appended=0,current=true;
 const code=auth.slice(auth.indexOf('async function startLearning('),auth.indexOf('\nfunction dialog(')).replace("await import('./src/ui/reset-ui.js')",'await barrier').replace("await import('./src/study/life-isolation.js')",'await barrier').replace("await import('./src/study/course-contract.js')",'await barrier').replace("await import('./src/study/course-sync.js')",'await Promise.resolve()').replace("await import('./sync.js')",'await Promise.resolve()').replace("await import('./workspace.js')",'await Promise.resolve()');
 const context={window:{becomingStorage:{view:()=>({})},SubjectUI:{bindStorage(){}}},document:{createElement:()=>({}),getElementById:()=>({textContent:''}),body:{append(){appended++;}}},preserveRewardCache(){},barrier:new Promise(r=>release=r)};
 vm.runInNewContext('let started=false;'+code+';globalThis.bootstrap=startLearning;',context);const promise=context.bootstrap(()=>current);current=false;release({guardPendingReset:async()=>true,createCourseDatabase(){}});await promise;assert.equal(appended,0);
});
