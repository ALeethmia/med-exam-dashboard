import {validDate} from './daily-planner.js';
import {dateKey} from './study-core.js';
export const COURSE_DATES_PATH='questOS/v1/courseFirstCompletion';
export const COURSE_DATES_KEY='med_exam_course_dates_v1';
// Null day is a persistent removal marker, so old awards cannot resurrect a date.
export function createCourseDates({keys,db=null,localOnly=false,storage=learningStorage,events=window,today=()=>dateKey(),onChange=()=>{},newId=()=>crypto.randomUUID()}={}) {
 const storageKey=COURSE_DATES_KEY+(localOnly?'_local':'');let saved={records:{},pending:{}},busy=false;const cloud={},conflicts={};let error='';
 try{saved={...saved,...JSON.parse(storage.getItem(storageKey)||'{}')};}catch{}
 const notify=()=>{storage.setItem(storageKey,JSON.stringify(saved));onChange();};
 function set(key,day,{firstOnly=false}={}) {
  if(!keys.has(key)||day!==null&&(!validDate(day)||day>today()))throw new Error('請選擇有效且不晚於今天的日期。');
  if(firstOnly&&Object.hasOwn(saved.records,key))return;
  const previous=saved.pending[key],base=previous?previous.base:saved.records[key]?._version||null;
  const value={day,_version:newId()};saved.records[key]=value;saved.pending[key]={value,base,firstOnly};delete conflicts[key];
  if(localOnly)delete saved.pending[key];notify();void retry();
 }
 async function retry(){if(!db||localOnly||busy)return;busy=true;
  try{for(const [key,intent] of Object.entries({...saved.pending})){
   if(conflicts[key])continue;
   const ref=db.ref(COURSE_DATES_PATH+'/'+key);if(ref.once)await ref.once('value');
   const result=await ref.transaction(current=>{
    if(intent.firstOnly&&current)return current;
    if((current?._version||null)!==intent.base&&current?._version!==intent.value._version)return;
    return intent.value;
   },undefined,false);
   cloud[key]=result.snapshot.val();
   if(!result.committed)conflicts[key]=true;
   else if(saved.pending[key]?.value._version===intent.value._version){delete saved.pending[key];saved.records[key]=cloud[key];}
   else if(saved.pending[key])saved.pending[key].base=cloud[key]?._version||null;
  }error='';}catch{error='同步失敗，日期已在本機保存。';}finally{busy=false;notify();}
  if(!error&&Object.keys(saved.pending).some(k=>!conflicts[k]))void retry();
 }
 function resolve(key,keepLocal){if(!conflicts[key])return;if(keepLocal)saved.pending[key].base=cloud[key]?._version||null;else{delete saved.pending[key];if(cloud[key])saved.records[key]=cloud[key];else delete saved.records[key];}delete conflicts[key];notify();void retry();}
 if(db&&!localOnly){db.ref(COURSE_DATES_PATH).on('value',s=>{const value=s.val()||{};for(const key of keys){cloud[key]=value[key]||null;if(!saved.pending[key]){if(value[key])saved.records[key]=value[key];else delete saved.records[key];}}notify();},()=>{error='日期同步失敗';onChange();});db.ref('.info/connected').on('value',s=>{if(s.val())void retry();});}
 events.addEventListener('online',()=>void retry());events.addEventListener('storage',e=>{if(e.key!==storageKey||!e.newValue)return;try{const incoming=JSON.parse(e.newValue);for(const key of keys)if(!saved.pending[key]){if(incoming.records?.[key])saved.records[key]=incoming.records[key];else delete saved.records[key];}onChange();void retry();}catch{}});
 return {set,retry,resolve,records:()=>saved.records,status:key=>({syncing:busy,pending:!!saved.pending[key],conflict:!!conflicts[key],error})};
}
