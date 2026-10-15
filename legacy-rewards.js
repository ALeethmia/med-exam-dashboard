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
