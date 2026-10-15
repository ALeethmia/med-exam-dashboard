import test from 'node:test';
import assert from 'node:assert/strict';
import {buildingProgressSnapshot,realmEvidenceSnapshot,realmActivitySnapshot,realmActivityGroups,COURSE_THRESHOLDS,territoryMilestoneSnapshot} from '../src/kingdom/territory-core.js';
import {createLifeStore} from '../life-store.js';
import {memoryStorage,mockEvents,planningBackend,settle} from './helpers/planning-mock.js';
const data={physio:[{sections:Array.from({length:100},(_,i)=>({id:'p'+i,title:'單元'+i}))}],anatomy:[],biochem:[],pharm:[]};
const empty={data,states:{},habits:{},courseDates:{},day:'2026-10-12'};
const state=n=>({physiology:Object.fromEntries(Array.from({length:n},(_,i)=>['p'+i,true]))});
const days=(n,status='complete')=>Object.fromEntries(Array.from({length:n},(_,i)=>['2026-09-'+String(i+1).padStart(2,'0'),{questOS_v1:{exercise:{type:'walk',status}}}]));
test('academy thresholds use current exact unit counts and cancellations update stages',()=>{
 for(const [threshold,stage] of [[5,2],[20,3],[50,4],[85,5]]){assert.equal(buildingProgressSnapshot({...empty,states:state(threshold-1)}).academy.stage,stage-1);assert.equal(buildingProgressSnapshot({...empty,states:state(threshold)}).academy.stage,stage);}
 const current=state(50);current.physiology.p49=false;assert.equal(buildingProgressSnapshot({...empty,states:current}).academy.stage,3);
 const actual={...data,physio:[{sections:Array.from({length:115},(_,i)=>({id:'p'+i,title:'unit'}))}]};const s=buildingProgressSnapshot({...empty,data:actual,states:state(57)});assert.equal(s.evidence.courses.percent,50);assert.equal(s.academy.stage,3);assert.ok(s.academy.next[0].includes('尚差 1 單元'));
});
test('no data, no exercise and old XP never create course progress or false stages',()=>{
 const s=buildingProgressSnapshot({...empty,data:{physio:[],anatomy:[],biochem:[],pharm:[]},awards:{p:{xp:99999,day:'2026-10-12'}},tasks:[{complete:true}]});assert.equal(s.academy.stage,1);assert.equal(s.barracks.stage,1);assert.equal(s.keep.stage,1);assert.deepEqual(realmActivitySnapshot(s),[]);
});
test('barracks boundaries count normal and alternative records, never rest, plan or double legacy projection',()=>{
 for(const [n,stage] of [[3,2],[8,3],[16,4],[30,5]]){assert.equal(buildingProgressSnapshot({...empty,habits:days(n-1)}).barracks.stage,stage-1);assert.equal(buildingProgressSnapshot({...empty,habits:days(n,'alternative')}).barracks.stage,stage);}
 const habits={'2026-10-01':{'daily-sport':true},'2026-10-02':{'daily-sport':true,questOS_v1:{exercise:{status:'complete'}}},'2026-10-03':{questOS_v1:{exercise:{status:'alternative'}}},...Object.fromEntries(['symptom_rest','not_scheduled','pending'].map((status,i)=>['2026-10-0'+(i+4),{'daily-sport':true,questOS_v1:{exercise:{status}}}])),'2026-10-07':{questOS_v1:{exercise:{type:'rest',status:'not_scheduled'}}},'2026-10-13':{questOS_v1:{exercise:{status:'complete'}}},'2026-10-08':{questOS_v1:{exercise:{type:'rest',status:'complete'}}},'2026-10-09':{questOS_v1:{exercise:{type:'none',status:'alternative'}}},'bad-date':{'daily-sport':true}};
 const e=realmEvidenceSnapshot({...empty,habits,training:{week:Array(7).fill('strength_a'),stage:4}});assert.equal(e.training,3);assert.equal(e.legacyTraining,1);assert.equal(e.ambiguousTraining,2);assert.equal(e.events.length,3);
});
test('keep supports study-only or cross-domain alternatives without daily triple completion or streaks',()=>{
 for(const [done,stage] of [[5,2],[20,3],[50,4],[85,5]])assert.equal(buildingProgressSnapshot({...empty,states:state(done)}).keep.stage,stage);
 for(const [done,n,stage] of [[0,3,2],[5,8,3],[20,16,4],[50,30,5]]){const habits=Object.fromEntries(Object.keys(days(n)).map(date=>[date,{questOS_v1:{leisure:{title:'閱讀',status:'complete'}}}]));assert.equal(buildingProgressSnapshot({...empty,states:state(done),habits}).keep.stage,stage);}
 const sameDay={'2026-10-01':{questOS_v1:{exercise:{status:'complete'},leisure:{status:'complete'}}}};assert.equal(buildingProgressSnapshot({...empty,habits:sameDay}).evidence.activityDays,1);
});
test('events only use explicit course dates; invalid, future, removed and legacy award dates never become completion dates',()=>{
 const input={...empty,states:state(4),courseDates:{physiology__p0:{day:'2026-10-11'},physiology__p1:{day:null},physiology__p2:{day:'2026-02-30'},physiology__p3:{day:'2026-10-13'},orphan:{day:'2026-10-10'}},awards:{physiology__p1:{xp:20,day:'2026-10-12'}}};const e=realmEvidenceSnapshot(input);assert.equal(e.events.filter(event=>event.date).length,1);assert.equal(e.events.filter(event=>!event.date).length,3);assert.equal(e.events.find(event=>event.id==='course:physiology__p1').date,null);
 input.states.physiology.p0=false;assert.equal(realmEvidenceSnapshot(input).events.find(event=>event.id==='course:physiology__p0').detail.includes('未勾選'),true);
 const duplicate={...data,physio:[{sections:[{id:'p0',title:'p0'},{id:'p0',title:'p0'}]}]};assert.equal(realmEvidenceSnapshot({...input,data:duplicate}).events.length,1);
});
test('current milestones never fabricate permanent unlock dates, events are pure and stable on repeated snapshots',()=>{
 const input={...empty,states:state(20),habits:days(8)},before=JSON.stringify(input),s=buildingProgressSnapshot(input),events=realmActivitySnapshot(s);assert.equal(new Set(events.map(e=>e.id)).size,events.length);assert.ok(territoryMilestoneSnapshot(s).every(event=>event.date===null&&event.source.includes('無歷史')));assert.deepEqual(realmActivitySnapshot(buildingProgressSnapshot(input)),events);assert.equal(JSON.stringify(input),before);
});
test('readonly recorded habits include old date keys without creating historical plans or storage writes',()=>{
 const memory=memoryStorage();memory.setItem('med_exam_habits_2026-10-01',JSON.stringify({'daily-sport':true}));const storage={getItem:memory.getItem,setItem:memory.setItem,get length(){return memory.values.size;},key:index=>[...memory.values.keys()][index]};const store=createLifeStore({storage,events:mockEvents(),localOnly:true,today:()=>empty.day});const before=[...memory.values];assert.equal(buildingProgressSnapshot({...empty,habits:store.recordedHabits()}).evidence.training,1);assert.deepEqual([...memory.values],before);assert.equal(store.recordedHabits()['2026-10-02'],undefined);
});
test('remote repeated snapshots and offline reconnect retain one date per exercise without kingdom writes',async()=>{
 const backend=planningBackend({habits:days(3)}),client=backend.client(),store=createLifeStore({db:client.db,storage:memoryStorage(),events:mockEvents(),today:()=>empty.day});await settle(store);const read=()=>buildingProgressSnapshot({...empty,habits:store.recordedHabits()});assert.equal(read().evidence.training,3);backend.notify();backend.notify();await settle(store);assert.equal(read().evidence.training,3);client.connection.online=false;backend.put('habits/2026-10-01',{'daily-sport':true});backend.notify();await settle(store);client.connection.online=true;backend.notify();await settle(store);assert.equal(new Set(realmActivitySnapshot(read()).map(e=>e.id)).size,realmActivitySnapshot(read()).length);assert.deepEqual(backend.writes,[]);
});

