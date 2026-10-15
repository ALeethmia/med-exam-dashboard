import {validDate} from './daily-planner.js';
import {dateKey} from './src/study/study-core.js';
export const COURSE_DATES_PATH='questOS/v1/courseFirstCompletion';
export const COURSE_DATES_KEY='med_exam_course_dates_v1';
// Null day is a persistent removal marker, so old awards cannot resurrect a date.
export function createCourseDates({keys,db=null,localOnly=false,storage=learningStorage,events=window,today=()=>dateKey(),onChange=()=>{},newId=()=>crypto.randomUUID(),lifecycle=null}={}) {
 // Explicit local mode initializes its Store before the Firebase-style runtime begins.
 if(localOnly)lifecycle=null;
 const storageKey=COURSE_DATES_KEY+(localOnly?'_local':'');let saved={records:{},pending:{}},busy=false;const cloud={},conflicts={};let error='',requested=false,disposed=false;const epoch=lifecycle?.read().epoch,cleanups=[];
 const valid=()=>!disposed&&(!lifecycle||lifecycle.valid(epoch));
 const ready=()=>valid()&&(!lifecycle||lifecycle.read().status==='ready');
 try{saved={...saved,...JSON.parse(storage.getItem(storageKey)||'{}')};}catch{}
 const notify=()=>{if(!valid())return;storage.setItem(storageKey,JSON.stringify(saved));onChange();};
 function set(key,day,{firstOnly=false}={}) {
  if(!valid())return;
  if(!keys.has(key)||day!==null&&(!validDate(day)||day>today()))throw new Error('請選擇有效且不晚於今天的日期。');
  if(firstOnly&&Object.hasOwn(saved.records,key))return;
  const previous=saved.pending[key],base=previous?previous.base:saved.records[key]?._version||null;
  const value={day,_version:newId()},next={records:{...saved.records,[key]:value},pending:{...saved.pending,[key]:{value,base,firstOnly}}};
  if(localOnly)delete next.pending[key];
  // Commit before exposing the date in memory or sending its transaction.
  storage.setItem(storageKey,JSON.stringify(next));saved=next;delete conflicts[key];onChange();void retry();
 }
 async function retry(){if(!db||localOnly||!ready())return;if(busy){requested=true;return;}busy=true;requested=false;
  try{for(const [key,intent] of Object.entries({...saved.pending})){
   if(!ready())return;if(conflicts[key])continue;
   const ref=db.ref(COURSE_DATES_PATH+'/'+key);if(ref.once)await ref.once('value');
   if(!ready())return;
   const result=await ref.transaction(current=>{
    if(!ready())return;
    if(intent.firstOnly&&current)return current;
    if((current?._version||null)!==intent.base&&current?._version!==intent.value._version)return;
    return intent.value;
   },undefined,false);
   if(!ready())return;
   cloud[key]=result.snapshot.val();
   if(!result.committed)conflicts[key]=true;
   else if(saved.pending[key]?.value._version===intent.value._version){delete saved.pending[key];saved.records[key]=cloud[key];}
   else if(saved.pending[key])saved.pending[key].base=cloud[key]?._version||null;
  }error='';}catch{if(valid())error='同步失敗，日期已在本機保存；不代表課程完成狀態已同步。';}finally{busy=false;notify();if(requested&&ready()){requested=false;void retry();}}
  if(!error&&ready()&&Object.keys(saved.pending).some(k=>!conflicts[k]))void retry();
 }
 function resolve(key,keepLocal){if(!ready()||!conflicts[key])return;if(keepLocal)saved.pending[key].base=cloud[key]?._version||null;else{delete saved.pending[key];if(cloud[key])saved.records[key]=cloud[key];else delete saved.records[key];}delete conflicts[key];notify();void retry();}
 function listen(ref,event,callback,cancel){ref.on(event,callback,cancel);cleanups.push(()=>ref.off?.(event,callback));}
 function on(event,callback){events.addEventListener(event,callback);cleanups.push(()=>events.removeEventListener?.(event,callback));}
 function dispose(){if(disposed)return;disposed=true;for(const cleanup of cleanups.splice(0))cleanup();}
 if(lifecycle){let previous=lifecycle.read().status;const stop=lifecycle.subscribe(state=>{if(!valid()){dispose();return;}const becameReady=state.status==='ready'&&previous!=='ready';previous=state.status;if(becameReady)void retry();});cleanups.push(stop);cleanups.push(lifecycle.track(dispose));}
 if(db&&!localOnly){listen(db.ref(COURSE_DATES_PATH),'value',s=>{if(!valid())return;const value=s.val()||{};for(const key of keys){cloud[key]=value[key]||null;if(!saved.pending[key]){if(value[key])saved.records[key]=value[key];else delete saved.records[key];}}notify();},()=>{if(valid()){error='日期同步失敗；課程完成狀態另行同步。';onChange();}});listen(db.ref('.info/connected'),'value',s=>{if(valid()&&s.val())void retry();});}
 on('online',()=>void retry());on('storage',e=>{if(!valid()||e.key!==storageKey||!e.newValue)return;try{const incoming=JSON.parse(e.newValue);for(const key of keys)if(!saved.pending[key]){if(incoming.records?.[key])saved.records[key]=incoming.records[key];else delete saved.records[key];}onChange();void retry();}catch{}});
 return {set,retry,resolve,dispose,records:()=>saved.records,status:key=>({syncing:busy,pending:!!saved.pending[key],conflict:!!conflicts[key],error})};
}
