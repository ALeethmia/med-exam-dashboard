// Local account-scoped preservation only. Never imports or writes Firebase records.
export function preserveRewardCache(storage){
 const key='med_exam_legacy_reward_quarantine_v1';let saved={};try{saved=JSON.parse(storage.getItem(key)||'{}');}catch{}
 for(const name of ['med_exam_daily_planner_v3','med_exam_time_tasks_v1','med_exam_gamification_v1']){
  const text=storage.getItem(name);if(!text)continue;let value;try{value=JSON.parse(text);}catch{continue;}
  const relevant=name.includes('planner')?Object.values(value.pending||{}).some(i=>i.awardDay):name.includes('time_tasks')?Object.values(value.pending||{}).some(i=>i.awarded):Object.keys(value.awards||{}).length>0;
  if(relevant&&!(saved[name]||[]).includes(text)){(saved[name]??=[]).push(text);storage.setItem(key,JSON.stringify(saved));}
 }
 return Object.values(saved).reduce((n,x)=>n+x.length,0);
}

// An archive of confirmed awards is history, not an unresolved reward intent.
// Read the existing UID-scoped evidence without deleting or acknowledging it.
export function rewardNoticeText({initialized=false,held=0,preservedRewards=0,legacyKeys=0,storage}={}){
 let review=held>0;
 if(initialized){
  try{
   const saved=JSON.parse(storage.getItem('med_exam_legacy_reward_quarantine_v1')||'{}');
   if(!saved||typeof saved!=='object'||Array.isArray(saved))throw Error('invalid reward archive');
   for(const [name,entries] of Object.entries(saved)){
    if(!Array.isArray(entries))throw Error('invalid reward archive');
    for(const text of entries){
     const value=JSON.parse(text);
     if(!value||typeof value!=='object'||Array.isArray(value))throw Error('invalid reward evidence');
     if(value.pending!=null&&(typeof value.pending!=='object'||Array.isArray(value.pending)))throw Error('invalid reward intents');
     if(name==='med_exam_daily_planner_v3')review ||= Object.values(value.pending||{}).some(i=>i?.awardDay);
     else if(name==='med_exam_time_tasks_v1')review ||= Object.values(value.pending||{}).some(i=>i?.awarded);
     else if(name!=='med_exam_gamification_v1')throw Error('unknown reward evidence');
    }
   }
  }catch{review=true;}
  if(!review)return '';
 }else review ||= preservedRewards>0||legacyKeys>0;
 return '歷史 XP 僅供回顧，不影響領主等級。'+(review?'偵測到舊獎勵紀錄，已隔離保留，未自動補發；需人工核對。':'新任務不再發放 XP。');
}
