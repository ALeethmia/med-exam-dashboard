import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {dateKey, weekKey, selectTasks, subjectStats, gameStats, flattenSubjects} from '../study-core.js';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const names={physio:'physioChaptersData', anatomy:'anatomyLessonsData', biochem:'biochemData', pharm:'pharmacologyData', weeks:'weeksData'};
const data=Object.fromEntries(Object.entries(names).map(([key,name])=>{
  const source=html.match(new RegExp('const '+name+' = (\\[.*?\\n    \\]);','s'))[1];
  return [key,JSON.parse(JSON.stringify(vm.runInNewContext('('+source+')')))];
}));
test('all original course and week data are unchanged',()=>{
  const hashes=JSON.parse(readFileSync(new URL('./data-hashes.json',import.meta.url),'utf8'));
  for(const [key,name] of Object.entries(names)) assert.equal(createHash('sha256').update(JSON.stringify(data[key])).digest('hex'),hashes[name]);
  assert.equal(flattenSubjects(data).length,115);
});
test('Taipei date boundaries and Monday week boundaries',()=>{
  assert.equal(dateKey(new Date('2026-10-11T15:59:59Z')),'2026-10-11');
  assert.equal(dateKey(new Date('2026-10-11T16:00:00Z')),'2026-10-12');
  assert.equal(weekKey('2026-10-11'),'2026-10-05');
  assert.equal(weekKey('2026-10-12'),'2026-10-12');
});
test('daily tasks prefer current week, exclude completed IDs, and do not mutate states',()=>{
  const items=flattenSubjects(data), states={physiology:{fc_p_5_a:true}};
  const before=JSON.stringify(states);
  const tasks=selectTasks(items,states,data.weeks,'2026-10-11');
  assert.equal(tasks.length,3); assert.ok(tasks.every(t=>t.week==='W2'));
  assert.ok(tasks.every(t=>t.id!=='fc_p_5_a')); assert.equal(JSON.stringify(states),before);
  const full={}; for(const t of items) (full[t.path] ||= {})[t.id]=true;
  assert.deepEqual(selectTasks(items,full,data.weeks,'2026-10-11'),[]);
});
test('subject progress retains count and duration semantics',()=>{
  const stats=subjectStats(data,{videos:{1:true},biochem:{1:true},physiology:{fc_p_1_a:true},pharmacology:{}});
  assert.equal(stats[0].total,39);assert.equal(stats[0].percent,3);
  assert.equal(stats[1].percent,Math.round(data.anatomy[0].lectures[0].durationSec/214511*100));
  assert.equal(stats[2].percent,13);assert.equal(stats[3].total,38);
});
test('weekly trend reads the same numeric biochemistry IDs as checkboxes',()=>{
  const source=html.match(/function getWeekTaskCompletion\(wNum\) \{[\s\S]*?\n    \}/)[0];
  const localStorage={getItem:key=>JSON.stringify(key==='med_exam_biochem_cloud'?{1:true}:{})};
  const result=vm.runInNewContext(source+'; getWeekTaskCompletion(6)',{localStorage,anatomyLessonsData:data.anatomy});
  assert.equal(result,Math.round(1/7*100));
});
test('XP, levels, weekly challenge and achievements derive from award events',()=>{
  const awards=Object.fromEntries(Array.from({length:10},(_,i)=>['id'+i,{xp:20,day:'2026-10-11'}]));
  let stats=gameStats(awards,'2026-10-11');assert.equal(stats.xp,200);assert.equal(stats.level,3);assert.equal(stats.weekly,10);assert.ok(stats.achievements.every(a=>a.unlocked));
  stats=gameStats(awards,'2026-10-12');assert.equal(stats.weekly,0);assert.equal(stats.xp,200);
});
function syncHarness(fail=false) {
  const store=new Map();const listeners={};const writes=[];
  const el={};
  const window={workspaceLocalOnly:false,dispatchEvent(){}};
  const context={window,document:{getElementById:()=>el},localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},CustomEvent:class{},Event:class{}};
  vm.runInNewContext(readFileSync(new URL('../sync.js',import.meta.url),'utf8'),context);
  window.attachLearningDB({ref:path=>({on:(e,cb)=>listeners[path]=cb,update:async values=>{writes.push(JSON.parse(JSON.stringify(values)));if(fail)throw new Error('denied');}})});
  return {window,store,listeners,writes,el};
}
test('single edits preserve unrelated database fields and pending snapshots',async()=>{
  const h=syncHarness();h.window.persistProgress('videos',{1:true,2:true},[1]);
  assert.deepEqual(JSON.parse(JSON.stringify(h.window.mergeLearningSnapshot('videos',{3:true}))),{1:true,3:true});
  h.listeners['.info/connected']({val:()=>true}); await new Promise(r=>setImmediate(r));
  assert.deepEqual(h.writes,[{'videos/1':true}]);assert.deepEqual(JSON.parse(h.store.get('med_exam_pending_writes_v1')),{});
});
test('denied writes stay queued and empty snapshots do not erase pending edits',async()=>{
  const h=syncHarness(true);h.listeners['.info/connected']({val:()=>true});h.window.persistProgress('physiology',{fc_p_1_a:true},['fc_p_1_a']);
  await new Promise(r=>setImmediate(r));
  assert.match(h.el.textContent,/同步失敗/);assert.equal(JSON.parse(h.store.get('med_exam_pending_writes_v1'))['physiology/fc_p_1_a'],true);
  assert.equal(h.window.mergeLearningSnapshot('physiology',null).fc_p_1_a,true);
});
test('local mode never queues or sends Firebase learning writes',async()=>{
  const h=syncHarness();h.window.workspaceLocalOnly=true;h.listeners['.info/connected']({val:()=>true});h.window.persistProgress('videos',{1:true},[1]);
  await new Promise(r=>setImmediate(r));assert.equal(h.writes.length,0);assert.equal(h.el.textContent,'本機模式');
});

test('time goals keep denied writes for retry and preserve awarded XP when unchecked',async()=>{
  const {createTimeTasks}=await import('../time-tasks.js');
  const previousWindow=globalThis.window,previousStorage=globalThis.localStorage;
  const store=new Map();let denied=true,remote={unrelated:'keep'},writes=0;
  globalThis.window={addEventListener(){}};
  globalThis.localStorage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)};
  try {
    const db={ref:()=>({on(){},transaction:async updater=>{writes++;if(denied)throw new Error('denied');remote=updater(remote);return {snapshot:{val:()=>remote}};}})};
    const tasks=createTimeTasks({db,localOnly:false,day:'2026-10-11',onChange(){}});
    tasks.set('morning',true);await new Promise(resolve=>setImmediate(resolve));
    assert.equal(tasks.failed(),true);assert.equal(Object.keys(JSON.parse(store.get('med_exam_time_tasks_v1')).pending).length,1);
    denied=false;await tasks.retry();assert.equal(remote.unrelated,'keep');assert.equal(remote.awarded,true);
    tasks.set('morning',false);await new Promise(resolve=>setImmediate(resolve));
    tasks.set('morning',true);await new Promise(resolve=>setImmediate(resolve));
    assert.equal(Object.values(tasks.awards()).reduce((n,a)=>n+a.xp,0),20);
    assert.equal(Object.keys(JSON.parse(store.get('med_exam_time_tasks_v1')).pending).length,0);
    assert.ok(writes>=3);
  } finally {globalThis.window=previousWindow;globalThis.localStorage=previousStorage;}
});
