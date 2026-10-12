import {dateKey,weekKey,flattenSubjects} from './study-core.js';
import {validDate} from './daily-planner.js';
export const PRIORITIES={core:'核心',normal:'一般',flexible:'彈性'};
export const BIOCHEM_SLOTS=Object.freeze(['2026-11-06','2026-11-13','2026-11-18','2026-11-27','2026-12-04','2026-12-11','2026-12-18','2026-12-23']);
export const defaultStudySettings=()=>({version:1,examDate:'2027-01-16',weekMinutes:[360,360,360,360,360,240,240],dateMinutes:{},bufferPercent:20,dailyTaskLimit:null,fixedOverrides:{}});
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
  return {day,total,fixedMinutes:busy.minutes,buffer,flexible,assigned,remaining:flexible-assigned,shortfall:Math.max(0,busy.minutes-total),taskCount:scheduled.filter(t=>!t.complete).length,unknown:unknown.length,timeDemandKnown:scheduled.every(t=>!!interval(t.planning?.start,t.planning?.end)),unknownEvents:busy.unknown.length,timedConflicts,fixed:busy.fixed};
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
    const eligible=(mode==='date'?[target]:days).filter(day=>canPlace(task,day,settings,classes,assigned,events));
    // Count balancing is a date suggestion, never an estimate of equal unit difficulty.
    eligible.sort((a,b)=>dailyCapacity(a,settings,classes,assigned,events).taskCount-dailyCapacity(b,settings,classes,assigned,events).taskCount||a.localeCompare(b));
    const date=eligible[0];
    if(!date){unplaced.push({task,reason:'沒有可安排日期：休息日、無自主時間、任務數上限或已知時段衝突'});assigned.push(originalTasks.find(t=>t.id===task.id)||task);continue;}
    const patch={date,planning:{...planning,waiting:false}};moves.push({id:task.id,title:task.title,from:task.date,to:date,minutes:estimate,patch});assigned.push({...task,...patch});
  }
  const loads=days.map(day=>dailyCapacity(day,settings,classes,assigned,events));
  return {moves,unplaced,loads,fixed:classes,unplacedMinutes:unplaced.reduce((n,x)=>n+(taskMinutes(x.task)||0),0),unknownMinutes:unplaced.filter(x=>!taskMinutes(x.task)).length,
    feasible:!unplaced.length&&!loads.some(d=>!d.timeDemandKnown||d.unknownEvents||d.shortfall||d.remaining<0||d.timedConflicts.length),timeCoverage:'核心任務優先，依未完成任務數分散至可用日期，同數時較早日期優先；單元難度不同，數量不是工作量。估時僅供參考，無明確時段的任務時間需求未知，不能保證容量足夠或考前完成。'};
}

export function canPlace(task,day,settings,classes,assigned,events={}) {
  const capacity=dailyCapacity(day,settings,classes,assigned,events);
  if(capacity.flexible<=0||capacity.shortfall||capacity.timedConflicts.length)return false;
  if(settings.dailyTaskLimit!=null&&capacity.taskCount>=settings.dailyTaskLimit)return false;
  const range=interval(task.planning?.start,task.planning?.end);
  if(range){
    if(range[1]-range[0]>capacity.flexible)return false;
    const busy=calendarConstraints(day,classes,events).items.map(e=>e.range);
    for(const other of assigned.filter(t=>!t.deleted&&!t.planning?.waiting&&t.date===day)){const timed=interval(other.planning?.start,other.planning?.end);if(timed)busy.push(timed);}
    if(busy.some(([a,b])=>range[0]<b&&a<range[1]))return false;
    const booked=assigned.filter(t=>!t.deleted&&!t.planning?.waiting&&t.date===day).reduce((n,t)=>{const r=interval(t.planning?.start,t.planning?.end);return n+(r?r[1]-r[0]:0);},0);
    if(booked+range[1]-range[0]>capacity.flexible)return false;
  }
  return true;
}
export function reviseSchedule(result,{data,settings,tasks,events={},dates={},start,end,today=dateKey()}) {
  const classes=fixedClasses(data,settings),ids=new Set(result.moves.map(m=>m.id)),assigned=tasks.filter(t=>!ids.has(t.id));
  const moves=result.moves.map(move=>({...move,patch:{...move.patch,planning:{...move.patch.planning}}}));
  for(const move of moves){
    const task=tasks.find(t=>t.id===move.id);if(!task||task.complete||task.deleted||taskLocked(task))throw Error('任務狀態已變更，請重新預覽。');
    if(!move.patch.planning.waiting){const day=Object.hasOwn(dates,move.id)?dates[move.id]:move.to;if(!validDate(day)||day<today||day<start||day>end||day>=settings.examDate)throw Error('請選擇預覽範圍內的考前日期。');if(!canPlace(task,day,settings,classes,assigned,events))throw Error('該日期為休息日、無自主時間、超過任務數上限或有已知時段衝突。');move.to=day;move.patch.date=day;assigned.push({...task,...move.patch});}
  }
  const loads=result.loads.map(d=>dailyCapacity(d.day,settings,classes,assigned,events));
  return {...result,moves,loads,feasible:!result.unplaced.length&&loads.every(d=>d.timeDemandKnown&&!d.unknownEvents&&!d.shortfall&&d.remaining>=0&&!d.timedConflicts.length)};
}
export function progressSummary(data,states,tasks,courseAwards={},today=dateKey()) {
  const units=flattenSubjects(data),week=weekKey(today),recent=addDays(today,-13);
  const courses=units.filter(u=>states[u.path]?.[u.id]);
  const courseDates=courses.map(u=>courseAwards[u.path+'__'+u.id]?.day).filter(day=>validDate(day)&&day<=today);
  const taskDates=tasks.filter(t=>!t.deleted&&t.complete).map(t=>t.award?.day).filter(day=>validDate(day)&&day<=today);
  return {subjects:[...new Set(units.map(u=>u.subject))].map(subject=>({subject,done:courses.filter(u=>u.subject===subject).length,remaining:units.filter(u=>u.subject===subject).length-courses.filter(u=>u.subject===subject).length})),weekCourses:courseDates.filter(d=>d>=week).length,weekTasks:taskDates.filter(d=>d>=week).length,recentCourses:courseDates.filter(d=>d>=recent).length,recentTasks:taskDates.filter(d=>d>=recent).length,undatedCourses:courses.length-courseDates.length};
}
