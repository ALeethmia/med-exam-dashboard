import {dateKey,weekKey} from './study-core.js';
export const TYPES={walk:'平地步行',seated:'坐姿肌力',rest:'休息與恢復',none:'未安排'};
export const STATUS={pending:'尚未完成',complete:'正常完成',alternative:'低強度替代完成',symptom_rest:'症狀休息',not_scheduled:'未安排'};
export const MENU_VERSION=2;
export const STAGES=[
  {id:1,title:'適應與穩定',weeks:'第 1–2 週',walk:5,seatedMinutes:8,sets:1,reps:[10,8,8,10],description:'四個坐姿動作，先熟悉動作與舒適節奏。步行可分段。'},
  {id:2,title:'建立規律',weeks:'第 3–4 週',walk:8,seatedMinutes:10,sets:1,reps:[12,10,10,12],march:6,description:'小幅增加次數，加入有椅背支撐的坐姿抬膝。'},
  {id:3,title:'緩慢增加',weeks:'第 5–6 週',walk:10,seatedMinutes:12,sets:2,reps:[10,8,8,10],march:8,description:'四個基礎動作分成兩組，單組次數減量，組間充分休息。'},
  {id:4,title:'維持與鞏固',weeks:'第 7–8 週',walk:12,seatedMinutes:15,sets:2,reps:[12,10,10,12],march:10,description:'維持兩組，少量增加次數與步行時間，不追求速度或負重。'}
];
// Records without menuVersion retain the exact original doses and movement IDs.
const LEGACY_STAGES=[
  {walk:5,sets:1,reps:[10,8,8,10]}, {walk:8,sets:1,reps:[12,10,10,12]},
  {walk:10,sets:2,reps:[12,10,10,12]}, {walk:15,sets:2,reps:[12,12,10,12]}
];
const SEATED=[
  {id:'ankle',name:'坐姿踝關節活動',en:'Seated ankle pumps',instruction:'坐穩，腳跟與腳尖緩慢交替抬起。',caution:'小幅度、不憋氣；疼痛就停止。'},
  {id:'knee',name:'坐姿膝伸直',en:'Seated knee extension',instruction:'背部靠椅，緩慢伸直一側膝蓋，再放下；換側。',caution:'不鎖死膝蓋；以無痛範圍活動。',perSide:true},
  {id:'scapula',name:'坐姿肩胛後收',en:'Seated scapular retraction',instruction:'坐穩，肩胛輕輕向後靠攏，再放鬆。',caution:'肩膀不聳起，不快速轉頭。'},
  {id:'elbow',name:'坐姿手肘彎曲',en:'Seated elbow flexion',instruction:'雙手不負重，慢慢彎曲、伸直手肘。',caution:'手肘靠近身體，以舒適速度進行。'}
];
export function defaultTraining() {return {category:'exercise',stage:1,startedOn:null,stageSince:null,paused:false,supportedStanding:false,week:['walk','rest','seated','rest','walk','rest','rest']};}
export function addDays(day,amount) {const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+amount);return d.toISOString().slice(0,10);}
export function exerciseMenu({type='seated',stage=1,alternative=false,supportedStanding=false,minutes,menuVersion=MENU_VERSION}={}) {
  const phases=menuVersion===1?LEGACY_STAGES:STAGES;
  const phase=phases[stage-1]||phases[0];
  if(type==='rest'||type==='none')return [];
  if(type==='walk'&&!alternative)return [{id:'walk',name:'低強度平地步行',en:'Easy level walking',sets:1,minutes:minutes??phase.walk,instruction:'選平坦、熟悉且可隨時坐下的路線，以能輕鬆交談的速度步行，可分段。',caution:'仍有晃動或重心不穩時先暫停步行並尋求評估；不要獨自行走冒險。'}];
  const result=SEATED.map((move,i)=>({...move,sets:alternative?1:phase.sets,reps:alternative?Math.ceil(STAGES[0].reps[i]/2):phase.reps[i]}));
  if(!alternative&&phase.march)result.push({id:'march',name:'坐姿抬膝',en:'Supported seated marching',sets:1,reps:phase.march,perSide:true,instruction:'背部靠穩椅背，左右腳輪流小幅抬離地面，再緩慢放下。',caution:'不擺動身體、不快速抬腿；若重心不穩或不舒服就停止。'});
  if(!alternative&&stage>=3&&supportedStanding)result.push(
    {id:'wall',name:'靠牆伏地挺身',en:'Wall push-up',sets:1,reps:menuVersion!==1&&stage===4?8:6,instruction:'面向穩固牆面，雙手支撐，緩慢彎曲再伸直手肘。',caution:'僅在步態穩定且經評估適合後選用；腳下防滑。'},
    {id:'chair',name:'椅子坐站',en:'Supported sit-to-stand',sets:1,reps:menuVersion!==1&&stage===4?6:5,instruction:'椅子靠牆，以扶手或穩固支撐協助站起，再慢慢坐下。',caution:'僅在步態穩定且經評估適合後選用；有人陪同更安心。'}
  );
  return result;
}
export function untouchedExercise(record) {
  return !!record && record.status==='pending' && !record.startedOn && !Object.keys(record.actions||{}).length;
}
export function canFollowStage(record,day,today=dateKey()) {
  return day>=today && untouchedExercise(record) && ['walk','seated'].includes(record.type) && record.mode!=='alternative';
}
export function stageExercise(record,config) {
  const legacy=record.menuVersion===undefined||record.menuVersion===1;
  const oldDefault=record.type==='walk'?(legacy?LEGACY_STAGES:STAGES)[record.stage-1]?.walk:legacy?8:STAGES[record.stage-1]?.seatedMinutes;
  const timeSource=record.timeSource||(record.minutes==null||record.minutes===oldDefault?'stage':'custom');
  return {...record,stage:config.stage,menuVersion:MENU_VERSION,supportedStanding:record.mode==='alternative'?false:config.supportedStanding,
    timeSource,minutes:timeSource==='custom'?record.minutes:record.mode==='alternative'?5:record.type==='walk'?STAGES[config.stage-1].walk:STAGES[config.stage-1].seatedMinutes};
}
export function exerciseForDay(config,day,habits={},today=dateKey()) {
  const record=habits.questOS_v1?.exercise;
  if(record) {
    const follow=canFollowStage(record,day,today)&&!habits['daily-sport'];
    return {...(follow?stageExercise(record,config):record),actions:record.actions||{},menuVersion:follow?MENU_VERSION:record.menuVersion||1,legacy:false};
  }
  if(habits['daily-sport'])return {category:'exercise',type:'none',stage:1,minutes:null,status:'complete',actions:{},legacy:true,menuVersion:1};
  const weekday=(new Date(day+'T12:00:00Z').getUTCDay()+6)%7;
  const active=!!config.startedOn && day>=config.startedOn;
  const type=!active?'none':config.paused?'rest':config.week[weekday];
  return {category:'exercise',type,stage:config.stage,menuVersion:MENU_VERSION,timeSource:'stage',minutes:type==='walk'?STAGES[config.stage-1].walk:type==='seated'?STAGES[config.stage-1].seatedMinutes:null,status:type==='rest'||type==='none'?'not_scheduled':'pending',actions:{},supportedStanding:config.supportedStanding,legacy:false};
}
export function leisureForDay(habits={}) {return habits.questOS_v1?.leisure||{category:'leisure',title:habits['daily-game']?'休息（舊紀錄）':'',minutes:null,status:habits['daily-game']?'complete':'not_scheduled',legacy:!!habits['daily-game']};}
export function lifeSummary(planner,day,config,habits={}) {
  const tasks=planner.list(day),done=tasks.filter(t=>t.complete).length;
  return {study:{category:'study',total:tasks.length,done,percent:tasks.length?Math.round(done/tasks.length*100):0,minutes:habits.questOS_v1?.studyMinutes??null,plannedMinutes:tasks.reduce((sum,t)=>sum+(t.minutes||0),0)},exercise:exerciseForDay(config,day,habits,day),leisure:leisureForDay(habits)};
}
export function trainingWeek(config,day,getHabits) {
  const monday=weekKey(day);
  const days=Array.from({length:7},(_,i)=>{const date=addDays(monday,i);return {date,...exerciseForDay(config,date,getHabits(date),day)};});
  const completed=days.filter(d=>['complete','alternative'].includes(d.status)).length;
  const planned=days.filter(d=>(!['rest','none'].includes(d.type)||d.status==='complete')&&d.status!=='symptom_rest').length;
  return {days,completed,planned,rest:days.filter(d=>d.type==='rest'||d.status==='symptom_rest').length};
}
