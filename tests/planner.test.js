import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlanner,PLANNER_KEY,PLANNER_PATH} from '../daily-planner.js';
const copy=value=>JSON.parse(JSON.stringify(value));
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),values};};
const events=()=>({addEventListener(){}});
async function settle(...planners) {for(let i=0;i<12;i++){await new Promise(resolve=>setImmediate(resolve));if(planners.every(planner=>!planner.status().syncing))return;}throw new Error('Sync did not settle');}
function server() {
  const records={},listeners=[],writes=[];
  const get=path=>path.split('/').reduce((value,key)=>value?.[key],records)??null;
  const put=(path,value)=>{const keys=path.split('/'),last=keys.pop();let target=records;for(const key of keys)target=target[key]||={};target[last]=copy(value);};
  const notify=()=>{for(const listener of listeners)if(listener.connection.online && listener.path!=='.info/connected')queueMicrotask(()=>listener.callback({val:()=>copy(get(listener.path))}));};
  function client(prefix) {
    const connection={online:true},local=storage();let count=0;
    const db={ref:path=>({
      on(event,callback){listeners.push({path,callback,connection});queueMicrotask(()=>callback({val:()=>path==='.info/connected'?true:copy(get(path))}));},
      async once(){if(!connection.online)throw {code:'NETWORK_ERROR'};return {val:()=>copy(get(path))};},
      async transaction(updater){if(!connection.online)throw {code:'NETWORK_ERROR'};const value=updater(copy(get(path)));if(value!==undefined){put(path,value);writes.push(path);notify();}return {committed:value!==undefined,snapshot:{val:()=>copy(get(path))}};}
    })};
    const planner=createPlanner({db,storage:local,events:events(),newId:()=>prefix+(++count),today:()=> '2026-10-12',now:()=>100});
    return {planner,connection,local};
  }
  return {client,records,writes,get,put};
}
test('local planner keeps history, optional time, order and XP without changing legacy records',()=>{
  const local=storage();local.setItem('med_exam_physio_cloud','{"fc_p_3_a":true}');
  let count=0;const options={storage:local,events:events(),localOnly:true,newId:()=> 'id'+(++count),today:()=> '2026-10-12',now:()=>100};
  const planner=createPlanner(options);
  assert.equal(planner.list('2026-10-12').length,0);
  const id=planner.add({title:'心血管閱讀',links:[{path:'physiology',id:'fc_p_3_a'}]});
  const second=planner.add({title:'考古題 50 題'});
  planner.move(second,-1);assert.equal(planner.list('2026-10-12')[0].id,second);
  planner.update(id,{complete:true});planner.update(id,{complete:false});planner.update(id,{title:'再讀心血管',date:'2026-10-13',minutes:60,complete:true});
  planner.remove(id);assert.equal(Object.values(planner.awards()).reduce((sum,award)=>sum+award.xp,0),20);
  planner.update(id,{deleted:false});assert.equal(planner.list('2026-10-13')[0].id,id);
  assert.equal(planner.list('2026-10-13')[0].minutes,60);
  assert.equal(local.getItem('med_exam_physio_cloud'),'{"fc_p_3_a":true}');
  const restored=createPlanner(options);assert.equal(restored.list('2026-10-13')[0].id,id);assert.deepEqual(restored.awards(),planner.awards());
  assert.equal(local.getItem(PLANNER_KEY),null);assert.equal(planner.status().pending,0);
});
test('two devices merge different fields and retain stable task ID and one XP award',async()=>{
  const backend=server(),a=backend.client('a'),b=backend.client('b');await settle(a.planner,b.planner);
  const id=a.planner.add({title:'讀生理',minutes:60});await settle(a.planner,b.planner);
  b.connection.online=false;b.planner.update(id,{date:'2026-10-13',complete:true});await settle(b.planner);
  assert.equal(b.planner.status().pending,1);
  a.planner.update(id,{title:'生理 60 分鐘',complete:true});await settle(a.planner);
  b.connection.online=true;await b.planner.retry();await settle(a.planner,b.planner);
  assert.equal(backend.get(PLANNER_PATH+'/'+id).title,'生理 60 分鐘');assert.equal(backend.get(PLANNER_PATH+'/'+id).date,'2026-10-13');
  assert.equal(Object.values(a.planner.awards()).reduce((sum,award)=>sum+award.xp,0),20);
  assert.deepEqual(a.planner.awards(),b.planner.awards());assert.equal(b.planner.status().pending,0);
  a.planner.update(id,{complete:false});await settle(a.planner,b.planner);a.planner.update(id,{complete:true});await settle(a.planner,b.planner);
  a.planner.remove(id);await settle(a.planner,b.planner);a.planner.update(id,{deleted:false});await settle(a.planner,b.planner);
  assert.equal(Object.values(a.planner.awards()).length,1);
  assert.ok(backend.writes.every(path=>path.startsWith(PLANNER_PATH+'/')));
});
test('same-field offline conflicts preserve both choices until explicitly resolved',async()=>{
  const backend=server(),a=backend.client('a'),b=backend.client('b');await settle(a.planner,b.planner);
  const id=a.planner.add({title:'原任務'});await settle(a.planner,b.planner);
  b.connection.online=false;b.planner.update(id,{title:'本機修改'});await settle(b.planner);
  a.planner.update(id,{title:'雲端修改'});await settle(a.planner);
  b.connection.online=true;await b.planner.retry();await settle(a.planner,b.planner);
  assert.deepEqual(b.planner.status().conflicts[id],['title']);assert.equal(b.planner.list('2026-10-12')[0].title,'本機修改');assert.equal(backend.get(PLANNER_PATH+'/'+id).title,'雲端修改');
  b.planner.resolve(id,true);await settle(a.planner,b.planner);assert.equal(backend.get(PLANNER_PATH+'/'+id).title,'本機修改');
  b.connection.online=false;b.planner.update(id,{title:'另一個本機修改'});await settle(b.planner);
  a.planner.update(id,{title:'新的雲端修改'});await settle(a.planner);
  b.connection.online=true;await b.planner.retry();await settle(a.planner,b.planner);b.planner.resolve(id,false);await settle(a.planner,b.planner);
  assert.equal(b.planner.list('2026-10-12')[0].title,'新的雲端修改');assert.equal(b.planner.status().pending,0);
});
test('offline intents survive reload and deletion preserves the remote award ledger',async()=>{
  const backend=server(),a=backend.client('a');await settle(a.planner);
  const id=a.planner.add({title:'考古題'});await settle(a.planner);a.connection.online=false;a.planner.update(id,{complete:true});await settle(a.planner);
  assert.ok(JSON.parse(a.local.getItem(PLANNER_KEY)).pending[id]);
  const restored=createPlanner({storage:a.local,events:events(),db:null,newId:()=> 'restored',today:()=> '2026-10-12'});
  assert.equal(restored.list('2026-10-12')[0].complete,true);assert.equal(restored.status().pending,1);
  a.connection.online=true;await a.planner.retry();await settle(a.planner);a.planner.remove(id);await settle(a.planner);
  const remote=backend.get(PLANNER_PATH+'/'+id);assert.equal(remote.deleted,true);assert.equal(remote.award.xp,20);
});
test('invalid task input never creates a half-saved task',()=>{
  const local=storage();const planner=createPlanner({storage:local,events:events(),localOnly:true,newId:()=> 'id'});
  assert.throws(()=>planner.add({title:'',date:'2026-10-12'}));assert.throws(()=>planner.add({title:'讀書',date:'2026-02-30'}));assert.throws(()=>planner.add({title:'讀書',date:'2026-99-99'}));assert.throws(()=>planner.add({title:'讀書',minutes:1.5}));
  assert.equal(planner.list('2026-10-12').length,0);
});

test('edits during an in-flight creation are rebased and not dropped on acknowledgement',async()=>{
  const backend=server(),a=backend.client('a');await settle(a.planner);
  const id=a.planner.add({title:'最初任務'});
  a.planner.update(id,{title:'最新任務',complete:true,minutes:30});
  await settle(a.planner);
  const task=backend.get(PLANNER_PATH+'/'+id);
  assert.equal(task.title,'最新任務');assert.equal(task.minutes,30);assert.equal(task.complete,true);assert.equal(task.award.xp,20);assert.equal(a.planner.status().pending,0);
});
