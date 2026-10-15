import test from 'node:test';
import assert from 'node:assert/strict';
import {createLifeStore,LIFE_KEY,TRAINING_PATH} from '../life-store.js';
import {createPlanner} from '../daily-planner.js';
import {dateKey,gameStats} from '../src/study/study-core.js';
import {defaultTraining,exerciseForDay,exerciseMenu,lifeSummary,trainingWeek,STAGES,RECOMMENDED_WEEK,menuConfig,stageExercise} from '../src/study/life-core.js';
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
  assert.equal(exerciseMenu({type:'seated',stage:3}).length,5);
  assert.equal(exerciseMenu({type:'seated',stage:3,supportedStanding:true}).length,5);
  assert.equal(exerciseMenu({type:'walk',stage:4,alternative:true,supportedStanding:true}).length,4);
  assert.equal(exerciseMenu({type:'rest'}).length,0);
});
test('actions and final result persist; cancellation, substitution and symptom rest agree with old checkbox',()=>{
  const h=local(),day='2026-10-12';h.store.schedule(day,'seated');assert.throws(()=>h.store.finish(day));
  for(const action of exerciseMenu(h.store.exercise(day)))h.store.toggleAction(day,action.id,true);
  h.store.finish(day);assert.equal(h.store.habits(day)['daily-sport'],true);
  const restored=createLifeStore(h.options);assert.equal(restored.exercise(day).status,'complete');assert.equal(restored.exercise(day).actions.knee,true);
  restored.toggleAction(day,'knee',false);assert.equal(restored.habits(day)['daily-sport'],false);
  restored.alternative(day,{confirmed:true});for(const action of exerciseMenu({...restored.exercise(day),alternative:true}))restored.toggleAction(day,action.id,true);
  restored.finish(day);assert.equal(restored.exercise(day).status,'alternative');assert.equal(restored.habits(day)['daily-sport'],true);
  restored.symptomRest(day);assert.equal(restored.exercise(day).status,'symptom_rest');assert.equal(restored.habits(day)['daily-sport'],false);
  const weekly=trainingWeek(restored.training(),day,restored.habits);assert.equal(weekly.planned,0);assert.equal(weekly.completed,0);assert.equal(weekly.rest,1);
  restored.schedule(day,'none',null,{confirmed:true});assert.equal(restored.exercise(day).status,'not_scheduled');assert.equal(restored.status().pending,0);
});
test('stages can freely move both directions on the same day, including while paused, without calendar upgrades',()=>{
  const h=local();h.store.start();h.store.setStage(4);assert.equal(h.store.training().stage,4);
  h.store.setStage(1);h.store.advance();assert.equal(h.store.training().stage,2);
  h.store.setTraining({paused:true});h.store.setStage(3);assert.equal(h.store.training().paused,true);assert.equal(h.store.training().stage,3);
  h.store.lower();assert.equal(h.store.training().stage,2);assert.throws(()=>h.store.setStage(0));assert.throws(()=>h.store.setStage(5));
  h.setDay('2027-06-01');assert.equal(h.store.training().stage,2);assert.equal(exerciseForDay(h.store.training(),'2027-06-01').stage,2);
  h.store.setTraining({paused:false});h.store.setStage(1);h.store.lower();assert.equal(h.store.training().stage,1);h.store.setStage(4);h.store.advance();assert.equal(h.store.training().stage,4);
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
  a.store.alternative('2026-10-12',{confirmed:true});for(const action of exerciseMenu({...a.store.exercise(),alternative:true}))a.store.toggleAction('2026-10-12',action.id,true);await settle(a.store);a.store.finish('2026-10-12');await settle(a.store);
  b.connection.online=true;await b.store.retry();await settle(a.store,b.store);
  const day=server.get('habits/2026-10-12');assert.equal(day['daily-sport'],true);assert.equal(day['daily-game'],true);assert.equal(day.questOS_v1.exercise.status,'alternative');assert.equal(day.questOS_v1.leisure.title,'閱讀');assert.equal(day.unknown,42);assert.equal(day['daily-exam'],true);
  assert.deepEqual(a.store.habits('2026-10-12'),b.store.habits('2026-10-12'));assert.equal(server.get('physiology/original'),true);assert.equal(server.get('gamification/v1/awards/keep/xp'),20);assert.ok(server.writes.every(p=>p.startsWith('habits/')));
});
test('same-activity offline conflict never overwrites another device before user resolves it',async()=>{
  const server=backend(),a=server.client('a'),b=server.client('b');await settle(a.store,b.store);a.store.schedule('2026-10-12','seated');await settle(a.store,b.store);
  b.connection.online=false;b.store.alternative('2026-10-12');await settle(b.store);a.store.symptomRest('2026-10-12');await settle(a.store);
  b.connection.online=true;await b.store.retry();await settle(a.store,b.store);assert.equal(b.store.status().conflicts['2026-10-12:exercise'],true);assert.equal(server.get('habits/2026-10-12/questOS_v1/exercise/status'),'symptom_rest');
  b.store.resolve('2026-10-12:exercise',false);await settle(a.store,b.store);assert.equal(b.store.exercise().status,'symptom_rest');assert.equal(b.store.status().pending,0);
  b.connection.online=false;b.store.schedule('2026-10-12','walk',null,{confirmed:true});await settle(b.store);a.store.schedule('2026-10-12','rest',null,{confirmed:true});await settle(a.store);b.connection.online=true;await b.store.retry();await settle(a.store,b.store);b.store.resolve('2026-10-12:exercise',true);await settle(a.store,b.store);assert.equal(a.store.exercise().type,'walk');
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

test('stored but untouched schedules follow current stage immediately while custom time stays explicit',()=>{
  const h=local(),day='2026-10-12';h.store.schedule(day,'seated');h.store.schedule('2026-10-14','walk');h.store.schedule('2026-10-15','walk',7);
  h.store.setStage(4);
  assert.equal(h.store.exercise(day).stage,4);assert.equal(h.store.exercise(day).minutes,25);assert.equal(exerciseMenu(h.store.exercise(day))[0].sets,2);
  assert.equal(h.store.exercise('2026-10-14').minutes,20);assert.equal(h.store.exercise('2026-10-15').minutes,7);
  h.store.toggleAction(day,'knee',true);assert.equal(h.store.habits(day).questOS_v1.exercise.stage,4);assert.equal(h.store.habits(day).questOS_v1.exercise.menuVersion,3);
  h.store.setStage(1);assert.equal(h.store.exercise(day).stage,4);assert.equal(h.store.exercise('2026-10-14').stage,1);
});
test('started, unchecked-after-start, completed and symptom-rest records never follow a new stage automatically',()=>{
  const h=local();h.store.schedule('2026-10-12','seated');h.store.startExercise('2026-10-12');
  h.store.schedule('2026-10-13','seated');h.store.toggleAction('2026-10-13','ankle',true);h.store.toggleAction('2026-10-13','ankle',false);
  h.store.schedule('2026-10-14','seated');for(const move of exerciseMenu(h.store.exercise('2026-10-14')))h.store.toggleAction('2026-10-14',move.id,true);h.store.finish('2026-10-14');
  h.store.schedule('2026-10-15','walk');h.store.symptomRest('2026-10-15');
  const before=copy(JSON.parse(h.saved.getItem(LIFE_KEY+'_local')).days);h.store.setStage(4);
  for(const day of Object.keys(before)){assert.equal(h.store.exercise(day).stage,1);assert.deepEqual(h.store.habits(day),before[day]);}
});
test('historical menus without version keep original movement IDs, doses and bytes even after programme update',()=>{
  const h=local();const records={};
  for(let stage=1;stage<=4;stage++){const day='2026-10-0'+stage;records[day]={questOS_v1:{exercise:{type:'seated',stage,status:'pending',minutes:8,actions:{},supportedStanding:true}}};h.saved.setItem('med_exam_habits_'+day,JSON.stringify(records[day]));}
  h.store.setStage(4);
  for(let stage=1;stage<=4;stage++){const day='2026-10-0'+stage,current=h.store.exercise(day);assert.equal(current.stage,stage);assert.equal(current.menuVersion,1);const menu=exerciseMenu(current);assert.ok(!menu.some(move=>move.id==='march'));assert.equal(menu[0].sets,stage>=3?2:1);assert.equal(menu[0].reps,stage===1?10:12);assert.equal(h.saved.getItem('med_exam_habits_'+day),JSON.stringify(records[day]));}
});
test('confirmed replacement archives the original menu and result; stale previews cannot clear newer actions',()=>{
  const h=local(),day='2026-10-12';h.store.schedule(day,'seated');h.store.toggleAction(day,'ankle',true);h.store.setStage(4);
  const before=h.store.exercise(day);assert.throws(()=>h.store.applyStage(day));
  const oldPreview=copy(before);h.store.toggleAction(day,'knee',true);assert.throws(()=>h.store.applyStage(day,{confirmed:true,expected:oldPreview}));assert.equal(h.store.exercise(day).actions.knee,true);
  h.store.applyStage(day,{confirmed:true,expected:h.store.exercise(day)});const current=h.store.exercise(day),previous=Object.values(current.revisions)[0];assert.equal(current.stage,4);assert.equal(current.status,'pending');assert.deepEqual(current.actions,{});assert.equal(previous.stage,1);assert.equal(previous.actions.ankle,true);assert.equal(previous.actions.knee,true);assert.equal(previous.menuVersion,3);
  const restored=createLifeStore(h.options);assert.deepEqual(restored.exercise(day).revisions,current.revisions);
});
test('stage defaults sync across devices while started records retain their menu and exercise conflicts remain explicit',async()=>{
  const server=backend(),a=server.client('a'),b=server.client('b');await settle(a.store,b.store);
  a.store.schedule('2026-10-12','seated');a.store.schedule('2026-10-13','seated');await settle(a.store,b.store);
  a.store.toggleAction('2026-10-12','ankle',true);await settle(a.store,b.store);b.store.setStage(4);await settle(a.store,b.store);
  assert.equal(a.store.exercise('2026-10-12').stage,1);assert.equal(b.store.exercise('2026-10-12').stage,1);assert.equal(a.store.exercise('2026-10-13').stage,4);assert.equal(b.store.exercise('2026-10-13').stage,4);
  b.connection.online=false;b.store.applyStage('2026-10-12',{confirmed:true,expected:b.store.exercise('2026-10-12')});await settle(b.store);
  a.store.toggleAction('2026-10-12','knee',true);await settle(a.store);b.connection.online=true;await b.store.retry();await settle(a.store,b.store);
  assert.ok(b.store.status().conflicts['2026-10-12:exercise']);assert.equal(server.get('habits/2026-10-12/questOS_v1/exercise/stage'),1);assert.equal(server.get('habits/2026-10-12/questOS_v1/exercise/actions/knee'),true);
  b.store.resolve('2026-10-12:exercise',false);await settle(a.store,b.store);assert.equal(b.store.exercise('2026-10-12').actions.knee,true);
});
test('phase menus progress clearly without mandatory unsupported standing or intense movements',()=>{
  const menus=[1,2,3,4].map(stage=>exerciseMenu({type:'seated',stage}));
  assert.deepEqual(menus.map(menu=>menu.length),[4,5,5,5]);assert.deepEqual(menus.map(menu=>[menu[0].sets,menu[0].reps]),[[1,10],[1,8],[2,8],[2,12]]);
  assert.deepEqual([1,2,3,4].map(stage=>exerciseMenu({type:'walk',stage})[0].minutes),[5,10,15,20]);
  assert.ok(menus.every(menu=>menu.every(move=>!['wall','chair','run','jump','hiit'].includes(move.id))));
});

test('confirmed replacement syncs its archive, including newer cloud progress when resolving a conflict with local choice',async()=>{
 const server=backend(),a=server.client('a'),b=server.client('b');await settle(a.store,b.store);
 a.store.schedule('2026-10-12','seated');await settle(a.store,b.store);a.store.toggleAction('2026-10-12','ankle',true);await settle(a.store,b.store);a.store.setStage(4);await settle(a.store,b.store);
 b.connection.online=false;b.store.applyStage('2026-10-12',{confirmed:true,expected:b.store.exercise('2026-10-12')});await settle(b.store);a.store.toggleAction('2026-10-12','knee',true);await settle(a.store);b.connection.online=true;await b.store.retry();await settle(a.store,b.store);
 b.store.resolve('2026-10-12:exercise',true);await settle(a.store,b.store);
 const record=server.get('habits/2026-10-12/questOS_v1/exercise');assert.equal(record.stage,4);assert.deepEqual(record.actions,{});assert.ok(Object.values(record.revisions).some(previous=>previous.actions.ankle&&previous.actions.knee));assert.deepEqual(a.store.exercise().revisions,b.store.exercise().revisions);
});

test('starting the replacement during its in-flight sync keeps the archive and newest action without archiving the new menu again',async()=>{
 const server=backend(),a=server.client('a');await settle(a.store);a.store.schedule('2026-10-12','seated');await settle(a.store);a.store.toggleAction('2026-10-12','ankle',true);await settle(a.store);a.store.setStage(4);await settle(a.store);
 a.store.applyStage('2026-10-12',{confirmed:true,expected:a.store.exercise()});a.store.toggleAction('2026-10-12','knee',true);await settle(a.store);
 const current=server.get('habits/2026-10-12/questOS_v1/exercise');assert.equal(current.stage,4);assert.equal(current.actions.knee,true);assert.equal(Object.values(current.revisions).length,1);assert.equal(Object.values(current.revisions)[0].stage,1);assert.equal(a.store.status().pending,0);
});

test('Firebase snapshots omitting empty action maps still render an untouched menu and preserve completed records',()=>{
 const config={...defaultTraining(),stage:4};
 const pending=exerciseForDay(config,'2026-10-12',{questOS_v1:{exercise:{type:'seated',stage:1,status:'pending',minutes:8}}},'2026-10-12');
 assert.equal(pending.stage,4);assert.deepEqual(pending.actions,{});assert.equal(exerciseMenu(pending).length,5);
 const completed=exerciseForDay(config,'2026-10-12',{questOS_v1:{exercise:{type:'seated',stage:1,status:'complete',minutes:8}}},'2026-10-12');assert.equal(completed.stage,1);assert.deepEqual(completed.actions,{});
});

test('walking ranges match the four stages and saved daily goals survive phase changes',()=>{
 const h=local(),day='2026-10-12';assert.deepEqual(STAGES.map(stage=>stage.walkRange),[[5,10],[10,15],[15,20],[20,30]]);
 h.store.schedule(day,'walk',9);h.store.setStage(4);assert.equal(h.store.exercise(day).minutes,9);assert.equal(exerciseMenu(h.store.exercise(day))[0].range,'20–30 分鐘');
 h.store.setWalkGoal(day,24,{expected:h.store.exercise(day)});h.store.setStage(2);assert.equal(h.store.exercise(day).minutes,24);
 h.store.toggleAction(day,'walk',true);h.store.finish(day);const before=copy(h.store.habits(day));h.store.setStage(4);assert.deepEqual(h.store.habits(day),before);assert.equal(h.store.exercise(day).stage,2);
 assert.throws(()=>h.store.setWalkGoal(day,12));h.store.setWalkGoal(day,12,{confirmed:true,expected:h.store.exercise(day)});assert.ok(Object.values(h.store.exercise(day).revisions).some(record=>record.minutes===24&&record.status==='complete'));
});
test('new general A/B days cover full body patterns with conditional seated replacements and progressive dosage',()=>{
 const a=exerciseMenu({type:'strength_a',stage:4,supportedStanding:true}),b=exerciseMenu({type:'strength_b',stage:4,supportedStanding:true});
 assert.deepEqual(a.map(move=>move.id),['chair','calf','wall','row','brace']);assert.deepEqual(b.map(move=>move.id),['hinge','chair','row','wall','wall-core']);assert.equal(b.at(-1).seconds,20);
 assert.ok(a.every(move=>move.name&&move.en&&move.instruction&&move.caution));assert.equal(a[0].sets,2);assert.equal(a[0].reps,10);assert.equal(a[3].reps,12);
 const seated=exerciseMenu({type:'strength_a',stage:4,supportedStanding:false});assert.deepEqual(seated.map(move=>move.id),['knee','seated-calf','palm','row','brace']);
 assert.ok(!exerciseMenu({type:'strength_a',stage:1,supportedStanding:true}).some(move=>['chair','wall','calf'].includes(move.id)));
 assert.equal(exerciseMenu({type:'strength_a',stage:2,supportedStanding:true})[0].sets,1);assert.equal(exerciseMenu({type:'strength_a',stage:3,supportedStanding:true})[0].sets,2);
 assert.deepEqual(defaultTraining().week,RECOMMENDED_WEEK);assert.equal(RECOMMENDED_WEEK[0],'strength_a');assert.equal(RECOMMENDED_WEEK[3],'strength_b');assert.equal(RECOMMENDED_WEEK[2],'rest');
});
test('versions 1 and 2 retain their exact original doses after introduction of full-body version 3',()=>{
 const h=local(),day='2026-10-11';const old={questOS_v1:{exercise:{type:'seated',menuVersion:2,stage:4,minutes:15,supportedStanding:true,status:'complete',actions:{ankle:true,march:true}}},'daily-sport':true};h.saved.setItem('med_exam_habits_'+day,JSON.stringify(old));
 h.store.setStage(4);h.store.setTraining({supportedStanding:true});const record=h.store.exercise(day),moves=exerciseMenu(record);
 assert.equal(record.menuVersion,2);assert.deepEqual(moves.map(move=>move.id),['ankle','knee','scapula','elbow','march','wall','chair']);assert.deepEqual(moves.slice(0,4).map(move=>[move.sets,move.reps]),[[2,12],[2,10],[2,10],[2,12]]);assert.equal(exerciseMenu({type:'walk',stage:4,menuVersion:2})[0].minutes,12);assert.equal(exerciseMenu({type:'walk',stage:4,menuVersion:1})[0].minutes,15);
 assert.equal(h.saved.getItem('med_exam_habits_'+day),JSON.stringify(old));
});
test('date modes override the global default and restore the original walking target without losing results',()=>{
 const h=local(),day='2026-10-12';h.store.schedule(day,'walk',23);h.store.changeMode(day,'alternative');assert.equal(h.store.exercise(day).minutes,5);assert.equal(h.store.exercise(day).type,'walk');assert.equal(exerciseMenu(h.store.exercise(day)).length,4);
 for(const move of exerciseMenu(h.store.exercise(day)))h.store.toggleAction(day,move.id,true);h.store.finish(day);assert.throws(()=>h.store.changeMode(day,'general'));h.store.changeMode(day,'general',{confirmed:true});assert.equal(h.store.exercise(day).minutes,23);
 h.store.setTraining({trainingMode:'alternative'});assert.notEqual(h.store.exercise(day).mode,'alternative');assert.ok(Object.values(h.store.exercise(day).revisions).some(record=>record.status==='alternative'&&record.mode==='alternative'));
 const fresh='2026-10-13';h.store.schedule(fresh,'strength_a');assert.equal(h.store.exercise(fresh).mode,'alternative');h.store.setTraining({trainingMode:'general'});assert.notEqual(h.store.exercise(fresh).mode,'alternative');
});
test('menu-affecting condition changes invalidate an open confirmation',()=>{
 const h=local(),day='2026-10-12';h.store.schedule(day,'strength_a');h.store.toggleAction(day,'ankle',true);const current=h.store.exercise(day),config=menuConfig(h.store.training());h.store.setTraining({supportedStanding:true});
 assert.throws(()=>h.store.changeMode(day,'alternative',{confirmed:true,expected:current,expectedConfig:config}));assert.equal(h.store.exercise(day).actions.ankle,true);
});
test('offline walking targets and date modes reconnect consistently across devices with old menus preserved',async()=>{
 const server=backend(),a=server.client('a'),b=server.client('b');await settle(a.store,b.store);a.store.schedule('2026-10-12','walk',11);await settle(a.store,b.store);
 b.connection.online=false;b.store.setWalkGoal('2026-10-12',22);await settle(b.store);a.store.setStage(4);await settle(a.store);b.connection.online=true;await b.store.retry();await settle(a.store,b.store);assert.equal(a.store.exercise().minutes,22);assert.equal(b.store.exercise().minutes,22);
 a.store.changeMode('2026-10-12','alternative');await settle(a.store,b.store);assert.equal(b.store.exercise().mode,'alternative');a.store.changeMode('2026-10-12','general');await settle(a.store,b.store);assert.equal(b.store.exercise().minutes,22);
});


test('time provenance is explicit across stages, modes and legacy minutes',()=>{
 for(const type of ['walk','strength_a','strength_b'])for(const stage of [1,2,3,4])for(const source of ['stage','custom',undefined]) {
  const record={type,stage:1,status:'pending',minutes:5,actions:{},menuVersion:3,modeSource:'settings',...(source?{timeSource:source}:{})};
  const config={...defaultTraining(),stage};const expected=source==='stage'?(type==='walk'?STAGES[stage-1].walk:STAGES[stage-1].seatedMinutes):5;
  const normal=stageExercise(record,config);assert.equal(normal.minutes,expected);assert.equal(normal.timeSource,source??null);
  const alt=stageExercise(record,{...config,trainingMode:'alternative'});assert.equal(alt.minutes,5);assert.equal(alt.normalPlan.minutes,expected);assert.equal(alt.normalPlan.timeSource,source??null);
  const restored=stageExercise(alt,config);assert.equal(restored.minutes,expected);assert.equal(restored.timeSource,source??null);
 }
 assert.equal(stageExercise({type:'walk',stage:1,mode:'alternative',modeSource:'settings',minutes:5,timeSource:'stage',normalPlan:{minutes:9}}, {...defaultTraining(),stage:4}).minutes,9);
 const h=local();h.store.setExercise('2026-10-12',{type:'walk',stage:1,status:'pending',minutes:5,timeSource:null});h.store.setStage(4);assert.equal(h.store.exercise().minutes,5);
 h.store.changeMode('2026-10-12','alternative');h.store.changeMode('2026-10-12','general');h.store.setStage(2);assert.equal(h.store.exercise().minutes,5);assert.equal(h.store.exercise().timeSource,null);
});
test('recommended week upgrade changes only the template and preserves every saved date byte',()=>{
 const h=local(),old=['seated','walk','rest','seated','walk','rest','rest'];h.store.setTraining({week:old});h.store.start();
 h.store.schedule('2026-10-12','seated');h.store.startExercise('2026-10-12');h.store.schedule('2026-10-13','walk');h.store.toggleAction('2026-10-13','walk',true);h.store.finish('2026-10-13');h.store.schedule('2026-10-14','seated');h.store.symptomRest('2026-10-14');h.store.schedule('2026-10-15','seated');h.store.schedule('2026-10-11','seated');
 const before=copy(JSON.parse(h.saved.getItem(LIFE_KEY+'_local')).days);h.store.setTraining({week:[...RECOMMENDED_WEEK]},{expected:h.store.training()});
 assert.deepEqual(h.store.training().week,RECOMMENDED_WEEK);assert.deepEqual(JSON.parse(h.saved.getItem(LIFE_KEY+'_local')).days,before);assert.equal(h.store.exercise('2026-10-19').type,'strength_a');assert.equal(h.store.exercise('2026-10-22').type,'strength_b');assert.equal(h.store.exercise('2026-10-15').type,'seated');assert.throws(()=>h.store.setTraining({week:old},{expected:{...h.store.training(),week:old}}));
});
test('offline week upgrade conflicts explicitly and never writes any day or history',async()=>{
 const server=backend(),a=server.client('a'),b=server.client('b');await settle(a.store,b.store);
 a.store.setTraining({week:['seated','walk','rest','seated','walk','rest','rest']});a.store.start();a.store.schedule('2026-10-12','seated');a.store.startExercise('2026-10-12');await settle(a.store,b.store);const before=copy(server.get('habits'));const writes=server.writes.length;
 b.connection.online=false;b.store.setTraining({week:[...RECOMMENDED_WEEK]},{expected:b.store.training()});await settle(b.store);a.store.setTraining({week:['rest','walk','rest','seated','walk','rest','rest']});await settle(a.store);b.connection.online=true;await b.store.retry();await settle(a.store,b.store);
 assert.ok(b.store.status().conflicts.training);assert.deepEqual(server.get('habits'),before);b.store.resolve('training',true);await settle(a.store,b.store);assert.deepEqual(a.store.training().week,RECOMMENDED_WEEK);assert.deepEqual(a.store.habits('2026-10-12'),b.store.habits('2026-10-12'));assert.deepEqual(server.get('habits'),before);assert.ok(server.writes.slice(writes).every(path=>path===TRAINING_PATH));
});


test('single-day rescheduling requires confirmation for every protected result and archives the exact old menu',()=>{
 for(const status of ['pending','complete','alternative','symptom_rest']) {
  const h=local(),day='2026-10-12';h.store.schedule(day,'walk',23);h.store.setExercise(day,{status,startedOn:day,actions:{walk:status==='complete'},menuVersion:2});
  const before=h.saved.getItem(LIFE_KEY+'_local'),previous=h.store.exercise(day);assert.throws(()=>h.store.schedule(day,'strength_b'));assert.equal(h.saved.getItem(LIFE_KEY+'_local'),before);
  h.store.schedule(day,'strength_b',null,{confirmed:true,expected:previous});const record=h.store.exercise(day);assert.equal(record.type,'strength_b');assert.equal(record.status,'pending');assert.deepEqual(record.actions,{});
  const archived=Object.values(record.revisions)[0];assert.equal(archived.status,status);assert.equal(archived.minutes,23);assert.equal(archived.menuVersion,2);assert.deepEqual(archived.actions,previous.actions);
  const restored=createLifeStore(h.options);assert.deepEqual(restored.exercise(day).revisions,record.revisions);
 }
});
test('moving a protected source preserves its bytes; protected targets cannot be replaced without confirmation',()=>{
 const h=local(),source='2026-10-12',target='2026-10-13';h.store.schedule(source,'walk',18);h.store.startExercise(source);h.store.schedule(target,'walk',9);h.store.symptomRest(target);
 const before=h.saved.getItem(LIFE_KEY+'_local'),sourceRecord=h.store.habits(source),expected=h.store.exercise(target);assert.throws(()=>h.store.moveSchedule(source,target,'strength_a'));assert.equal(h.saved.getItem(LIFE_KEY+'_local'),before);
 h.store.moveSchedule(source,target,'strength_a',null,{confirmed:true,expected,expectedSource:h.store.exercise(source)});assert.deepEqual(h.store.habits(source),sourceRecord);assert.equal(h.store.exercise(target).type,'strength_a');assert.ok(Object.values(h.store.exercise(target).revisions).some(record=>record.status==='symptom_rest'&&record.minutes===9));
 const preview=h.store.exercise(target);h.store.startExercise(target);const changed=h.saved.getItem(LIFE_KEY+'_local');assert.throws(()=>h.store.moveSchedule(source,target,'walk',12,{confirmed:true,expected:preview,expectedSource:h.store.exercise(source)}));assert.equal(h.saved.getItem(LIFE_KEY+'_local'),changed);
});
test('moving an untouched draft clears only that source; source progress arriving during preview cancels all writes',()=>{
 const h=local(),source='2026-10-12',target='2026-10-13';h.store.schedule(source,'walk',18);const preview=h.store.exercise(source);h.store.startExercise(source);const before=h.saved.getItem(LIFE_KEY+'_local');assert.throws(()=>h.store.moveSchedule(source,target,'walk',18,{expectedSource:preview}));assert.equal(h.saved.getItem(LIFE_KEY+'_local'),before);
 const draft='2026-10-14';h.store.schedule(draft,'walk',12);h.store.moveSchedule(draft,'2026-10-15','walk',12,{expectedSource:h.store.exercise(draft)});assert.equal(h.store.exercise(draft).type,'none');assert.equal(h.store.exercise('2026-10-15').minutes,12);
});
test('confirmed offline rescheduling keeps newer cloud results when resolving to the local replacement',async()=>{
 const server=backend(),a=server.client('a'),b=server.client('b');await settle(a.store,b.store);a.store.schedule('2026-10-12','walk',23);await settle(a.store,b.store);a.store.toggleAction('2026-10-12','walk',true);a.store.finish('2026-10-12');await settle(a.store,b.store);
 b.connection.online=false;b.store.schedule('2026-10-12','strength_b',null,{confirmed:true,expected:b.store.exercise()});await settle(b.store);a.store.symptomRest('2026-10-12');await settle(a.store);b.connection.online=true;await b.store.retry();await settle(a.store,b.store);assert.ok(b.store.status().conflicts['2026-10-12:exercise']);assert.equal(server.get('habits/2026-10-12/questOS_v1/exercise/status'),'symptom_rest');b.store.resolve('2026-10-12:exercise',true);await settle(a.store,b.store);
 const record=server.get('habits/2026-10-12/questOS_v1/exercise');assert.equal(record.type,'strength_b');assert.ok(Object.values(record.revisions).some(old=>old.status==='complete'&&old.minutes===23));assert.ok(Object.values(record.revisions).some(old=>old.status==='symptom_rest'));assert.deepEqual(a.store.exercise(),b.store.exercise());
});


test('past recovery schedules also require confirmation and retain their original date and menu',()=>{
 const h=local(),day='2026-10-11';h.store.schedule(day,'rest',12);const before=h.saved.getItem(LIFE_KEY+'_local'),record=h.store.exercise(day);assert.throws(()=>h.store.schedule(day,'walk',5));assert.equal(h.saved.getItem(LIFE_KEY+'_local'),before);h.store.schedule(day,'walk',5,{confirmed:true,expected:record});assert.ok(Object.values(h.store.exercise(day).revisions).some(old=>old.type==='rest'&&old.status==='not_scheduled'&&old.minutes===12));
});
