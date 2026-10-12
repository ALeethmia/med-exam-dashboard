import {validDate} from './daily-planner.js';
import {weekKey,subjectStats,gameStats,flattenSubjects,awardKey} from './study-core.js';
import {addDays} from './adaptive-core.js';
export function growthSnapshot({data,states,tasks,awards={},courseAwards={},courseDates={},day,getHabits,training}) {
  const start=weekKey(day),end=addDays(start,6),unique=new Map(tasks.map(task=>[task.id,task]));
  const weekly=[...unique.values()].filter(t=>!t.deleted&&!t.planning?.waiting&&t.date>=start&&t.date<=end),completed=weekly.filter(t=>t.complete);
  const subjects=subjectStats(data,states),done=subjects.reduce((n,s)=>n+s.done,0),total=subjects.reduce((n,s)=>n+s.total,0);
  const units=new Map(flattenSubjects(data).map(unit=>[awardKey(unit),unit]));
  const dated=[],undatedCurrent=[];
  for(const [key,unit] of units){const award=courseAwards[key],record=courseDates[key],firstDay=Object.hasOwn(courseDates,key)?record?.day:award?.xp===20?award.day:null,currentlyComplete=!!states[unit.path]?.[unit.id];
    if(validDate(firstDay)&&firstDay<=day)dated.push({key,day:firstDay,currentlyComplete});
    else if(currentlyComplete)undatedCurrent.push(key);
  }
  const firstThisWeek=dated.filter(record=>record.day>=start&&record.day<=end);
  const firstCourses={weekly:firstThisWeek.length,weeklyCurrent:firstThisWeek.filter(record=>record.currentlyComplete).length,weeklyUnchecked:firstThisWeek.filter(record=>!record.currentlyComplete).length,datedTotal:dated.length,undatedCurrent:undatedCurrent.length};
  const exercise={complete:0,alternative:0,rest:0,symptomRest:0,unplanned:0,pending:0,unrecorded:0,legacy:0,recorded:0};
  for(let i=0;i<7;i++){const date=addDays(start,i);if(date>day)break;const habits=getHabits(date),record=habits.questOS_v1?.exercise;
    if(!record){if(habits['daily-sport']){exercise.complete++;exercise.legacy++;exercise.recorded++;}else exercise.unrecorded++;continue;}
    exercise.recorded++;
    if(record.status==='symptom_rest')exercise.symptomRest++;
    else if(record.status==='alternative')exercise.alternative++;
    else if(record.status==='complete')exercise.complete++;
    else if(record.type==='rest')exercise.rest++;
    else if(record.status==='not_scheduled'||record.type==='none')exercise.unplanned++;
    else exercise.pending++;
  }
  const historical=gameStats(awards,day);
  return {start,end,tasks:{done:completed.length,total:weekly.length,undatedCompletion:completed.length,dateBasis:'scheduled'},courses:{done,total,percent:total?Math.round(done/total*100):0},subjects,firstCourses,exercise,paused:!!training.paused,historical:{weekly:historical.weekly,total:historical.xp/20,xp:historical.xp}};
}
