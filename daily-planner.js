import {dateKey} from './study-core.js';
export const PLANNER_PATH = 'gamification/v3/planner/tasks';
export const PLANNER_KEY = 'med_exam_daily_planner_v3';
const fields = ['title','date','minutes','links','complete','deleted','order','createdAt'];
const clone = value => JSON.parse(JSON.stringify(value));
const same = (a,b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
export function validDate(value) {
  const parsed=new Date(value+'T12:00:00Z');
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
}
export function createPlanner({db=null,localOnly=false,storage=localStorage,events=window,onChange=()=>{},newId=()=>crypto.randomUUID(),today=()=>dateKey(),now=()=>Date.now()}={}) {
  const key=PLANNER_KEY+(localOnly?'_local':'');
  let saved={tasks:{},pending:{}};
  try {const value=JSON.parse(storage.getItem(key)||'{}');saved={tasks:value.tasks||{},pending:value.pending||{}};} catch {}
  const remote={}, conflicts={};
  let syncing=false,dirty=false,error='';
  const persist=()=>storage.setItem(key,JSON.stringify(saved));
  const changed=()=>{persist();onChange();};
  function overlay(id,value) {
    const intent=saved.pending[id];
    saved.tasks[id]={...value,...(intent?.patch||{})};
    if(intent?.awardDay && !saved.tasks[id].award) saved.tasks[id].award={xp:20,day:intent.awardDay};
  }
  function clean(patch) {
    const result={};
    for(const field of fields) if(Object.hasOwn(patch,field))result[field]=patch[field];
    if('title' in result) {result.title=String(result.title).trim();if(!result.title || result.title.length>160)throw new Error('任務名稱需為 1–160 字。');}
    if('date' in result && !validDate(result.date))throw new Error('請選擇有效日期。');
    if('minutes' in result && result.minutes!==null && (!Number.isInteger(result.minutes)||result.minutes<1||result.minutes>1440))throw new Error('預計時間需為 1–1440 分鐘，或留空。');
    for(const flag of ['complete','deleted'])if(flag in result)result[flag]=!!result[flag];
    return result;
  }
  function update(id,patch) {
    if(!saved.tasks[id])throw new Error('找不到任務。');
    patch=clean(patch);
    const task=saved.tasks[id];
    const intent=saved.pending[id] ||= {patch:{},bases:{},tokens:{}};
    for(const [field,value] of Object.entries(patch)) {
      if(!Object.hasOwn(intent.patch,field))intent.bases[field]=task._versions?.[field] || null;
      intent.patch[field]=value;intent.tokens[field]=newId();
    }
    if(patch.complete && !task.award) intent.awardDay ||= today();
    overlay(id,task);
    if(localOnly) {delete saved.pending[id];delete conflicts[id];}
    changed();void retry();
  }
  function add({title,date=today(),minutes=null,links=[]}) {
    const id=newId();
    const order=Math.max(now(),...list(date).map(task=>(task.order||0)+1024));
    const patch=clean({title,date,minutes,links,complete:false,deleted:false,order,createdAt:now()});
    saved.tasks[id]={};update(id,patch);return id;
  }
  function conflictFields(current,intent) {
    return Object.keys(intent.patch).filter(field=>(current?._versions?.[field]||null)!==intent.bases[field] &&
      current?._versions?.[field]!==intent.tokens[field] && !same(current?.[field],intent.patch[field]));
  }
  async function retry() {
    if(!db||localOnly)return;
    if(syncing){dirty=true;return;}
    syncing=true;dirty=false;
    try {
      for(const [id,original] of Object.entries(saved.pending)) {
        if(conflicts[id])continue;
        const intent=clone(original);
        const reference=db.ref(`${PLANNER_PATH}/${id}`);
        // Populate the transaction cache before checking field versions on reconnect.
        if(reference.once)await reference.once('value');
        const result=await reference.transaction(current=>{
          if(conflictFields(current,intent).length)return;
          const next={...(current||{}),...intent.patch,_versions:{...(current?._versions||{}),...intent.tokens}};
          if(intent.awardDay && !next.award)next.award={xp:20,day:intent.awardDay};
          return next;
        },undefined,false);
        const value=result.snapshot.val() || {};
        remote[id]=value;
        if(result.committed===false) {
          conflicts[id]=conflictFields(value,intent);overlay(id,value);continue;
        }
        const pending=saved.pending[id];
        if(pending) {
          for(const field of Object.keys(intent.patch)) {
            if(pending.tokens[field]===intent.tokens[field]) {
              delete pending.patch[field];delete pending.bases[field];delete pending.tokens[field];
            } else if(pending.bases[field]===intent.bases[field]) pending.bases[field]=value._versions?.[field]||null;
          }
          if(value.award)delete pending.awardDay;
          if(!Object.keys(pending.patch).length && !pending.awardDay)delete saved.pending[id];
        }
        delete conflicts[id];overlay(id,value);persist();
      }
      error='';
    } catch (failure) {error=String(failure?.code || 'NETWORK_ERROR').replace(/[^a-zA-Z_-]/g,'').slice(0,60) || 'NETWORK_ERROR';}
    finally {syncing=false;changed();if(dirty&&!error)void retry();}
  }
  function resolve(id,keepLocal) {
    const intent=saved.pending[id];if(!intent||!conflicts[id])return;
    for(const field of conflicts[id]) {
      if(keepLocal)intent.bases[field]=remote[id]?._versions?.[field]||null;
      else {delete intent.patch[field];delete intent.bases[field];delete intent.tokens[field];}
    }
    if(!Object.keys(intent.patch).length&&!intent.awardDay)delete saved.pending[id];
    delete conflicts[id];overlay(id,remote[id]||{});changed();void retry();
  }
  function list(date,includeDeleted=false) {
    return Object.entries(saved.tasks).map(([id,value])=>({id,...value})).filter(task=>task.date===date && (includeDeleted||!task.deleted)).sort((a,b)=>(a.order||0)-(b.order||0)||(a.createdAt||0)-(b.createdAt||0)||a.id.localeCompare(b.id));
  }
  function move(id,direction) {
    const tasks=list(saved.tasks[id]?.date),index=tasks.findIndex(task=>task.id===id),other=tasks[index+direction];if(!other)return;
    // Fractional position updates only the moved task, avoiding whole-list overwrites.
    const before=tasks[index+(direction<0?-2:1)],after=tasks[index+(direction<0?-1:2)];
    const position=direction<0 ? (before ? (before.order+other.order)/2 : other.order-1) : (after ? (other.order+after.order)/2 : other.order+1);
    update(id,{order:position});
  }
  const awards=()=>Object.fromEntries(Object.entries(saved.tasks).filter(([,task])=>task.award?.xp===20).map(([id,task])=>['planner__'+id,task.award]));
  if(db&&!localOnly) {
    db.ref(PLANNER_PATH).on('value',snapshot=>{
      for(const [id,value] of Object.entries(snapshot.val()||{})) {remote[id]=value;overlay(id,value);}
      changed();
    },failure=>{error=String(failure?.code||'PERMISSION_DENIED');onChange();});
    db.ref('.info/connected').on('value',snapshot=>{if(snapshot.val()===true)void retry();});
  }
  events.addEventListener('online',()=>void retry());
  events.addEventListener('storage',event=>{
    if(event.key!==key||!event.newValue)return;
    try {
      const incoming=JSON.parse(event.newValue);
      saved.tasks={...saved.tasks,...incoming.tasks};
      // Keep unsent edits from either tab; reconcile against Firebase field versions.
      for(const [id,intent] of Object.entries(incoming.pending||{})) {
        const current=saved.pending[id];
        saved.pending[id]=current?{...current,...intent,patch:{...current.patch,...intent.patch},bases:{...current.bases,...intent.bases},tokens:{...current.tokens,...intent.tokens}}:intent;
      }
      onChange();void retry();
    } catch {}
  });
  return {add,update,list,move,retry,resolve,awards,
    copy:(id,date=today())=>{const task=saved.tasks[id];if(!task)throw new Error('找不到任務。');return add({title:task.title,date,minutes:task.minutes??null,links:task.links||[]});},
    remove:id=>update(id,{deleted:true}),
    dates:()=>[...new Set(Object.values(saved.tasks).filter(task=>!task.deleted).map(task=>task.date))].sort().reverse(),
    status:()=>({error,pending:Object.keys(saved.pending).length,syncing,conflicts:clone(conflicts)}),
    get:id=>saved.tasks[id]?{id,...clone(saved.tasks[id])}:null,
    cloud:id=>clone(remote[id]||{})};
}
