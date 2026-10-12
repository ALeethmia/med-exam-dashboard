import {dateKey,weekKey} from './study-core.js';
export const TYPES={strength_a:'全身肌力 A',strength_b:'全身肌力 B',walk:'平地步行',seated:'坐姿肌力',rest:'休息與恢復',none:'未安排'};
export const STATUS={pending:'尚未完成',complete:'正常完成',alternative:'低強度替代完成',symptom_rest:'症狀休息',not_scheduled:'未安排'};
export const MENU_VERSION=3;
const V2_STAGES=[
  {id:1,title:'適應與穩定',weeks:'第 1–2 週',walk:5,seatedMinutes:8,sets:1,reps:[10,8,8,10],description:'四個坐姿動作，先熟悉動作與舒適節奏。步行可分段。'},
  {id:2,title:'建立規律',weeks:'第 3–4 週',walk:8,seatedMinutes:10,sets:1,reps:[12,10,10,12],march:6,description:'小幅增加次數，加入有椅背支撐的坐姿抬膝。'},
  {id:3,title:'緩慢增加',weeks:'第 5–6 週',walk:10,seatedMinutes:12,sets:2,reps:[10,8,8,10],march:8,description:'四個基礎動作分成兩組，單組次數減量，組間充分休息。'},
  {id:4,title:'維持與鞏固',weeks:'第 7–8 週',walk:12,seatedMinutes:15,sets:2,reps:[12,10,10,12],march:10,description:'維持兩組，少量增加次數與步行時間，不追求速度或負重。'}
];
export const STAGES=[
  {id:1,title:'適應與穩定',weeks:'第 1–2 週',walk:5,walkRange:[5,10],seatedMinutes:8,sets:1,reps:[10,8,8,10],description:'熟悉四個坐姿動作與短段步行，先建立每週規律。'},
  {id:2,title:'建立規律',weeks:'第 3–4 週',walk:10,walkRange:[10,15],seatedMinutes:15,sets:1,reps:[12,10,10,12],strengthReps:8,description:'加入全身推、拉、下肢與核心；適合時使用支撐站姿，不適合時採同類坐姿替代。'},
  {id:3,title:'緩慢增加',weeks:'第 5–6 週',walk:15,walkRange:[15,20],seatedMinutes:20,sets:2,reps:[10,8,8,10],strengthReps:8,description:'全身肌力增加至兩組，A／B 日交錯，步行仍以能輕鬆交談的速度進行。'},
  {id:4,title:'維持與鞏固',weeks:'第 7–8 週',walk:20,walkRange:[20,30],seatedMinutes:25,sets:2,reps:[12,10,10,12],strengthReps:12,description:'鞏固兩組全身肌力，少量增次、延長步行，目標是能長期維持的習慣。'}
];
export const RECOMMENDED_WEEK=['strength_a','walk','rest','strength_b','walk','walk','rest'];
export const isStrength=type=>['seated','strength_a','strength_b'].includes(type);
export const hasTrainingMenu=type=>type==='walk'||isStrength(type);
export const walkRangeText=stage=>STAGES[stage-1].walkRange.join('–')+' 分鐘';
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
export function defaultTraining() {return {category:'exercise',stage:1,startedOn:null,stageSince:null,paused:false,supportedStanding:false,trainingMode:'general',week:[...RECOMMENDED_WEEK]};}
export function addDays(day,amount) {const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+amount);return d.toISOString().slice(0,10);}
function legacyMenu({type='seated',stage=1,alternative=false,supportedStanding=false,minutes,menuVersion=2}={}) {
  const phases=menuVersion===1?LEGACY_STAGES:V2_STAGES;
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
const strengthMove=(id,name,en,instruction,caution,extra={})=>({id,name,en,instruction,caution,...extra});
function generalStrength({type,stage,supportedStanding}) {
  const phase=STAGES[stage-1],b=type==='strength_b';
  if(stage===1)return b?[...SEATED.slice(0,3).map((move,i)=>({...move,sets:1,reps:phase.reps[i]})),strengthMove('breathing','坐姿呼吸與核心覺察','Seated breathing and core awareness','靠穩椅背，自然吸氣，吐氣時輕收腹；持續自然呼吸。','不憋氣、不用力縮腹；不舒服就停止。',{sets:1,seconds:30})]:SEATED.map((move,i)=>({...move,sets:1,reps:phase.reps[i]}));
  const sets=phase.sets,reps=phase.strengthReps;
  const lower=supportedStanding?strengthMove('chair','椅子坐站','Supported sit-to-stand','椅子靠牆，雙腳平放，以扶手或穩固支撐協助站起，慢慢坐下。','需目前步態穩定、功能與評估適合；避免過低椅子，有人陪同更安心。',{sets,reps:stage===2?6:stage===3?8:10,group:'下肢'}):{...SEATED[1],sets,reps,group:'下肢'};
  const calf=supportedStanding?strengthMove('calf','扶椅提踵','Supported calf raise','雙手扶穩不會滑動的椅背，雙腳一起緩慢踮起，再放下。','雙腳保持著地支撐，不做單腳版本；晃動或頭暈就改坐姿。',{sets,reps,group:'下肢'}):strengthMove('seated-calf','坐姿提踵','Seated calf raise','坐穩，雙腳平放，緩慢抬起腳跟再放下。','膝蓋維持穩定，以無痛範圍進行。',{sets,reps,group:'下肢'});
  const push=supportedStanding?strengthMove('wall','靠牆伏地挺身','Wall push-up','雙手扶牆，雙腳穩定，緩慢彎曲、伸直手肘；以離牆較近的站距起步。','需適合支撐站姿、地面防滑；不勉強增加站距。',{sets,reps:stage===2?6:stage===3?8:10,group:'推力'}):strengthMove('palm','坐姿掌心互推','Seated palm press','坐穩，掌心在胸前輕輕互推，再放鬆。','不憋氣，使用輕至中等力量，肩胸不適就停止。',{sets,reps,holdSeconds:3,group:'推力'});
  const pull=strengthMove('row','坐姿划船（彈力帶／徒手）','Seated band row or elbow pull','坐穩，完好彈力帶繞穩雙腳，緩慢將手肘向後拉再放回；無器材時改徒手後拉、停留 3 秒。','先檢查彈力帶與固定處，避免朝臉拉扯；不使用不牢靠的門把固定，保持正常呼吸。',{sets,reps,group:'拉力'});
  const core=supportedStanding&&b&&stage===4?strengthMove('wall-core','靠牆核心支撐','Wall-supported plank','雙前臂靠牆、雙腳站穩，身體成一直線，保持自然呼吸。','從靠近牆面起步，不塌腰；不適或平衡不穩改坐姿收腹。',{sets:2,seconds:20,group:'核心'}):strengthMove('brace','坐姿核心收緊','Seated abdominal bracing','坐穩，吐氣時輕收腹，維持自然呼吸，再放鬆。','不要憋氣、用力擠壓或快速扭轉；腰部不適就停止。',{sets,reps:stage===4?6:5,holdSeconds:stage===4?8:5,group:'核心'});
  const hinge=strengthMove('hinge','坐姿髖折疊','Seated hip hinge','雙腳平放，背部保持自然，從髖部小幅前傾，再回到靠椅坐姿。','幅度小、動作慢、視線穩定；晃動、頭暈或腰痛改膝伸直。',{sets,reps:stage===4?10:8,group:'臀腿'});
  return b?[hinge,lower,pull,push,core]:[lower,calf,push,pull,core];
}
export function exerciseMenu(record={}) {
  const {type='seated',stage=1,alternative=false,supportedStanding=false,minutes,menuVersion=MENU_VERSION}=record;
  if(menuVersion<3)return legacyMenu({...record,type,stage,alternative,supportedStanding,menuVersion});
  if(type==='rest'||type==='none')return [];
  if(alternative||record.mode==='alternative')return SEATED.map((move,i)=>({...move,sets:1,reps:Math.ceil(STAGES[0].reps[i]/2)}));
  if(type==='walk')return [{id:'walk',name:'平地步行',en:'Level walking',sets:1,minutes:minutes??STAGES[stage-1].walk,range:walkRangeText(stage),instruction:'選平坦、熟悉、可隨時坐下的路線，以能輕鬆交談的速度步行，可分段。先用範圍下限，舒適時再慢慢延長。',caution:'明顯頭暈、晃動或重心不穩時不要勉強步行，改坐姿替代或症狀休息；不以速度競賽。'}];
  return generalStrength({type,stage,supportedStanding});
}
export const menuConfig=config=>({stage:config.stage,supportedStanding:!!config.supportedStanding,trainingMode:config.trainingMode||'general'});
export function modeExercise(record,config,mode) {
  const normalPlan=record.mode==='alternative'&&record.normalPlan?record.normalPlan:{minutes:record.minutes??null,timeSource:record.timeSource||'stage'};
  return {...record,mode:mode==='alternative'?'alternative':null,modeSource:'date',menuVersion:MENU_VERSION,supportedStanding:mode==='alternative'?false:config.supportedStanding,
    normalPlan,minutes:mode==='alternative'?5:normalPlan.minutes??(record.type==='walk'?STAGES[record.stage-1].walk:STAGES[record.stage-1].seatedMinutes),timeSource:mode==='alternative'?'stage':normalPlan.timeSource};
}
export function untouchedExercise(record) {
  return !!record && record.status==='pending' && !record.startedOn && !Object.keys(record.actions||{}).length;
}
export function canFollowStage(record,day,today=dateKey()) {
  return day>=today && untouchedExercise(record) && hasTrainingMenu(record.type) && (record.mode!=='alternative'||record.modeSource==='settings');
}
export function stageExercise(record,config) {
  const base=record.mode==='alternative'&&record.normalPlan?{...record,...record.normalPlan}:record;
  const legacy=record.menuVersion===undefined||record.menuVersion===1;
  const oldDefault=record.type==='walk'?(legacy?LEGACY_STAGES:record.menuVersion===2?V2_STAGES:STAGES)[record.stage-1]?.walk:legacy?8:(record.menuVersion===2?V2_STAGES:STAGES)[record.stage-1]?.seatedMinutes;
  const timeSource=record.type==='walk'&&base.minutes!=null?'custom':base.timeSource||(base.minutes==null||base.minutes===oldDefault?'stage':'custom');
  const mode=record.modeSource==='date'||(record.mode==='alternative'&&!record.modeSource)?record.mode||null:config.trainingMode==='alternative'?'alternative':null;
  return {...record,stage:config.stage,mode,menuVersion:MENU_VERSION,supportedStanding:mode==='alternative'?false:config.supportedStanding,
    normalPlan:mode==='alternative'?(record.normalPlan||{minutes:base.minutes??null,timeSource}):record.normalPlan||null,
    timeSource,minutes:mode==='alternative'?5:timeSource==='custom'?base.minutes:record.type==='walk'?STAGES[config.stage-1].walk:STAGES[config.stage-1].seatedMinutes};
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
  return {category:'exercise',type,stage:config.stage,mode:config.trainingMode==='alternative'?'alternative':null,modeSource:'settings',menuVersion:MENU_VERSION,timeSource:'stage',normalPlan:config.trainingMode==='alternative'&&hasTrainingMenu(type)?{minutes:type==='walk'?STAGES[config.stage-1].walk:STAGES[config.stage-1].seatedMinutes,timeSource:'stage'}:null,minutes:config.trainingMode==='alternative'&&hasTrainingMenu(type)?5:type==='walk'?STAGES[config.stage-1].walk:isStrength(type)?STAGES[config.stage-1].seatedMinutes:null,status:type==='rest'||type==='none'?'not_scheduled':'pending',actions:{},supportedStanding:config.supportedStanding,legacy:false};
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