test('keep reports study-only, cross-only and both attained routes for the current stage',()=>{
 const study=buildingProgressSnapshot({...empty,states:state(20)}).keep;
 assert.deepEqual(study.metRoutes,['study']);assert.equal(study.currentPaths[1].met,false);assert.equal(study.currentPaths[1].progress,0);
 const cross=buildingProgressSnapshot({...empty,states:state(5),habits:days(8)}).keep;
 assert.equal(cross.stage,3);assert.deepEqual(cross.metRoutes,['cross']);assert.equal(cross.currentPaths[0].progress,25);assert.equal(cross.currentPaths[0].requirements[0].gap,15);
 const both=buildingProgressSnapshot({...empty,states:state(20),habits:days(8)}).keep;
 assert.deepEqual(both.metRoutes,['study','cross']);assert.ok(both.reason.includes('純學習路徑、跨領域路徑'));
 assert.deepEqual(buildingProgressSnapshot(empty).keep.currentPaths,[]);
});
test('independent next-route progress exposes the limiting requirement and exact rounded-up gaps',()=>{
 const actual={...data,physio:[{sections:Array.from({length:115},(_,i)=>({id:'p'+i,title:'unit'}))}]};
 const k=buildingProgressSnapshot({...empty,data:actual,states:state(6),habits:days(3)}).keep;
 const [study,cross]=k.nextPaths;
 assert.equal(study.requirements[0].required,23);assert.equal(study.requirements[0].actual,6);assert.equal(study.requirements[0].gap,17);assert.equal(study.progress,6/23*100);
 assert.equal(cross.requirements[0].required,6);assert.equal(cross.requirements[0].gap,0);assert.equal(cross.requirements[1].gap,5);assert.equal(cross.progress,37.5);assert.equal(cross.met,false);
 const insufficient=buildingProgressSnapshot({...empty,states:state(4),habits:days(8)}).keep;
 assert.equal(insufficient.nextPaths[1].progress,80);assert.equal(insufficient.nextPaths[1].met,false);
 const noCourses=buildingProgressSnapshot({...empty,data:{physio:[],anatomy:[],biochem:[],pharm:[]},habits:days(8)}).keep;
 assert.equal(noCourses.stage,2);assert.equal(noCourses.nextPaths[0].progress,0);assert.equal(noCourses.nextPaths[0].requirements[0].available,false);assert.equal(noCourses.nextPaths[1].progress,0);
});
test('highest keep stage does not claim the other route attained and still exposes its gaps',()=>{
 const study=buildingProgressSnapshot({...empty,states:state(85)}).keep;
 assert.equal(study.stage,5);assert.deepEqual(study.nextPaths,[]);assert.deepEqual(study.metRoutes,['study']);assert.equal(study.currentPaths[1].requirements[1].gap,30);assert.equal(study.currentPaths[1].progress,0);
 const cross=buildingProgressSnapshot({...empty,states:state(50),habits:days(30)}).keep;
 assert.equal(cross.stage,5);assert.deepEqual(cross.metRoutes,['cross']);assert.equal(cross.currentPaths[0].requirements[0].gap,35);
});
test('all unchanged keep boundaries retain both OR paths and cross-path AND requirements',()=>{
 for(const [course,activity,stage] of [[5,3,2],[20,8,3],[50,16,4],[85,30,5]]){
  assert.equal(buildingProgressSnapshot({...empty,states:state(course-1)}).keep.stage,stage-1);
  assert.equal(buildingProgressSnapshot({...empty,states:state(course)}).keep.stage,stage);
  const crossCourse=stage===2?0:COURSE_THRESHOLDS[stage-2];
  assert.equal(buildingProgressSnapshot({...empty,states:state(crossCourse),habits:days(activity-1)}).keep.stage,stage-1);
  assert.equal(buildingProgressSnapshot({...empty,states:state(crossCourse),habits:days(activity)}).keep.stage,stage);
  if(stage>2)assert.equal(buildingProgressSnapshot({...empty,states:state(crossCourse-1),habits:days(activity)}).keep.stage,stage-1);
 }
});
test('dated history, undated current achievements and milestones remain separate and stable',()=>{
 const input={...empty,states:state(20),courseDates:{physiology__p0:{day:'2026-10-10'},physiology__p1:{day:null},physiology__p2:{day:'2026-02-30'},physiology__p3:{day:'2026-10-13'}},habits:days(3)},before=JSON.stringify(input);
 const buildings=buildingProgressSnapshot(input),groups=realmActivityGroups(buildings);
 assert.ok(groups.dated.every(e=>e.date&&!e.id.startsWith('milestone:')));assert.ok(groups.undated.every(e=>e.date===null&&e.id.startsWith('course:')));assert.ok(groups.milestones.every(e=>e.date===null&&e.id.startsWith('milestone:')));
 assert.equal(groups.dated[0].id,'course:physiology__p0');assert.equal(groups.undated.length,19);assert.equal(groups.milestones.length,3);
 const all=Object.values(groups).flat();assert.equal(all.length,realmActivitySnapshot(buildings).length);assert.equal(new Set(all.map(e=>e.id)).size,all.length);assert.deepEqual(realmActivityGroups(buildingProgressSnapshot(input)),groups);assert.equal(JSON.stringify(input),before);
 input.states.physiology.p0=false;assert.ok(realmActivityGroups(buildingProgressSnapshot(input)).dated.find(e=>e.id==='course:physiology__p0').detail.includes('未勾選'));
 input.courseDates.physiology__p0.day=null;assert.ok(!Object.values(realmActivityGroups(buildingProgressSnapshot(input))).flat().some(e=>e.id==='course:physiology__p0'));
 assert.deepEqual(realmActivityGroups(buildingProgressSnapshot(empty)),{dated:[],undated:[],milestones:[]});
});
