import {subjectStats,flattenSubjects,awardKey} from './study-core.js';
import {TYPES} from './life-core.js';
import {validDate} from './daily-planner.js';
export const ACADEMY_STAGES=['研究營地','符文書庫','奧術學院','高等學院','大奧術學院'];
export const BARRACKS_STAGES=['訓練空地','木造訓練場','皇家兵營','衛隊駐地','皇家訓練基地'];
export const KEEP_STAGES=['邊境營地','燈火據點','石築要塞','守望城堡','學者之城'];
export const COURSE_THRESHOLDS=[0,5,20,50,85];
export const TRAINING_THRESHOLDS=[0,3,8,16,30];
const romans=['I','II','III','IV','V'];
const usable=(date,day)=>validDate(date)&&date<=day;
// Dates are record dates, not inferred actual study/training timestamps. Awards are never read.
export function realmEvidenceSnapshot({data,states,habits={},courseDates={},day}) {
 const subjects=subjectStats(data,states),done=subjects.reduce((n,s)=>n+s.done,0),total=subjects.reduce((n,s)=>n+s.total,0);
 const events=new Map(),training=[],leisure=[];let ambiguousTraining=0;
 for(const unit of new Map(flattenSubjects(data).map(unit=>[awardKey(unit),unit])).values()){
  const key=awardKey(unit),record=courseDates[key],complete=!!states[unit.path]?.[unit.id];
  const dated=usable(record?.day,day);
  if(dated||complete)events.set('course:'+key,{id:'course:'+key,date:dated?record.day:null,category:'academy',title:dated?'課程首次完成日期':'目前已完成課程',original:unit.subject+' · '+unit.title,source:dated?'courseFirstCompletion 的首次日期（可手動修正）':'目前課程勾選；沒有有效首次日期',detail:complete?'目前勾選完成':'目前未勾選完成；保留首次日期紀錄'});
 }
 for(const [date,value] of Object.entries(habits)){
  if(!usable(date,day)||!value)continue;
  const exercise=value.questOS_v1?.exercise,rest=value.questOS_v1?.leisure;
  const positive=exercise&&['complete','alternative'].includes(exercise.status);
  const ambiguous=positive&&['rest','none'].includes(exercise.type);if(ambiguous)ambiguousTraining++;
  const validExercise=exercise?positive&&!ambiguous:value['daily-sport']===true;
  if(validExercise){training.push(date);events.set('exercise:'+date,{id:'exercise:'+date,date,category:'barracks',title:exercise?.status==='alternative'?'低強度替代訓練':'有效訓練紀錄',original:exercise?(TYPES[exercise.type]||'運動（類型未記錄）'):'舊運動打卡',source:exercise?'habits 日期下的 exercise 完成狀態；非實際完成時刻':'habits 日期下 daily-sport=true 舊打卡',detail:'每日期最多計一次；不重複計入舊打卡或歷史菜單'});}
  const validLeisure=rest?rest.status==='complete':value['daily-game']===true;
  if(validLeisure){leisure.push(date);events.set('leisure:'+date,{id:'leisure:'+date,date,category:'keep',title:'休閒與恢復紀錄',original:rest?(rest.title||'休閒（名稱未記錄）'):'休閒（舊打卡）',source:rest?'habits 日期下的 leisure 完成狀態；非連續登入':'habits 日期下 daily-game=true 舊打卡',detail:'只計已有完成紀錄，不依活動時間給予額外成長'});}
 }
 return {courses:{done,total,percent:total?Math.round(done/total*100):0},training:training.length,ambiguousTraining,legacyTraining:training.filter(date=>!habits[date].questOS_v1?.exercise).length,leisure:leisure.length,activityDays:new Set([...training,...leisure]).size,events:[...events.values()]};
}
export function buildingProgressSnapshot(input) {
 const evidence=realmEvidenceSnapshot(input),{done,total}=evidence.courses;
 const required=percent=>Math.ceil(total*percent/100),courseMet=percent=>total>0&&done>=required(percent);
 const courseGap=percent=>total?`課程 ${required(percent)} 單元（${percent}%），尚差 ${Math.max(0,required(percent)-done)} 單元`:'尚無課程資料，無法判定課程門檻';
 const decorate=(id,names,index,reason,next,metric,progress)=>({id,stage:index+1,roman:romans[index],name:names[index],reason,next,metric,progress:Math.min(100,progress),currentOnly:true});
 let ai=0,bi=0,ki=0;for(let i=1;i<5;i++){if(courseMet(COURSE_THRESHOLDS[i]))ai=i;if(evidence.training>=TRAINING_THRESHOLDS[i])bi=i;}
 // Study-only OR existing cross-domain milestones. No daily triple checks or streaks.
 const keepMet=i=>courseMet(COURSE_THRESHOLDS[i])||(i===1?evidence.activityDays>=3:courseMet(COURSE_THRESHOLDS[i-1])&&evidence.activityDays>=TRAINING_THRESHOLDS[i]);
 for(let i=1;i<5;i++)if(keepMet(i))ki=i;
 const keepConditions=i=>[courseGap(COURSE_THRESHOLDS[i]),i===1?`運動／休閒有效日 3 天，尚差 ${Math.max(0,3-evidence.activityDays)} 天`:`${courseGap(COURSE_THRESHOLDS[i-1])}，以及運動／休閒有效日 ${TRAINING_THRESHOLDS[i]} 天，尚差 ${Math.max(0,TRAINING_THRESHOLDS[i]-evidence.activityDays)} 天`];
 const academy=decorate('academy',ACADEMY_STAGES,ai,ai?`目前完成 ${done} / ${total} 單元，達到 ${COURSE_THRESHOLDS[ai]}% 的實際單元門檻`:'研究營地從現有學習進度起步',ai===4?[]:[courseGap(COURSE_THRESHOLDS[ai+1])],`課程 ${done} / ${total} 單元 · ${evidence.courses.percent}%`,total?(ai===4?100:done/required(COURSE_THRESHOLDS[ai+1])*100):0);
 const barracks=decorate('barracks',BARRACKS_STAGES,bi,bi?`已載入日期紀錄中有 ${evidence.training} 次有效訓練，達到 ${TRAINING_THRESHOLDS[bi]} 次門檻`:'訓練空地從已有完成證據起步',bi===4?[]:[`有效訓練 ${TRAINING_THRESHOLDS[bi+1]} 次，尚差 ${Math.max(0,TRAINING_THRESHOLDS[bi+1]-evidence.training)} 次`],`可驗證訓練下限 ${evidence.training} 次`,bi===4?100:evidence.training/TRAINING_THRESHOLDS[bi+1]*100);
 // Each route exposes its own AND requirements; a shared percentage hides the limiting condition.
 const courseRequirement=percent=>({kind:'courses',label:`課程單元（${percent}% 門檻，向上取整）`,actual:done,required:required(percent),gap:Math.max(0,required(percent)-done),unit:'單元',available:total>0,met:courseMet(percent),progress:total?Math.min(100,done/required(percent)*100):0});
 const activityRequirement=count=>({kind:'activityDays',label:'運動／休閒有效日（同日只計一次）',actual:evidence.activityDays,required:count,gap:Math.max(0,count-evidence.activityDays),unit:'天',available:true,met:evidence.activityDays>=count,progress:Math.min(100,evidence.activityDays/count*100)});
 const route=(id,label,index,requirements)=>({id,label,stage:index+1,roman:romans[index],name:KEEP_STAGES[index],requirements,met:requirements.every(r=>r.met),progress:Math.min(...requirements.map(r=>r.progress))});
 const keepPaths=index=>[
  route('study','純學習路徑',index,[courseRequirement(COURSE_THRESHOLDS[index])]),
  route('cross','跨領域路徑',index,index===1?[activityRequirement(3)]:[courseRequirement(COURSE_THRESHOLDS[index-1]),activityRequirement(TRAINING_THRESHOLDS[index])])
 ];
 const currentPaths=ki?keepPaths(ki):[],nextPaths=ki===4?[]:keepPaths(ki+1),metRoutes=currentPaths.filter(path=>path.met).map(path=>path.id);
 const keepReason=ki?`目前 ${romans[ki]} 階段達標路徑：${currentPaths.filter(path=>path.met).map(path=>path.label).join('、')}。條件依目前資料判定。`:'邊境營地為初始階段，尚未達到升級門檻；可選任一路徑累積。';
 const keep={id:'keep',stage:ki+1,roman:romans[ki],name:KEEP_STAGES[ki],reason:keepReason,next:ki===4?[]:keepConditions(ki+1),metric:`課程 ${done} 單元 · 運動／休閒 ${evidence.activityDays} 個有效日`,currentOnly:true,currentPaths,nextPaths,metRoutes};
 return {academy,barracks,keep,evidence};
}
export function territoryMilestoneSnapshot(buildings){return ['academy','barracks','keep'].map(id=>buildings[id]).filter(b=>b.stage>1).map(b=>({id:'milestone:'+b.id+':'+b.stage,date:null,category:b.id,title:`目前達標：${b.roman} · ${b.name}`,original:b.metric,source:'依目前完成狀態與已載入日期紀錄推導，無歷史解鎖時間',detail:b.reason+'；非永久解鎖紀錄'}));}
export function realmActivitySnapshot(buildings){const events=new Map([...buildings.evidence.events,...territoryMilestoneSnapshot(buildings)].map(event=>[event.id,event]));return [...events.values()].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||a.id.localeCompare(b.id));}
export function realmActivityGroups(buildings){const events=realmActivitySnapshot(buildings);return {dated:events.filter(event=>event.date),undated:events.filter(event=>!event.date&&!event.id.startsWith('milestone:')),milestones:events.filter(event=>event.id.startsWith('milestone:'))};}
