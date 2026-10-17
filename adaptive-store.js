import {defaultStudySettings,BIOCHEM_SLOTS,interval} from './src/planner/adaptive-core.js';
import {validDate} from './daily-planner.js';
export const STUDY_SETTINGS_PATH='questOS/v1/adaptiveStudy/settings';
export const STUDY_SETTINGS_KEY='med_exam_adaptive_study_v1';
export function normalizeSettings(value={}) {return {...defaultStudySettings(),...value,dateMinutes:value?.dateMinutes||{},fixedOverrides:value?.fixedOverrides||{}};}
export function validateSettings(value) {
  const c=normalizeSettings(value);
  if(c.dailyTaskLimit!=null&&(!Number.isInteger(c.dailyTaskLimit)||c.dailyTaskLimit<1||c.dailyTaskLimit>100))throw new Error('每日任務上限需為 1–100 或留空。');
  if(!validDate(c.examDate))throw new Error('考試日期無效。');
  if(!Array.isArray(c.weekMinutes)||c.weekMinutes.length!==7||c.weekMinutes.some(n=>!Number.isInteger(n)||n<0||n>1440))throw new Error('每日總學習容量需為 0–1440 分鐘。');
  if(!Number.isInteger(c.bufferPercent)||c.bufferPercent<0||c.bufferPercent>80)throw new Error('緩衝比例需為 0–80%。');
  for(const [day,n] of Object.entries(c.dateMinutes))if(!validDate(day)||!Number.isInteger(n)||n<0||n>1440)throw new Error('個別日期容量無效。');
  for(const [id,slot] of Object.entries(c.fixedOverrides))if(!/^biochem-class-[1-8]$/.test(id)||!validDate(slot.date)||!interval(slot.start,slot.end))throw new Error('固定課程日期或時段無效。');
  return c;
}
export function createStudySettings({db=null,localOnly=false,storage=learningStorage,events=window,onChange=()=>{},newId=()=>crypto.randomUUID()}={}) {
  const key=STUDY_SETTINGS_KEY+(localOnly?'_local':'');let saved={config:null,pending:null},cloud=null,syncing=false,requested=false,error='',conflict=false;
  try{saved={...saved,...JSON.parse(storage.getItem(key)||'{}')};}catch{}
  const config=()=>normalizeSettings(saved.config||{});
  const content=c=>JSON.stringify({...normalizeSettings(c||{}),_version:null});
  const notify=()=>{storage.setItem(key,JSON.stringify(saved));onChange();};
  function set(patch,{expected=null}={}) {
    if(expected&&content(config())!==content(expected))throw new Error('設定已更新，請重新開啟查看。');
    const value=validateSettings({...config(),...patch});
    saved.pending={value,base:saved.pending?saved.pending.base:saved.config?._version||null,token:newId()};saved.config=value;
    if(localOnly)saved.pending=null;conflict=false;notify();void retry();
  }
  function setFixed(id,slot,{confirmed=false,expected=null}={}) {
    if(!confirmed)throw new Error('請確認手動修改固定課程；動態排程器不能修改它。');
    const allowed={date:slot.date,start:slot.start,end:slot.end};set({fixedOverrides:{...config().fixedOverrides,[id]:allowed}},{expected});
  }
  async function retry() {
    if(!db||localOnly||!saved.pending||conflict||db.canWrite&&!db.canWrite())return;
    if(syncing){requested=true;return;}
    requested=false;syncing=true;const intent=JSON.parse(JSON.stringify(saved.pending));
    try {
      const ref=db.ref(STUDY_SETTINGS_PATH);if(ref.once)await ref.once('value');
      const result=await ref.transaction(current=>{
        if((current?._version||null)!==intent.base&&current?._version!==intent.token&&content(current)!==content(intent.value))return;
        return {...(current||{}),...intent.value,_version:intent.token};
      },undefined,false);
      cloud=result.snapshot.val();
      if(!result.committed)conflict=true;
      else if(saved.pending?.token===intent.token){saved.pending=null;saved.config=cloud;}
      else if(saved.pending){saved.pending.base=cloud?._version||null;}
      error='';
    }catch(e){error=String(e?.code||'NETWORK_ERROR').replace(/[^a-zA-Z_-]/g,'').slice(0,60);}
    finally{syncing=false;notify();if(requested&&(!db.canWrite||db.canWrite())){requested=false;void retry();}}
    if(saved.pending&&!conflict&&!error)void retry();
  }
  function resolve(keepLocal) {if(!conflict)return;if(keepLocal)saved.pending.base=cloud?._version||null;else{saved.pending=null;saved.config=cloud;}conflict=false;notify();void retry();}
  if(db&&!localOnly){db.ref(STUDY_SETTINGS_PATH).on('value',s=>{cloud=s.val();if(!saved.pending)saved.config=cloud;notify();},e=>{error=e?.code||'PERMISSION_DENIED';onChange();});db.ref('.info/connected').on('value',s=>{if(s.val())void retry();});}
  events.addEventListener('online',()=>void retry());events.addEventListener('storage',e=>{if(e.key!==key||!e.newValue)return;try{const other=JSON.parse(e.newValue);if(!saved.pending)saved=other;onChange();void retry();}catch{}});
  return {config,set,setFixed,retry,resolve,status:()=>({syncing,error,conflict,pending:!!saved.pending}),cloud:()=>normalizeSettings(cloud||{}),slots:BIOCHEM_SLOTS};
}
