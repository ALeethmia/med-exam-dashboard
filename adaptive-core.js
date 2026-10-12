import {dateKey,weekKey,flattenSubjects} from './study-core.js';
import {validDate} from './daily-planner.js';
export const PRIORITIES={core:'核心',normal:'一般',flexible:'彈性'};
export const BIOCHEM_SLOTS=Object.freeze(['2026-11-06','2026-11-13','2026-11-18','2026-11-27','2026-12-04','2026-12-11','2026-12-18','2026-12-23']);
export const defaultStudySettings=()=>({version:1,examDate:'2027-01-16',weekMinutes:[360,360,360,360,360,240,240],dateMinutes:{},bufferPercent:20,fixedOverrides:{}});
export function addDays(day,n) {const value=new Date(day+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+n);return value.toISOString().slice(0,10);}
export function timeMinute(value) {if(!/^\d{2}:\d{2}$/.test(value||''))return null;const [h,m]=value.split(':').map(Number);return h<24&&m<60?h*60+m:null;}
export function interval(start,end) {const a=timeMinute(start),b=timeMinute(end);return a!==null&&b!==null&&b>a?[a,b]:null;}
export function unionMinutes(ranges) {let total=0,last=-1;for(const [a,b] of [...ranges].sort((a,b)=>a[0]-b[0])){total+=Math.max(0,b-Math.max(a,last));last=Math.max(last,b);}return total;}
export function fixedClasses(data,settings=defaultStudySettings()) {
  return data.biochem.map((course,i)=>({id:'biochem-class-'+course.id,course:{path:'biochem',id:String(course.id)},title:course.title,date:settings.fixedOverrides?.['biochem-class-'+course.id]?.date||BIOCHEM_SLOTS[i],start:settings.fixedOverrides?.['biochem-class-'+course.id]?.start||'18:00',end:settings.fixedOverrides?.['biochem-class-'+course.id]?.end||'22:00',timeZone:'Asia/Taipei',locked:true}));
}
export const taskLocked=task=>!!(task.locked||task.planning?.locked||task.planning?.fixedId);
export function taskPlanning(task,data) {
  const linked=flattenSubjects(data).find(item=>(task.links||[]).some(link=>link.path===item.path&&String(link.id)===item.id));
  return {version:1,priority:'normal',waiting:false,locked:false,originalDate:task.date,originalWeek:linked?.week||data.weeks.find(w=>task.date>=w.start&&task.date<=w.end)?.w&&'W'+data.weeks.find(w=>task.date>=w.start&&task.date<=w.end).w||null,...task.planning};
}
export function calendarConstraints(day,classes,events={}) {
  const fixed=classes.filter(c=>c.date===day).map(c=>({...c,range:interval(c.start,c.end)}));
  const items=[...fixed],unknown=[];
  for(const event of events[day]||[]) {
    if(event.fixedId&&classes.some(c=>c.id===event.fixedId))continue;
    const range=interval(event.startTime||event.start,event.endTime||event.end);
    if(fixed.some(c=>(event.text===c.title||/^鐸鐸生化(?:課|正式課|班)?$/.test(event.text||''))&&(!range||(range[0]===c.range[0]&&range[1]===c.range[1]))))continue;
    if(!range){if(!fixed.some(c=>event.text===c.title||/^鐸鐸生化(?:課|正式課|班)?$/.test(event.text||'')))unknown.push(event);continue;}
    items.push({id:event.id,title:event.text,range});
  }
  const conflicts=[];
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++) {
    const [a,b]=items[i].range,[c,d]=items[j].range;
    // Identical intervals/events representing the same class are one occupancy.
    if(a<d&&c<b&&!(a===c&&b===d&&(items[i].title===items[j].title||items[j].id===items[i].id)))conflicts.push([items[i].title,items[j].title]);
  }
  return {fixed,items,unknown,conflicts,minutes:unionMinutes(items.map(e=>e.range))};
}
export function taskMinutes(task) {const range=interval(task.planning?.start,task.planning?.end);return range?Math.max(task.minutes||0,range[1]-range[0]):task.minutes||null;}
export function dailyCapacity(day,settings,classes,tasks,events={}) {
  const weekday=(new Date(day+'T12:00:00Z').getUTCDay()+6)%7;
  const total=Object.hasOwn(settings.dateMinutes||{},day)?settings.dateMinutes[day]:settings.weekMinutes[weekday];
  const busy=calendarConstraints(day,classes,events),available=Math.max(0,total-busy.minutes);
  const buffer=Math.ceil(available*settings.bufferPercent/100),flexible=available-buffer;
  const scheduled=tasks.filter(t=>!t.deleted&&!t.planning?.waiting&&t.date===day&&!classes.some(c=>c.date===day&&c.id===t.planning?.fixedId));
  const assigned=scheduled.reduce((sum,t)=>sum+(taskMinutes(t)||0),0),unknown=scheduled.filter(t=>!taskMinutes(t));
  const timedConflicts=[...busy.conflicts];
  const timed=scheduled.filter(t=>interval(t.planning?.start,t.planning?.end));
  for(const task of timed){const [a,b]=interval(task.planning.start,task.planning.end);for(const item of busy.items)if(a<item.range[1]&&item.range[0]<b)timedConflicts.push([task.title,item.title]);}
  for(let i=0;i<timed.length;i++)for(let j=i+1;j<timed.length;j++){const [a,b]=interval(timed[i].planning.start,timed[i].planning.end),[c,d]=interval(timed[j].planning.start,timed[j].planning.end);if(a<d&&c<b)timedConflicts.push([timed[i].title,timed[j].title]);}
  return {day,total,fixedMinutes:busy.minutes,buffer,flexible,assigned,remaining:flexible-assigned,shortfall:Math.max(0,busy.minutes-total),unknown:unknown.length,unknownEvents:busy.unknown.length,timedConflicts,fixed:busy.fixed};
}
export function studyWeek(day,settings,classes,tasks,events={}) {
  const days=Array.from({length:7},(_,i)=>dailyCapacity(addDays(weekKey(day),i),settings,classes,tasks,events));
  return {days,total:days.reduce((n,d)=>n+d.total,0),fixed:days.reduce((n,d)=>n+d.fixedMinutes,0),buffer:days.reduce((n,d)=>n+d.buffer,0),assigned:days.reduce((n,d)=>n+d.assigned,0),remaining:days.reduce((n,d)=>n+d.remaining,0)};
}
export function proposeSchedule({data,settings,tasks,events={},ids,start=dateKey(),end=addDays(settings.examDate,-1),mode='distribute',target=start,today=dateKey(),originalTasks=tasks}) {
  if(!['distribute','date','waiting'].includes(mode))throw new Error('排程方式無效。');
  if(!validDate(start)||!validDate(end)||start>end||(mode!=='waiting'&&end>=settings.examDate)||start<today)throw new Error('請選擇有效的考前日期範圍。');
  if(new Date(end)-new Date(start)>366*86400000)throw new Error('第一版一次最多預覽一年。');
  if(mode==='date'&&(!validDate(target)||target<start||target>end))throw new Error('指定日期必須在預覽範圍內且早於考試。');
  const classes=fixedClasses(data,settings),chosen=new Set(ids),candidates=tasks.filter(t=>chosen.has(t.id));
  const base=tasks.filter(t=>!chosen.has(t.id)||t.complete||taskLocked(t));
  const days=Array.from({length:Math.round((new Date(end)-new Date(start))/86400000)+1},(_,i)=>addDays(start,i));
  const moves=[],unplaced=[];
  candidates.sort((a,b)=>['core','normal','flexible'].indexOf(a.planning?.priority||'normal')-['core','normal','flexible'].indexOf(b.planning?.priority||'normal')||a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  const assigned=[...base];
  for(const task of candidates) {
    if(task.deleted||task.complete||taskLocked(task)){unplaced.push({task,reason:'已完成、刪除或鎖定，保持不變'});continue;}
    const planning=taskPlanning(task,data);
    if(mode==='waiting'){moves.push({id:task.id,title:task.title,from:task.date,to:task.date,minutes:task.minutes,patch:{planning:{...planning,waiting:true}}});continue;}
    const estimate=taskMinutes(task);
    if(!estimate){unplaced.push({task,reason:'未設定預估分鐘，無法確認容量'});assigned.push(originalTasks.find(t=>t.id===task.id)||task);continue;}
    const range=interval(planning.start,planning.end);
    const date=(mode==='date'?[target]:days).find(day=>{
      const capacity=dailyCapacity(day,settings,classes,assigned,events);
      if(capacity.unknown||capacity.shortfall||capacity.remaining<estimate||capacity.timedConflicts.length)return false;
      if(range){const busy=calendarConstraints(day,classes,events).items.map(e=>e.range);for(const other of assigned.filter(t=>!t.deleted&&!t.planning?.waiting&&t.date===day)){const timed=interval(other.planning?.start,other.planning?.end);if(timed)busy.push(timed);}if(busy.some(([a,b])=>range[0]<b&&a<range[1]))return false;}
      return true;
    });
    if(!date){unplaced.push({task,reason:'考前容量不足或已知時段衝突'});assigned.push(originalTasks.find(t=>t.id===task.id)||task);continue;}
    const patch={date,planning:{...planning,waiting:false}};moves.push({id:task.id,title:task.title,from:task.date,to:date,minutes:estimate,patch});assigned.push({...task,...patch});
  }
  const loads=days.map(day=>dailyCapacity(day,settings,classes,assigned,events));
  return {moves,unplaced,loads,fixed:classes,unplacedMinutes:unplaced.reduce((n,x)=>n+(taskMinutes(x.task)||0),0),unknownMinutes:unplaced.filter(x=>!taskMinutes(x.task)).length,
    feasible:!unplaced.length&&!loads.some(d=>d.unknown||d.shortfall||d.remaining<0||d.timedConflicts.length),timeCoverage:'僅檢查有明確起迄時間的項目；無時段任務只檢查每日容量。'};
}
