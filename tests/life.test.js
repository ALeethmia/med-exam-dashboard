import test from 'node:test';
import assert from 'node:assert/strict';
import {createLifeStore,LIFE_KEY,TRAINING_PATH} from '../life-store.js';
import {createPlanner} from '../daily-planner.js';
import {dateKey,gameStats} from '../study-core.js';
import {defaultTraining,exerciseForDay,exerciseMenu,lifeSummary,trainingWeek} from '../life-core.js';
const copy=value=>JSON.parse(JSON.stringify(value));
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),values};};
const events=()=>({addEventListener(){}});
async function settle(...stores) {for(let i=0;i<30;i++){await new Promise(resolve=>setImmediate(resolve));if(stores.every(store=>!store.status().syncing))return;}throw Error('Sync did not settle');}
function backend(seed={}) {
  const records=copy(seed),listeners=[],writes=[];
  const get=path=>path.split('/').reduce((value,key)=>value?.[key],records)??null;
  const put=(path,value)=>{const keys=path.split('/'),last=keys.pop();let target=records;for(const key of keys)target=target[key]||={};target[last]=copy(value);};
  const notify=()=>{for(const l of listeners)if(l.client.online&&l.path!=='.info/connected')queueMicrotask(()=>l.callback({val:()=>copy(get(l.path))}));};
  function client(prefix,local=storage()) {
    const connection={online:true};let count=0;
    const db={ref:path=>({
      on(event,callback){listeners.push({path,callback,client:connection});queueMicrotask(()=>callback({val:()=>path==='.info/connected'?true:copy(get(path))}));},
      async once(){if(!connection.online)throw {code:'NETWORK_ERROR'};return {val:()=>copy(get(path))};},
      async transaction(updater){if(!connection.online)throw {code:'NETWORK_ERROR'};const value=updater(copy(get(path)));if(value!==undefined){put(path,value);writes.push(path);notify();}return {committed:value!==undefined,snapshot:{val:()=>copy(get(path))}};}
    })};
    const store=createLifeStore({db,storage:local,events:events(),newId:()=>prefix+(++count),today:()=> '2026-10-12'});
    return {store,connection,local,db};
  }
  return {client,records,get,put,writes};
}
function local(day='2026-10-12',saved=storage()) {
  let currentDay=day,count=0;
  const options={storage:saved,events:events(),localOnly:true,newId:()=> 'id'+(++count),today:()=>currentDay};
  return {store:createLifeStore(options),saved,options,setDay:day=>currentDay=day};
}
test('life summary reads Planner v3 directly and time targets do not complete courses',()=>{
  const h=local(),before='{"fc_p_1_a":true}';h.saved.setItem('med_exam_physio_cloud',before);
  const planner=createPlanner(h.options);const first=planner.add({title:'讀書',minutes:60});planner.add({title:'考古題'});planner.update(first,{complete:true});
  h.store.setStudyMinutes('2026-10-12',360);
  const result=lifeSummary(planner,'2026-10-12',h.store.training(),h.store.habits('2026-10-12'));
  assert.deepEqual(result.study,{category:'study',total:2,done:1,percent:50,minutes:360,plannedMinutes:60});
  assert.equal(h.saved.getItem('med_exam_physio_cloud'),before);assert.equal(result.exercise.status,'not_scheduled');
});
test('conservative menus specify names, sets, reps, instructions and avoid unsupported movements',()=>{
  const actions=exerciseMenu({type:'seated',stage:1});
  assert.deepEqual(actions.map(a=>[a.name,a.sets,a.reps]),[['坐姿踝關節活動',1,10],['坐姿膝伸直',1,8],['坐姿肩胛後收',1,8],['坐姿手肘彎曲',1,10]]);
  assert.ok(actions.every(a=>a.en&&a.instruction&&a.caution));assert.equal(actions[1].perSide,true);
  assert.equal(exerciseMenu({type:'walk',stage:1})[0].minutes,5);
  assert.equal(exerciseMenu({type:'seated',stage:3}).length,4);
  assert.equal(exerciseMenu({type:'seated',stage:3,supportedStanding:true}).length,6);
  assert.equal(exerciseMenu({type:'walk',stage:4,alternative:true,supportedStanding:true}).length,4);
  assert.equal(exerciseMenu({type:'rest'}).length,0);
});
test('actions and final result persist; cancellation, substitution and symptom rest agree with old checkbox',()=>{
  const h=local(),day='2026-10-12';h.store.schedule(day,'seated');assert.throws(()=>h.store.finish(day));
  for(const action of exerciseMenu(h.store.exercise(day)))h.store.toggleAction(day,action.id,true);
  h.store.finish(day);assert.equal(h.store.habits(day)['daily-sport'],true);
  const restored=createLifeStore(h.options);assert.equal(restored.exercise(day).status,'complete');assert.equal(restored.exercise(day).actions.knee,true);
  restored.toggleAction(day,'knee',false);assert.equal(restored.habits(day)['daily-sport'],false);
  restored.alternative(day);for(const action of exerciseMenu({...restored.exercise(day),alternative:true}))restored.toggleAction(day,action.id,true);
  restored.finish(day);assert.equal(restored.exercise(day).status,'alternative');assert.equal(restored.habits(day)['daily-sport'],true);
  restored.symptomRest(day);assert.equal(restored.exercise(day).status,'symptom_rest');assert.equal(restored.habits(day)['daily-sport'],false);
  const weekly=trainingWeek(restored.training(),day,restored.habits);assert.equal(weekly.planned,0);assert.equal(weekly.completed,0);assert.equal(weekly.rest,1);
  restored.schedule(day,'none');assert.equal(restored.exercise(day).status,'not_scheduled');assert.equal(restored.status().pending,0);
});
test('calendar never advances stages; each explicit increase needs fourteen days and confirmation',()=>{
  const h=local();h.store.start();h.setDay('2026-10-25');assert.throws(()=>h.store.advance(true));
  h.setDay('2026-10-26');assert.throws(()=>h.store.advance(false));h.store.advance(true);assert.equal(h.store.training().stage,2);
  h.setDay('2027-06-01');assert.equal(h.store.training().stage,2);assert.equal(exerciseForDay(h.store.training(),'2027-06-01').stage,2);
  h.store.setTraining({paused:true});assert.throws(()=>h.store.advance(true));assert.equal(h.store.exercise('2027-06-01').type,'rest');
  h.store.setTraining({paused:false});h.store.lower();assert.equal(h.store.training().stage,1);assert.throws(()=>h.store.advance(true));
});
test('settings change unrecorded menus only; recorded training retains its stage and dose',()=>{
  const h=local(),day='2026-10-12';h.store.start();h.store.schedule(day,'seated');h.store.toggleAction(day,'ankle',true);
  h.setDay('2026-10-26');h.store.advance(true);h.setDay('2026-11-09');h.store.advance(true);
  assert.equal(h.store.exercise(day).stage,1);assert.equal(exerciseMenu(h.store.exercise(day))[0].sets,1);
  h.store.setTraining({week:['rest','rest','rest','rest','rest','rest','rest']});assert.equal(h.store.exercise('2026-11-10').type,'rest');assert.equal(h.store.exercise(day).type,'seated');
});
test('old habits, old XP, progress and leisure remain intact without any migration write',()=>{
  const h=local();const old={'daily-sport':true,'daily-game':true,'daily-exam':true,unknown:42};h.saved.setItem('med_exam_habits_2026-10-12',JSON.stringify(old));h.saved.setItem('med_exam_gamification_v1','{"awards":{"old":{"xp":20,"day":"2026-10-12"}}}');
  const before=h.saved.getItem('med_exam_habits_2026-10-12');assert.equal(h.store.exercise().legacy,true);assert.equal(lifeSummary({list:()=>[]},'2026-10-12',h.store.training(),h.store.habits('2026-10-12')).leisure.status,'complete');
  assert.equal(h.saved.getItem('med_exam_habits_2026-10-12'),before);assert.equal(h.saved.getItem(LIFE_KEY+'_local'),null);
  h.store.symptomRest('2026-10-12');h.store.setLeisure('2026-10-12',{title:'閱讀',minutes:30,status:'complete'});
  assert.equal(h.saved.getItem('med_exam_habits_2026-10-12'),before);assert.equal(h.store.habits('2026-10-12').unknown,42);assert.equal(h.store.habits('2026-10-12')['daily-exam'],true);assert.equal(h.store.habits('2026-10-12')['daily-game'],true);
  assert.equal(gameStats(JSON.parse(h.saved.getItem('med_exam_gamification_v1')).awards).xp,20);assert.equal(h.saved.getItem(LIFE_KEY),null);
});
test('Taipei midnight separates study, exercise and leisure dates',()=>{
  const h=local(dateKey(new Date('2026-10-11T15:59:59Z')));h.store.schedule('2026-10-11','seated');h.store.setLeisure('2026-10-11',{title:'放鬆',status:'complete'});
  h.setDay(dateKey(new Date('2026-10-11T16:00:00Z')));assert.equal(h.store.exercise().status,'not_scheduled');assert.equal(h.store.habits('2026-10-12')['daily-game'],undefined);assert.equal(h.store.habits('2026-10-11')['daily-game'],true);
});
test('two devices merge separate activities and atomically mirror exercise/leisure booleans',async()=>{
  const server=backend({habits:{'2026-10-12':{'daily-exam':true,unknown:42}},physiology:{original:true},gamification:{v1:{awards:{keep:{xp:20}}}}});const a=server.client('a'),b=server.client('b');await settle(a.store,b.store);
  a.store.schedule('2026-10-12','seated');await settle(a.store,b.store);b.connection.online=false;b.store.setLeisure('2026-10-12',{title:'閱讀',status:'complete'});await settle(b.store);
  a.store.alternative('2026-10-12');for(const action of exerciseMenu({...a.store.exercise(),alternative:true}))a.store.toggleAction('2026-10-12',action.id,true);await settle(a.store);a.store.finish('2026-10-12');await settle(a.store);
  b.connection.online=true;await b.store.retry();await settle(a.store,b.store);
  const day=server.get('habits/2026-10-12');assert.equal(day['daily-sport'],true);assert.equal(day['daily-game'],true);assert.equal(day.questOS_v1.exercise.status,'alternative');assert.equal(day.questOS_v1.leisure.title,'閱讀');assert.equal(day.unknown,42);assert.equal(day['daily-exam'],true);
  assert.deepEqual(a.store.habits('2026-10-12'),b.store.habits('2026-10-12'));assert.equal(server.get('physiology/original'),true);assert.equal(server.get('gamification/v1/awards/keep/xp'),20);assert.ok(server.writes.every(p=>p.startsWith('habits/')));
});
test('same-activity offline conflict never overwrites another device before user resolves it',async()=>{
  const server=backend(),a=server.client('a'),b=server.client('b');await settle(a.store,b.store);a.store.schedule('2026-10-12','seated');await settle(a.store,b.store);
  b.connection.online=false;b.store.alternative('2026-10-12');await settle(b.store);a.store.symptomRest('2026-10-12');await settle(a.store);
  b.connection.online=true;await b.store.retry();await settle(a.store,b.store);assert.equal(b.store.status().conflicts['2026-10-12:exercise'],true);assert.equal(server.get('habits/2026-10-12/questOS_v1/exercise/status'),'symptom_rest');
  b.store.resolve('2026-10-12:exercise',false);await settle(a.store,b.store);assert.equal(b.store.exercise().status,'symptom_rest');assert.equal(b.store.status().pending,0);
  b.connection.online=false;b.store.schedule('2026-10-12','walk');await settle(b.store);a.store.schedule('2026-10-12','rest');await settle(a.store);b.connection.online=true;await b.store.retry();await settle(a.store,b.store);b.store.resolve('2026-10-12:exercise',true);await settle(a.store,b.store);assert.equal(a.store.exercise().type,'walk');
});
test('offline reload, reconnection and in-flight edits preserve final choices',async()=>{
  const server=backend(),a=server.client('a');await settle(a.store);a.connection.online=false;a.store.symptomRest('2026-10-12');await settle(a.store);assert.equal(a.store.status().pending,1);
  const restored=createLifeStore({storage:a.local,events:events(),db:null});assert.equal(restored.exercise('2026-10-12').status,'symptom_rest');assert.equal(restored.status().pending,1);
  a.connection.online=true;await a.store.retry();await settle(a.store);assert.equal(server.get('habits/2026-10-12/questOS_v1/exercise/status'),'symptom_rest');
  a.store.setLeisure('2026-10-12',{title:'遊戲',status:'pending'});a.store.setLeisure('2026-10-12',{title:'放鬆',status:'complete'});await settle(a.store);assert.equal(server.get('habits/2026-10-12/questOS_v1/leisure/title'),'放鬆');assert.equal(server.get('habits/2026-10-12/daily-game'),true);assert.equal(a.store.status().pending,0);
});
test('training configuration has explicit cross-device conflict resolution',async()=>{
  const server=backend(),a=server.client('a'),b=server.client('b');await settle(a.store,b.store);a.store.start();await settle(a.store,b.store);
  b.connection.online=false;b.store.setTraining({paused:true});await settle(b.store);a.store.setTraining({week:['rest','rest','seated','rest','rest','rest','rest']});await settle(a.store);b.connection.online=true;await b.store.retry();await settle(a.store,b.store);assert.ok(b.store.status().conflicts.training);b.store.resolve('training',false);await settle(a.store,b.store);assert.equal(b.store.training().paused,false);assert.equal(b.store.training().week[0],'rest');assert.ok(server.writes.includes(TRAINING_PATH));
});
test('invalid inputs leave records and queues unchanged',()=>{
  const h=local();for(const action of [()=>h.store.schedule('2026-02-30','seated'),()=>h.store.setLeisure('2026-10-12',{title:'閱讀',minutes:0}),()=>h.store.setStudyMinutes('2026-10-12',1441),()=>h.store.setTraining({week:['walk']}),()=>h.store.setExercise('2026-10-12',{stage:9})])assert.throws(action);
  assert.equal(h.saved.getItem(LIFE_KEY+'_local'),null);
});

test('paused training retains stored actions but cannot be completed until explicitly resumed',()=>{
  const h=local(),day='2026-10-12';h.store.schedule(day,'seated');for(const action of exerciseMenu(h.store.exercise(day)))h.store.toggleAction(day,action.id,true);
  h.store.setTraining({paused:true});assert.throws(()=>h.store.finish(day));assert.throws(()=>h.store.toggleAction(day,'ankle',false));assert.equal(h.store.exercise(day).actions.ankle,true);
  h.store.setTraining({paused:false});h.store.finish(day);assert.equal(h.store.exercise(day).status,'complete');
});
