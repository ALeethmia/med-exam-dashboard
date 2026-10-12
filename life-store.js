import {dateKey} from './study-core.js';
import {validDate} from './daily-planner.js';
import {defaultTraining,canAdvance,exerciseForDay,exerciseMenu,leisureForDay,TYPES,STATUS} from './life-core.js';
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
export function createLifeStore({db=null,localOnly=false,storage=localStorage,events=window,onChange=()=>{},onHabits=()=>{},mergeLegacy=(day,value)=>value,today=()=>dateKey(),newId=()=>crypto.randomUUID(),readLegacy=day=>{try{return JSON.parse(storage.getItem('med_exam_habits_'+day)||'{}');}catch{return {};}}}={}) {
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
  function queue(id,field,value) {
    const day=id==='training'?null:id.slice(0,10);
    const base=day?habits(day).questOS_v1?._versions?.[field]:saved.training?._version;
    const previous=saved.pending[id];
    saved.pending[id]={field,value:clone(value),base:previous?previous.base:(base||null),token:newId(),day};
    if(day)saved.days[day]=applyDay(habits(day),field,value,base||null);
    else saved.training=clone(value);
    if(localOnly){delete saved.pending[id];delete conflicts[id];}
    changed();void retry();
  }
  function setTraining(patch) {
    const config={...training(),...patch,category:'exercise'};
    if(!Number.isInteger(config.stage)||config.stage<1||config.stage>4)throw new Error('訓練階段需為 1–4。');
    if(!Array.isArray(config.week)||config.week.length!==7||config.week.some(type=>!Object.hasOwn(TYPES,type)))throw new Error('請設定七天的訓練類型。');
    for(const date of [config.startedOn,config.stageSince])if(date!==null&&!validDate(date))throw new Error('階段日期無效。');
    config.paused=!!config.paused;config.supportedStanding=!!config.supportedStanding;
    queue('training','training',config);
  }
  function start() {setTraining({startedOn:today(),stageSince:today(),paused:false});}
  function advance(confirmed) {
    const config=training();if(!confirmed||!canAdvance(config,today()))throw new Error('需在目前階段至少兩週，並確認耐受良好且症狀沒有明顯加重。');
    setTraining({stage:config.stage+1,stageSince:today()});
  }
  function lower() {setTraining({stage:Math.max(1,training().stage-1),stageSince:today()});}
  function checkDate(day) {if(!validDate(day))throw new Error('請選擇有效日期。');}
  function minutes(value) {if(value!==null&&(!Number.isInteger(value)||value<1||value>240))throw new Error('時間需為 1–240 分鐘，或留空。');return value;}
  function exercise(day=today()) {return exerciseForDay(training(),day,habits(day));}
  function setExercise(day,patch) {
    checkDate(day);const value={...exercise(day),...clone(patch),category:'exercise'};delete value.legacy;
    if(!Object.hasOwn(TYPES,value.type)||!Object.hasOwn(STATUS,value.status))throw new Error('訓練狀態無效。');
    if(!Number.isInteger(value.stage)||value.stage<1||value.stage>4)throw new Error('訓練階段無效。');
    value.minutes=minutes(value.minutes??null);value.actions=value.actions||{};
    queue(day+':exercise','exercise',value);
  }
  function schedule(day,type,time=null) {
    if(!Object.hasOwn(TYPES,type))throw new Error('訓練類型無效。');
    const config=training();
    setExercise(day,{type,stage:config.stage,supportedStanding:config.supportedStanding,minutes:time??(type==='walk'?[5,8,10,15][config.stage-1]:type==='seated'?8:null),status:['none','rest'].includes(type)?'not_scheduled':'pending',mode:null,actions:{}});
  }
  function toggleAction(day,id,complete) {
    if(training().paused)throw new Error('目前暫停訓練；請先恢復設定，或記錄休息。');
    const current=exercise(day),menu=exerciseMenu({...current,alternative:current.mode==='alternative'});
    if(!menu.some(action=>action.id===id)||['symptom_rest','not_scheduled'].includes(current.status))return;
    setExercise(day,{actions:{...current.actions,[id]:!!complete},status:'pending'});
  }
  function alternative(day) {const current=exercise(day);setExercise(day,{type:'seated',mode:'alternative',minutes:5,status:'pending',actions:{},stage:current.stage,supportedStanding:false});}
  function finish(day) {
    if(training().paused)throw new Error('目前暫停訓練；休息不需要補做。');
    const current=exercise(day),menu=exerciseMenu({...current,alternative:current.mode==='alternative'});
    if(!menu.length||menu.some(action=>!current.actions[action.id]))throw new Error('請完成菜單動作；不舒服時可直接記錄症狀休息。');
    setExercise(day,{status:current.mode==='alternative'?'alternative':'complete'});
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
      setExercise(day,{status:complete?'complete':(['none','rest'].includes(current.type)?'not_scheduled':'pending')});
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
          return intent.day?applyDay(current,intent.field,intent.value,intent.token):{...(current||{}),...intent.value,_version:intent.token};
        },undefined,false);
        const current=result.snapshot.val();remote[id]=current;
        if(result.committed===false){conflicts[id]=true;overlay(id,current);continue;}
        const pending=saved.pending[id];
        if(pending?.token===intent.token)delete saved.pending[id];
        else if(pending?.base===intent.base)pending.base=version(current,intent);
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
  return {habits,training,start,advance,lower,setTraining,exercise,setExercise,schedule,toggleAction,alternative,finish,symptomRest,setLeisure,setStudyMinutes,setHabit,retry,resolve,
    status:()=>({syncing,error,pending:Object.keys(saved.pending).length,conflicts:clone(conflicts)}),
    choices:id=>({local:clone(saved.pending[id]?.value??null),cloud:clone(saved.pending[id]?value(remote[id],saved.pending[id])??null:null)})};
}
