import test from 'node:test';
import assert from 'node:assert/strict';
import {growthSnapshot} from '../growth-core.js';
import {subjectStats} from '../study-core.js';
import {createPlanner} from '../daily-planner.js';
import {memoryStorage,mockEvents} from './helpers/planning-mock.js';
const data={physio:[{sections:[{id:'p'}]}],anatomy:[{lectures:[{id:1,durationSec:60},{id:2,durationSec:180}]}],biochem:[{id:1}],pharm:[{lectures:[{id:1,durationSec:120}]}]};
const input={data,states:{videos:{1:true}},tasks:[],awards:{},day:'2026-10-14',getHabits:()=>({}),training:{paused:false}};
const task=(id,extra={})=>({id,date:'2026-10-12',complete:true,deleted:false,...extra});
test('weekly task status counts IDs once, by schedule date, separately from historical awards',()=>{
 const tasks=[task('a'),task('a'),task('cancel',{complete:false,award:{xp:20,day:'2026-10-12'}}),task('deleted',{deleted:true}),task('waiting',{planning:{waiting:true}}),task('other',{date:'2026-10-11'})],awards={historic:{xp:20,day:'2026-10-12'},outside:{xp:20,day:'2026-10-11'}};
 const s=growthSnapshot({...input,tasks,awards});assert.equal(s.tasks.done,1);assert.equal(s.tasks.total,2);assert.equal(s.tasks.dateBasis,'scheduled');assert.equal(s.historical.weekly,1);assert.equal(s.historical.total,2);
});
test('cancel, redo, delete and restore change current status without creating historical reward events',()=>{
 const storage=memoryStorage();let id=0;const planner=createPlanner({storage,events:mockEvents(),localOnly:true,newId:()=>String(++id),today:()=>input.day});const key=planner.add({title:'reading',date:'2026-10-13'});const read=()=>growthSnapshot({...input,tasks:planner.all(),awards:planner.awards()});planner.update(key,{complete:true});assert.equal(read().tasks.done,1);assert.equal(read().historical.total,1);planner.update(key,{complete:false});assert.equal(read().tasks.done,0);assert.equal(read().historical.total,1);planner.update(key,{complete:true});planner.remove(key);assert.equal(read().tasks.done,0);planner.update(key,{deleted:false});assert.equal(read().tasks.done,1);assert.equal(read().historical.total,1);planner.update(key,{date:'2026-10-19'});assert.equal(read().tasks.done,0);assert.equal(read().historical.weekly,1);
});
test('course percentages keep original subject weighting while overall counts units',()=>{
 const s=growthSnapshot(input);assert.deepEqual(s.subjects,subjectStats(data,input.states));assert.equal(s.subjects[1].percent,25);assert.equal(s.courses.done,1);assert.equal(s.courses.total,5);assert.equal(s.courses.percent,20);
});
test('exercise uses only dated evidence and does not infer historical rest or pause from current settings',()=>{
 const days={'2026-10-12':{'daily-sport':true},'2026-10-13':{questOS_v1:{exercise:{type:'walk',status:'alternative'}}},'2026-10-14':{questOS_v1:{exercise:{type:'rest',status:'not_scheduled'}}},'2026-10-15':{questOS_v1:{exercise:{type:'walk',status:'symptom_rest'}}},'2026-10-16':{questOS_v1:{exercise:{type:'none',status:'not_scheduled'}}},'2026-10-17':{questOS_v1:{exercise:{type:'walk',status:'pending'}}}};
 const before=JSON.stringify(days),s=growthSnapshot({...input,day:'2026-10-18',getHabits:day=>days[day]||{},training:{paused:true}});assert.deepEqual(s.exercise,{complete:1,alternative:1,rest:1,symptomRest:1,unplanned:1,pending:1,unrecorded:1,legacy:1,recorded:6});assert.equal(s.paused,true);assert.equal(JSON.stringify(days),before);
 const empty=growthSnapshot({...input,training:{paused:true}});assert.equal(empty.exercise.recorded,0);assert.equal(empty.exercise.rest,0);assert.equal(empty.exercise.unrecorded,3);
});
test('future exercise records are excluded and reading growth is pure',()=>{
 const value={...input,tasks:[task('a')],awards:{a:{xp:20,day:'2026-10-12'}}},before=JSON.stringify(value);const result=growthSnapshot({...value,getHabits:day=>day==='2026-10-15'?{'daily-sport':true}:{}});assert.equal(result.exercise.complete,0);assert.equal(JSON.stringify(value),before);
});
