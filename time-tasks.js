// Time goals are self-reported; they never change course completion records.
export const TIME_TASKS=[
  {id:'morning',title:'上午讀書 2 小時',hours:2},
  {id:'afternoon',title:'下午讀書 2 小時',hours:2},
  {id:'review',title:'複習 1 小時',hours:1}
];
const KEY='med_exam_time_tasks_v1', PATH='gamification/v2/timeTasks';
export function createTimeTasks({db,localOnly,day,onChange}) {
  let saved={days:{},pending:{}};
  try { const parsed=JSON.parse(localStorage.getItem(KEY)||'{}');saved={days:parsed.days||{},pending:parsed.pending||{}}; } catch {}
  saved.days[day] ||= {};
  const records=()=>saved.days[day];
  const persist=()=>localStorage.setItem(KEY,JSON.stringify(saved));
  const merge=(id,remote)=>{const local=records()[id]||{};records()[id]={...remote,...(saved.pending[day+'__'+id]?local:{}),awarded:!!(local.awarded||remote?.awarded)};};
  let syncing=false,dirty=false,failed=false;
  async function retry() {
    if(!db||localOnly)return;
    if(syncing){dirty=true;return;}
    syncing=true;dirty=false;
    try {
      for(const [key,intent] of Object.entries(saved.pending)) {
        const match=key.match(/^(\d{4}-\d{2}-\d{2})__(morning|afternoon|review)$/);if(!match)continue;
        const [,date,id]=match;
        const result=await db.ref(`${PATH}/${date}/${id}`).transaction(existing=>({
          ...(existing||{}),complete:!!intent.complete,awarded:!!(existing?.awarded||intent.awarded),hours:TIME_TASKS.find(t=>t.id===id).hours
        }));
        if(saved.pending[key]===intent){delete saved.pending[key];(saved.days[date] ||= {})[id]=result.snapshot.val();}
        else dirty=true;
        persist();
      }failed=false;
    } catch {failed=true;} finally {syncing=false;onChange();if(dirty&&!failed)void retry();}
  }
  function set(id,complete) {
    if(!TIME_TASKS.some(t=>t.id===id))return;
    records()[id]={...records()[id],complete,awarded:!!(records()[id]?.awarded||complete)};
    if(db&&!localOnly)saved.pending[day+'__'+id]={...records()[id]};
    persist();onChange();void retry();
  }
  function awards() {
    const result={};
    for(const [date,items] of Object.entries(saved.days))for(const task of TIME_TASKS)if(items?.[task.id]?.awarded)result[`time__${date}__${task.id}`]={xp:20,day:date};
    return result;
  }
  if(db&&!localOnly)db.ref(PATH).on('value',snapshot=>{
    for(const [date,items] of Object.entries(snapshot.val()||{})) {
      saved.days[date] ||= {};
      for(const task of TIME_TASKS)if(items?.[task.id]) {
        if(date===day)merge(task.id,items[task.id]);
        else if(!saved.pending[date+'__'+task.id])saved.days[date][task.id]=items[task.id];
      }
    }persist();onChange();
  },()=>{failed=true;onChange();});
  window.addEventListener('storage',event=>{
    if(event.key!==KEY||!event.newValue)return;
    try {const incoming=JSON.parse(event.newValue);saved.days={...saved.days,...incoming.days};saved.pending={...saved.pending,...incoming.pending};onChange();}catch{}
  });
  return {set,retry,awards,tasks:()=>TIME_TASKS.map(t=>({...t,complete:!!records()[t.id]?.complete,awarded:!!records()[t.id]?.awarded})),failed:()=>failed};
}
