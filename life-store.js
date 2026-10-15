import {dateKey} from './src/study/study-core.js';
import {validDate} from './daily-planner.js';
import {defaultTraining,exerciseForDay,exerciseMenu,leisureForDay,TYPES,STATUS,STAGES,MENU_VERSION,stageExercise,untouchedExercise,isStrength,hasTrainingMenu,modeExercise,menuConfig,scheduleNeedsConfirmation} from './src/study/life-core.js';
export const LIFE_KEY='med_exam_life_v1';
export const TRAINING_PATH='questOS/v1/training';
const clone=value=>JSON.parse(JSON.stringify(value));
// RTDB removes null children and may reorder object keys; neither is a content conflict.
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(key=>key!=='_version'&&value[key]!=null).map(key=>[key,canonical(value[key])])):value??null;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const lifeFields=['exercise','leisure','studyMinutes'];
// An activity and its legacy checkbox projection commit in ONE habits/day transaction.
// No study data, XP, historical IDs or unrelated habit fields are written here.
export function applyDay(current,field,value,token) {
  const next={...(current||{}),questOS_v1:{...(current?.questOS_v1||{}),[field]:value,_versions:{...(current?.questOS_v1?._versions||{}),[field]:token}}};
  if(field==='exercise')next['daily-sport']=['complete','alternative'].includes(value.status);
  if(field==='leisure')next['daily-game']=value.status==='complete';
  return next;
}
export function createLifeStore({db=null,localOnly=false,storage=learningStorage,events=window,onChange=()=>{},onHabits=()=>{},mergeLegacy=(day,value)=>value,today=()=>dateKey(),newId=()=>crypto.randomUUID(),readLegacy=day=>{try{return JSON.parse(storage.getItem('med_exam_habits_'+day)||'{}');}catch{return {};}}}={}) {
  const key=LIFE_KEY+(localOnly?'_local':'');
  let saved={days:{},training:null,pending:{}};
  try {const value=JSON.parse(storage.getItem(key)||'{}');saved={days:value.days||{},training:value.training||null,pending:value.pending||{}};}catch{}
  let syncing=false,dirty=false,error='';const remote={},conflicts={};
  const persist=()=>storage.setItem(key,JSON.stringify(saved));
  const habits=day=>{
    const value=clone(mergeLegacy(day,saved.days[day]||readLegacy(day)||{}));
    const life=value.questOS_v1;
    if(life?.exercise)value['daily-sport']=['complete','alternative'].includes(life.exercise.status);
    if(life?.leisure)value['daily-game']=life.leisure.status==='complete';
    return value;
  };
  const training=()=>({...defaultTraining(),...(saved.training||{})});
  const changed=()=>{persist();onHabits(today(),habits(today()));onChange();};
  function queue(id,field,value,options={}) {
    const day=id==='training'?null:id.slice(0,10);
    const base=day?habits(day).questOS_v1?._versions?.[field]:saved.training?._version;
    const previous=saved.pending[id];
    saved.pending[id]={...(previous?.archiveOnReplace?{archiveOnReplace:true,archiveDay:previous.archiveDay}:{}),...options,field,value:clone(value),base:previous?previous.base:(base||null),token:newId(),day};
    if(day)saved.days[day]=applyDay(habits(day),field,value,base||null);
    else saved.training=clone(value);
    if(localOnly){delete saved.pending[id];delete conflicts[id];}
    changed();void retry();
  }
  function setTraining(patch,{expected=null}={}) {
    if(expected&&!same(training(),expected))throw new Error('設定已在其他裝置更新，請關閉後重新查看再儲存。');
    const config={...training(),...patch,category:'exercise'};
    if(!Number.isInteger(config.stage)||config.stage<1||config.stage>4)throw new Error('訓練階段需為 1–4。');
    if(!Array.isArray(config.week)||config.week.length!==7||config.week.some(type=>!Object.hasOwn(TYPES,type)))throw new Error('請設定七天的訓練類型。');
    for(const date of [config.startedOn,config.stageSince])if(date!==null&&!validDate(date))throw new Error('階段日期無效。');
    if(config.stage!==training().stage)config.stageSince=config.startedOn?today():null;
    if(!['general','alternative'].includes(config.trainingMode))throw new Error('請選擇訓練模式。');
    config.paused=!!config.paused;config.supportedStanding=!!config.supportedStanding;
    queue('training','training',config);
  }
  function start() {setTraining({startedOn:today(),stageSince:today(),paused:false});}
  function setStage(stage) {setTraining({stage});}
  function advance() {setStage(Math.min(4,training().stage+1));}
  function lower() {setStage(Math.max(1,training().stage-1));}
  function checkDate(day) {if(!validDate(day))throw new Error('請選擇有效日期。');}
  function minutes(value) {if(value!==null&&(!Number.isInteger(value)||value<1||value>240))throw new Error('時間需為 1–240 分鐘，或留空。');return value;}
  function exercise(day=today()) {return exerciseForDay(training(),day,habits(day),today());}
  function setExercise(day,patch,options={}) {
    checkDate(day);const value={...exercise(day),...clone(patch),category:'exercise'};delete value.legacy;
    if(!Object.hasOwn(TYPES,value.type)||!Object.hasOwn(STATUS,value.status))throw new Error('訓練狀態無效。');
    if(!Number.isInteger(value.stage)||value.stage<1||value.stage>4)throw new Error('訓練階段無效。');
    value.minutes=minutes(value.minutes??null);value.actions=value.actions||{};
    queue(day+':exercise','exercise',value,options);
  }
  function previewSchedule(type,time=null) {
    minutes(time);
    if(!Object.hasOwn(TYPES,type))throw new Error('訓練類型無效。');
    const config=training();
    const plan={type,stage:config.stage,supportedStanding:config.supportedStanding,menuVersion:MENU_VERSION,timeSource:time===null?'stage':'custom',minutes:time??(type==='walk'?STAGES[config.stage-1].walk:isStrength(type)?STAGES[config.stage-1].seatedMinutes:null),status:['none','rest'].includes(type)?'not_scheduled':'pending',mode:null,modeSource:'settings',normalPlan:null,actions:{},startedOn:null};
    const value=config.trainingMode==='alternative'&&hasTrainingMenu(type)?modeExercise(plan,config,'alternative'):plan;value.modeSource='settings';return value;
  }
  function schedule(day,type,time=null,options={}) {
    checkDate(day);
    if(options.expectedConfig&&!same(training(),options.expectedConfig))throw new Error('訓練設定已更新，請重新查看安排。');
    replaceExercise(day,previewSchedule(type,time),{...options,protect:scheduleNeedsConfirmation(exercise(day),day,today()),archiveOnReplace:true});
  }
  function moveSchedule(source,target,type,time=null,options={}) {
    checkDate(source);checkDate(target);previewSchedule(type,time);
    if(options.expectedSource&&!same(exercise(source),options.expectedSource))throw new Error('來源日期已更新，請重新查看安排。');
    const previous=exercise(source);
    schedule(target,type,time,options);
    // Moving never removes started/results/history. Only untouched current/future drafts move.
    if(source!==target && source>=today() && untouchedExercise(previous))schedule(source,'none',null,{expected:previous});
  }
  function toggleAction(day,id,complete) {
    if(training().paused)throw new Error('目前暫停訓練；請先恢復設定，或記錄休息。');
    const current=exercise(day),menu=exerciseMenu({...current,alternative:current.mode==='alternative'});
    if(!menu.some(action=>action.id===id)||['symptom_rest','not_scheduled'].includes(current.status))return;
    setExercise(day,{actions:{...current.actions,[id]:!!complete},startedOn:current.startedOn||today(),status:'pending'});
  }
  function startExercise(day) {
    const current=exercise(day);if(training().paused||current.status!=='pending')throw new Error('請先安排可開始的訓練。');
    setExercise(day,{startedOn:current.startedOn||today()});
  }
  function replaceExercise(day,next,{confirmed=false,expected=null,protect=null,archiveOnReplace=null}={}) {
    checkDate(day);const current=exercise(day);
    if(expected&&!same(current,expected))throw new Error('菜單已更新，請重新查看變更內容再套用。');
    const protectedRecord=protect??(!untouchedExercise(current)||day<today());
    if(protectedRecord&&!confirmed)throw new Error('此日期已有紀錄或屬於歷史日期，請先確認；原菜單與結果將保存。');
    if(protectedRecord) {
      const previous=clone(current);delete previous.revisions;delete previous.legacy;
      next.revisions={...(current.revisions||{}),[newId()]:{...previous,archivedOn:today()}};
    }
    delete next.legacy;
    setExercise(day,{...next,actions:{},startedOn:null,status:['none','rest'].includes(next.type)?'not_scheduled':'pending'},{archiveOnReplace:archiveOnReplace??protectedRecord,archiveDay:today()});
  }
  function applyStage(day,{confirmed=false,expected=null,targetStage=training().stage,expectedConfig=null}={}) {
    const current=exercise(day),config=training();
    if(!hasTrainingMenu(current.type))throw new Error('此日期沒有可替換的訓練菜單。');
    if(config.stage!==targetStage||(expectedConfig&&!same(menuConfig(config),expectedConfig)))throw new Error('設定已更新，請重新查看變更內容再套用。');
    replaceExercise(day,stageExercise(current,config),{confirmed,expected});
  }
  function changeMode(day,mode,options={}) {
    if(!['general','alternative'].includes(mode))throw new Error('訓練模式無效。');
    if(options.expectedConfig&&!same(menuConfig(training()),options.expectedConfig))throw new Error('動作條件或設定已更新，請重新查看菜單。');
    const current=exercise(day);if(!hasTrainingMenu(current.type))throw new Error('請先安排訓練，或保留休息。');
    replaceExercise(day,modeExercise(current,training(),mode),options);
  }
  function alternative(day,options={}) {changeMode(day,'alternative',options);}
  function setWalkGoal(day,time,options={}) {
    const current=exercise(day);if(current.type!=='walk'||current.mode==='alternative')throw new Error('此日期沒有一般步行安排。');
    if(!Number.isInteger(time)||time<1||time>120)throw new Error('步行目標需為 1–120 分鐘。');
    replaceExercise(day,{...current,minutes:time,timeSource:'custom',normalPlan:null},options);
  }
  function finish(day) {
    if(training().paused)throw new Error('目前暫停訓練；休息不需要補做。');
    const current=exercise(day),menu=exerciseMenu({...current,alternative:current.mode==='alternative'});
    if(!menu.length||menu.some(action=>!current.actions[action.id]))throw new Error('請完成菜單動作；不舒服時可直接記錄症狀休息。');
    setExercise(day,{status:current.mode==='alternative'?'alternative':'complete',startedOn:current.startedOn||today()});
  }
  function symptomRest(day) {setExercise(day,{status:'symptom_rest',actions:{}});}
  function setLeisure(day,{title='',minutes:time=null,status='pending'}) {
    checkDate(day);title=String(title).trim();if(title.length>120)throw new Error('活動名稱最多 120 字。');
    if(!['pending','complete','not_scheduled'].includes(status))throw new Error('休閒狀態無效。');
    queue(day+':leisure','leisure',{category:'leisure',title,minutes:minutes(time),status:title?status:'not_scheduled'});
  }
  function setStudyMinutes(day,value) {checkDate(day);if(value!==null&&(!Number.isInteger(value)||value<1||value>1440))throw new Error('學習時間需為 1–1440 分鐘，或留空。');queue(day+':studyMinutes','studyMinutes',value);}
  function setHabit(id,complete) {
    const day=today();
    if(id==='daily-sport') {
      const current=exercise(day);
      // A legacy quick check is a self-reported completion, not fabricated action checks.
      setExercise(day,{...(complete?{startedOn:current.startedOn||today()}:{}),status:complete?'complete':(['none','rest'].includes(current.type)?'not_scheduled':'pending')});
    } else if(id==='daily-game') {
      const current=leisureForDay(habits(day));setLeisure(day,{...current,title:current.title||'休息',status:complete?'complete':'pending'});
    }
  }
  function overlay(id,current) {
    const intent=saved.pending[id];
    if(id==='training')saved.training=intent?{...(current||{}),...intent.value}:current;
    else {const day=id.slice(0,10);saved.days[day]=intent?applyDay(current,intent.field,intent.value,current?.questOS_v1?._versions?.[intent.field]||null):current;}
  }
  const version=(current,intent)=>intent.day?current?.questOS_v1?._versions?.[intent.field]||null:current?._version||null;
  const value=(current,intent)=>intent.day?current?.questOS_v1?.[intent.field]:current;
  function isConflict(current,intent) {return version(current,intent)!==intent.base && version(current,intent)!==intent.token && !same(value(current,intent),intent.value);}
  async function retry() {
    if(!db||localOnly)return;
    if(syncing){dirty=true;return;}syncing=true;dirty=false;
    try {
      for(const [id,original] of Object.entries(saved.pending)) {
        if(conflicts[id])continue;const intent=clone(original),reference=db.ref(intent.day?'habits/'+intent.day:TRAINING_PATH);
        if(reference.once)await reference.once('value');
        const result=await reference.transaction(current=>{
          if(isConflict(current,intent))return;
          let nextValue=intent.value;
          if(intent.archiveOnReplace&&current?.questOS_v1?.exercise) {
            const snapshot=record=>{const v=clone(record);delete v.revisions;delete v.legacy;delete v.archivedOn;v.menuVersion ||= 1;return v;};
            const previous=snapshot(current.questOS_v1.exercise);
            if(!Object.values(nextValue.revisions||{}).some(record=>same(snapshot(record),previous)))nextValue={...nextValue,revisions:{...(nextValue.revisions||{}),[intent.token+'_previous']:{...previous,archivedOn:intent.archiveDay}}};
          }
          return intent.day?applyDay(current,intent.field,nextValue,intent.token):{...(current||{}),...nextValue,_version:intent.token};
        },undefined,false);
        const current=result.snapshot.val();remote[id]=current;
        if(result.committed===false){conflicts[id]=true;overlay(id,current);continue;}
        const pending=saved.pending[id];
        if(pending?.token===intent.token)delete saved.pending[id];
        else if(pending) {
          if(pending.base===intent.base)pending.base=version(current,intent);
          if(intent.field==='exercise'&&current?.questOS_v1?.exercise?.revisions)pending.value.revisions={...current.questOS_v1.exercise.revisions,...(pending.value.revisions||{})};
          if(intent.archiveOnReplace){delete pending.archiveOnReplace;delete pending.archiveDay;}
        }
        delete conflicts[id];overlay(id,current);
        // Reapply any other fields still queued for this day.
        if(intent.day)for(const [other,p] of Object.entries(saved.pending))if(p.day===intent.day)overlay(other,saved.days[intent.day]);
        persist();
      }error='';
    } catch(failure) {error=String(failure?.code||'NETWORK_ERROR').replace(/[^a-zA-Z_-]/g,'').slice(0,60);}
    finally{syncing=false;changed();if(dirty&&!error)void retry();}
  }
  function resolve(id,keepLocal) {
    const intent=saved.pending[id];if(!intent||!conflicts[id])return;
    if(keepLocal)intent.base=version(remote[id],intent);else delete saved.pending[id];
    delete conflicts[id];overlay(id,remote[id]);
    if(intent.day)for(const [other,p] of Object.entries(saved.pending))if(p.day===intent.day)overlay(other,saved.days[intent.day]);
    changed();void retry();
  }
  if(db&&!localOnly) {
    db.ref('habits').on('value',snapshot=>{
      for(const [day,current] of Object.entries(snapshot.val()||{})) {
        saved.days[day]=mergeLegacy(day,current);
        for(const field of lifeFields){const id=day+':'+field;remote[id]=current;if(saved.pending[id])overlay(id,saved.days[day]);}
      }changed();
    },failure=>{error=failure?.code||'PERMISSION_DENIED';onChange();});
    db.ref(TRAINING_PATH).on('value',snapshot=>{remote.training=snapshot.val();overlay('training',remote.training);changed();},failure=>{error=failure?.code||'PERMISSION_DENIED';onChange();});
    db.ref('.info/connected').on('value',snapshot=>{if(snapshot.val()===true)void retry();});
  }
  events.addEventListener('online',()=>void retry());
  events.addEventListener('legacy-habit-change',event=>{
    const {day,id,value}=event.detail||{};
    if(!validDate(day)||!id||['daily-sport','daily-game'].includes(id))return;
    saved.days[day]={...habits(day),[id]:value};changed();
  });
  events.addEventListener('storage',event=>{
    if(event.key!==key||!event.newValue)return;
    try {const incoming=JSON.parse(event.newValue);saved.days={...saved.days,...incoming.days};saved.training=incoming.training||saved.training;saved.pending={...saved.pending,...incoming.pending};
      for(const [id,p] of Object.entries(saved.pending))overlay(id,p.day?saved.days[p.day]:saved.training);
      onHabits(today(),habits(today()));onChange();void retry();
    }catch{}
  });
  // Read only existing date records; never call exerciseForDay to synthesize history.
  function recordedHabits() {
    const dates=new Set(Object.keys(saved.days));
    if(typeof storage.length==='number'&&typeof storage.key==='function')for(let i=0;i<storage.length;i++){
      const key=storage.key(i);if(key?.startsWith('med_exam_habits_'))dates.add(key.slice('med_exam_habits_'.length));
    }
    return Object.fromEntries([...dates].filter(validDate).map(day=>[day,habits(day)]));
  }
  return {recordedHabits,habits,training,start,advance,lower,setStage,setTraining,exercise,setExercise,previewSchedule,schedule,moveSchedule,toggleAction,startExercise,applyStage,changeMode,setWalkGoal,alternative,finish,symptomRest,setLeisure,setStudyMinutes,setHabit,retry,resolve,
    status:()=>({syncing,error,pending:Object.keys(saved.pending).length,conflicts:clone(conflicts)}),
    choices:id=>({local:clone(saved.pending[id]?.value??null),cloud:clone(saved.pending[id]?value(remote[id],saved.pending[id])??null:null)})};
}
