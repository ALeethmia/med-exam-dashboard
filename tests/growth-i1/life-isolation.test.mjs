import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountStorage} from '../../account-storage.js';
import {LIFE_PATHS,createLifeDatabase,createLifeStorage,openLifeSession,validateLifeControl} from '../../src/study/life-isolation.js';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),key:i=>[...m.keys()][i]??null,get length(){return m.size;},values:m};};
const fixtures=()=>{const raw=memory(),account=createAccountStorage(raw);account.bind('A');return {raw,account,base:account.view()};};
test('generation storage never adopts old UID caches/pending; both UID and generation events stay isolated',()=>{
 const {raw,account,base}=fixtures();base.setItem('med_exam_pending_writes_v1','legacy');base.setItem('med_exam_course_dates_v1','course');
 const a=createLifeStorage(base,'g1');a.setItem('med_exam_daily_planner_v3','old-pending');a.setItem('med_exam_habits_2026-10-16','old-day');
 const b=createLifeStorage(base,'g2');assert.equal(b.getItem('med_exam_daily_planner_v3'),null);assert.equal(b.getItem('med_exam_pending_writes_v1'),null);assert.equal(b.getItem('med_exam_course_dates_v1'),'course');
 assert.equal(b.eventKey('life_v1:g1:med_exam_daily_planner_v3'),null);assert.equal(b.eventKey('med_exam_pending_writes_v1'),null);assert.equal(b.eventKey('life_v1:g2:med_exam_daily_planner_v3'),'med_exam_daily_planner_v3');
 assert(!b.keys().some(k=>k.includes('life_v1:')));assert.equal(a.getItem('med_exam_daily_planner_v3'),'old-pending');
 account.bind('B');assert.equal(createLifeStorage(account.view(),'g1').getItem('med_exam_daily_planner_v3'),null);assert(raw.values.size>=4);
});
test('all seven wire paths map exactly; ancestor/mixed writes cannot escape; stale updater and late ACK are fenced',async()=>{
 const writes=[];let current=true,release,updater;
 const raw={ref(path=''){return {on(){},off(){},once:async()=>({val:()=>null}),set:async value=>writes.push({path,value}),update:async value=>writes.push({path,value}),transaction(fn){updater=fn;return new Promise(r=>release=r);}};}};
 const db=createLifeDatabase(raw,'A','g1',()=>current);
 for(const [path,bucket] of Object.entries(LIFE_PATHS)){await db.ref(path+'/x').set(true);assert.equal(writes.at(-1).path,'users/A/lifeV1/g1/'+bucket+'/x');}
 await db.ref().update({'habits/x':true,'checklist/a':false});assert.deepEqual(Object.keys(writes.at(-1).value),['users/A/lifeV1/g1/habits/x','users/A/lifeV1/g1/checklist/a']);
 const count=writes.length;await assert.rejects(db.ref().update({'habits/a':true,'users/B/lifeV1/g1/habits/x':true}));await assert.rejects(db.ref('questOS').set({}));assert.throws(()=>db.ref('users/A/lifeV1/g2/habits'));
 assert.equal(writes.length,count);const promise=db.ref('habits/day').transaction(x=>({x}));current=false;assert.equal(updater(null),undefined);release({committed:true,snapshot:{val:()=>({x:1})}});await assert.rejects(promise,/no longer/);
 await assert.rejects(db.ref('checklist/a').set(true));
});
test('control is required, immutable within a session; storage failure blocks writes and is never reported as success',async()=>{
 for(const value of [null,{}, {schema:1,generation:'../bad',era:0},{schema:1,generation:'g',era:-1}])assert.throws(()=>validateLifeControl(value));
 const {base}=fixtures();let listener,retired=0,failed=0;
 const database={ref(){return {on(e,fn){listener=fn;},off(){}};}};
 const promise=openLifeSession({database,uid:'A',storage:base,onRetire:()=>retired++,onStorageFailure:()=>failed++});
 listener({val:()=>({schema:1,generation:'g1',era:0})});const session=await promise;
 listener({val:()=>({schema:1,generation:'g2',era:1})});assert.equal(retired,1);assert.equal(session.valid(),false);assert.throws(()=>session.storage.setItem('med_exam_life_v1','bad'));
 const quota={...base,setItem(){throw Error('quota');}};let quotaListener;
 const next=openLifeSession({database:{ref(){return {on(e,fn){quotaListener=fn;},off(){}};}},uid:'A',storage:quota,onStorageFailure:()=>failed++});
 quotaListener({val:()=>({schema:1,generation:'g2',era:1})});const q=await next;assert.throws(()=>q.storage.setItem('med_exam_daily_planner_v3','not-saved'),/quota/);assert.equal(failed,1);assert.equal(q.valid(),false);assert.equal(base.getItem('life_v1:g2:med_exam_daily_planner_v3'),null);
});
