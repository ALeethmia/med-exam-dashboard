import {taskKind} from './task-projection.js';
import {dateKey} from './study-core.js';
export const PLANNER_PATH = 'gamification/v3/planner/tasks';
export const PLANNER_KEY = 'med_exam_daily_planner_v3';
const fields = ['title','date','minutes','links','complete','deleted','order','createdAt','planning'];
const clone = value => JSON.parse(JSON.stringify(value));
export const planningLocked=task=>!!(task?.locked||task?.planning?.locked||task?.planning?.fixedId);
const canonical=value=>{if(Array.isArray(value))return value.length?value.map(canonical):null;if(value&&typeof value==='object'){const pairs=Object.keys(value).sort().filter(k=>k!=='_versions'&&k!=='_version').map(k=>[k,canonical(value[k])]).filter(([,v])=>v!==null);return pairs.length?Object.fromEntries(pairs):null;}return value??null;};
export const planningSnapshotSame=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const same = (a,b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
export function validDate(value) {
  const parsed=new Date(value+'T12:00:00Z');
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
}
export function createPlanner({db=null,localOnly=false,storage=learningStorage,events=window,onChange=()=>{},newId=()=>crypto.randomUUID(),today=()=>dateKey(),now=()=>Date.now(),batchContext=()=>null,readBatchContext=async()=>batchContext(),validateTask=()=>{},projectTask=task=>task,canOperate=()=>true}={}) {
  const key=PLANNER_KEY+(localOnly?'_local':'');
  let saved={tasks:{},pending:{},batch:null};
  try {const value=JSON.parse(storage.getItem(key)||'{}');saved={tasks:value.tasks||{},pending:value.pending||{},batch:value.batch||null};} catch {}
  const remote={}, conflicts={};
  const held=id=>!!saved.pending[id]?.awardDay||(Object.hasOwn(saved.pending[id]?.patch||{},'complete')&&taskKind(saved.tasks[id])!=='general');
  const effective=task=>projectTask(task);
  const incomplete=task=>effective(task).completionKnown!==false&&effective(task).complete!==true;
  let batchCommitting=false;
  let syncing=false,dirty=false,error='';
  const persist=()=>storage.setItem(key,JSON.stringify(saved));
  const changed=()=>{persist();onChange();};
  function overlay(id,value) {
    const intent=saved.pending[id];
    saved.tasks[id]={...value,...(intent?.patch||{}),...(saved.batch?.changes[id]||{})};
    // Historical reward intents are preserved but never projected as newly earned XP.
  }
  function clean(patch) {
    const result={};
    for(const field of fields) if(Object.hasOwn(patch,field))result[field]=patch[field];
    if('title' in result) {result.title=String(result.title).trim();if(!result.title || result.title.length>160)throw new Error('任務名稱需為 1–160 字。');}
    if('date' in result && !validDate(result.date))throw new Error('請選擇有效日期。');
    if('minutes' in result && result.minutes!==null && (!Number.isInteger(result.minutes)||result.minutes<1||result.minutes>1440))throw new Error('預計時間需為 1–1440 分鐘，或留空。');
    for(const flag of ['complete','deleted'])if(flag in result)result[flag]=!!result[flag];
    if('planning' in result) {
      const p=result.planning;
      if(!p||p.version!==1||!['core','normal','flexible'].includes(p.priority||'normal')||('originalDate' in p&&!validDate(p.originalDate)))throw new Error('任務排程設定無效。');
      for(const flag of ['locked','waiting'])if(flag in p&&typeof p[flag]!=='boolean')throw new Error('任務排程狀態無效。');
      if(p.start||p.end){const minute=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v||'')?Number(v.slice(0,2))*60+Number(v.slice(3)):null;const a=minute(p.start),b=minute(p.end);if(a===null||b===null||b<=a)throw new Error('任務時段需在同一天，結束須晚於開始。');}
    }
    return result;
  }
  function update(id,patch) {
    if(!canOperate())throw new Error('資料尚未就緒，未更動任務。');
    if(held(id))throw new Error('舊待同步獎勵意圖已保留，請先核對。');
    if(!saved.tasks[id])throw new Error('找不到任務。');
    if(saved.batch?.changes[id])throw new Error('此任務的整批排程待同步，請先完成或撤回排程。');
    patch=clean(patch);
    if(Object.hasOwn(patch,'complete')&&taskKind(saved.tasks[id])!=='general'&&Object.keys(saved.tasks[id]).length)throw new Error('課程型任務依課程進度，不另寫完成狀態。');
    const task=saved.tasks[id];
    if(planningLocked(task)&&(('date' in patch&&patch.date!==task.date)||patch.deleted||patch.planning?.waiting))throw new Error('鎖定任務不可延期、刪除或移入待安排區。');
    validateTask({...task,...patch,id});
    const intent=saved.pending[id] ||= {patch:{},bases:{},tokens:{}};
    for(const [field,value] of Object.entries(patch)) {
      if(!Object.hasOwn(intent.patch,field))intent.bases[field]=task._versions?.[field] || null;
      intent.patch[field]=value;intent.tokens[field]=newId();
    }
    // No new task XP in this growth system.
    overlay(id,task);
    if(localOnly) {delete saved.pending[id];delete conflicts[id];}
    changed();void retry();
  }
  function add({title,date=today(),minutes=null,links=[],planning}) {
    const id=newId();
    const order=Math.max(now(),...list(date).map(task=>(task.order||0)+1024));
    const patch=clean({title,date,minutes,links,...(Array.isArray(links)&&links.length?{}:{complete:false}),deleted:false,order,createdAt:now(),...(planning?{planning}:{})});
    saved.tasks[id]={};try{update(id,patch);}catch(error){delete saved.tasks[id];throw error;}return id;
  }
  function batch(changes,{expected=snapshot(),context=batchContext()}={}) {
    if(!canOperate())throw new Error('資料尚未就緒。');
    if(saved.batch)throw new Error('請先完成或撤回上一批排程。');
    if(!planningSnapshotSame(saved.tasks,expected)||!planningSnapshotSame(batchContext(),context))throw new Error('任務、容量或行程已更新，請重新預覽。');
    const patches={};
    for(const [id,input] of Object.entries(changes)) {
      const task=saved.tasks[id];if(!task||!incomplete(task)||task.deleted||planningLocked(task))throw new Error('已完成、刪除或鎖定的任務不可重新排程。');
      if(Object.keys(input).some(field=>!['date','planning','minutes'].includes(field)))throw new Error('整批排程只能修改日期、估時與排程 metadata。');
      patches[id]=clean(input);validateTask({...task,...patches[id],id},{batch:true});
    }
    if(!Object.keys(patches).length)throw new Error('沒有可套用的任務變更。');
    saved.batch={token:newId(),changes:patches,expected:clone(expected),context:clone(context),conflict:false};
    for(const id of Object.keys(patches))overlay(id,saved.tasks[id]);
    if(localOnly)saved.batch=null;changed();void retry();
  }
  function discardBatch() {
    if(batchCommitting)throw new Error('正在提交整批排程，請等待結果。');
    const intent=saved.batch;if(!intent)return;saved.batch=null;
    for(const id of Object.keys(intent.changes)){const base=remote[id]||intent.expected[id];if(base)overlay(id,base);else delete saved.tasks[id];}
    error='';changed();
  }
  function snapshot() {return clone(saved.tasks);}
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
        if(conflicts[id]||held(id))continue;
        const intent=clone(original);
        const reference=db.ref(`${PLANNER_PATH}/${id}`);
        // Populate the transaction cache before checking field versions on reconnect.
        if(reference.once)await reference.once('value');
        const result=await reference.transaction(current=>{
          if(conflictFields(current,intent).length)return;
          const next={...(current||{}),...intent.patch,_versions:{...(current?._versions||{}),...intent.tokens}};
          // Existing next.award is untouched; no reward minting or legacy replay.
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
          // No clearing of historical award intents.
          if(!Object.keys(pending.patch).length && !pending.awardDay)delete saved.pending[id];
        }
        delete conflicts[id];overlay(id,value);persist();
      }
      if(saved.batch&&!saved.batch.conflict&&!Object.keys(saved.pending).length) {
        const intent=clone(saved.batch);
        const context=await readBatchContext();
        if(saved.batch?.token!==intent.token)return;
        if(!planningSnapshotSame(context,intent.context)){saved.batch.conflict=true;changed();return;}
        const reference=db.ref(PLANNER_PATH);if(reference.once)await reference.once('value');
        if(saved.batch?.token!==intent.token)return;
        batchCommitting=true;
        const result=await reference.transaction(current=>{
          if(saved.batch?.token!==intent.token)return;
          const records=current||{};
          if(Object.entries(intent.changes).every(([id,patch])=>Object.entries(patch).every(([field,value])=>records[id]?._versions?.[field]===intent.token&&planningSnapshotSame(records[id]?.[field],value))))return records;
          // One root transaction guards all selected tasks AND the occupancy used by preview.
          if(!planningSnapshotSame(records,intent.expected)||!planningSnapshotSame(batchContext(),intent.context))return;
          const next=clone(records);
          for(const [id,patch] of Object.entries(intent.changes)) {
            if(!next[id]||!incomplete(next[id])||next[id].deleted||planningLocked(next[id]))return;
            next[id]={...next[id],...patch,_versions:{...(next[id]._versions||{}),...Object.fromEntries(Object.keys(patch).map(field=>[field,intent.token]))}};
          }
          return next;
        },undefined,false);
        const records=result.snapshot.val()||{};
        for(const [id,value] of Object.entries(records))remote[id]=value;
        if(result.committed){saved.batch=null;for(const [id,value] of Object.entries(records))overlay(id,value);}
        else saved.batch.conflict=true;
      }
      error='';
    } catch (failure) {error=String(failure?.code || 'NETWORK_ERROR').replace(/[^a-zA-Z_-]/g,'').slice(0,60) || 'NETWORK_ERROR';}
    finally {batchCommitting=false;syncing=false;changed();if(dirty&&!error)void retry();}
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
    return Object.entries(saved.tasks).map(([id,value])=>effective({id,...value})).filter(task=>task.date===date && !task.planning?.waiting && (includeDeleted||!task.deleted)).sort((a,b)=>(a.order||0)-(b.order||0)||(a.createdAt||0)-(b.createdAt||0)||a.id.localeCompare(b.id));
  }
  function move(id,direction) {
    const tasks=list(saved.tasks[id]?.date),index=tasks.findIndex(task=>task.id===id),other=tasks[index+direction];if(!other)return;
    // Fractional position updates only the moved task, avoiding whole-list overwrites.
    const before=tasks[index+(direction<0?-2:1)],after=tasks[index+(direction<0?-1:2)];
    const position=direction<0 ? (before ? (before.order+other.order)/2 : other.order-1) : (after ? (other.order+after.order)/2 : other.order+1);
    update(id,{order:position});
  }
  const awards=()=>Object.fromEntries(Object.entries(db&&!localOnly?remote:saved.tasks).filter(([,task])=>task.award?.xp===20).map(([id,task])=>['planner__'+id,task.award]));
  if(db&&!localOnly) {
    db.ref(PLANNER_PATH).on('value',snapshot=>{
      const incoming=snapshot.val()||{};for(const id of Object.keys(remote))if(!Object.hasOwn(incoming,id))delete remote[id];for(const id of Object.keys(saved.tasks))if(!Object.hasOwn(incoming,id)&&!saved.pending[id]&&!saved.batch?.changes[id])delete saved.tasks[id];
      for(const [id,value] of Object.entries(incoming)) {remote[id]=value;overlay(id,value);}
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
      if(!saved.batch)saved.batch=incoming.batch||null;
      for(const id of Object.keys(saved.batch?.changes||{}))overlay(id,saved.tasks[id]);
      // Keep unsent edits from either tab; reconcile against Firebase field versions.
      for(const [id,intent] of Object.entries(incoming.pending||{})) {
        const current=saved.pending[id];
        saved.pending[id]=current?{...current,...intent,patch:{...current.patch,...intent.patch},bases:{...current.bases,...intent.bases},tokens:{...current.tokens,...intent.tokens}}:intent;
      }
      onChange();void retry();
    } catch {}
  });
  return {add,update,list,move,retry,resolve,awards,batch,discardBatch,snapshot,all:()=>Object.entries(saved.tasks).map(([id,t])=>effective({id,...clone(t)})),historicalAll:()=>Object.entries(saved.tasks).map(([id,t])=>({id,...clone(t)})),
    copy:(id,date=today())=>{const task=saved.tasks[id];if(!task)throw new Error('找不到任務。');return add({title:task.title,date,minutes:task.minutes??null,links:task.links||[]});},
    remove:id=>update(id,{deleted:true}),
    dates:()=>[...new Set(Object.values(saved.tasks).filter(task=>!task.deleted&&!task.planning?.waiting).map(task=>task.date))].sort().reverse(),
    status:()=>({held:Object.keys(saved.pending).filter(held),error,pending:Object.keys(saved.pending).length+(saved.batch?1:0),syncing,conflicts:clone(conflicts),batch:saved.batch?{conflict:saved.batch.conflict,committing:batchCommitting,count:Object.keys(saved.batch.changes).length,ids:Object.keys(saved.batch.changes)}:null}),
    get:id=>saved.tasks[id]?effective({id,...clone(saved.tasks[id])}):null,
    cloud:id=>clone(remote[id]||{})};
}
