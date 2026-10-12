import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {defaultStudySettings,fixedClasses,BIOCHEM_SLOTS,dailyCapacity,studyWeek,proposeSchedule,unionMinutes,taskPlanning,calendarConstraints,addDays,reviseSchedule,progressSummary,studyWeekDisplayTitle} from '../adaptive-core.js';
import {createStudySettings,STUDY_SETTINGS_PATH,STUDY_SETTINGS_KEY} from '../adaptive-store.js';
import {createPlanner,PLANNER_PATH,PLANNER_KEY,planningSnapshotSame} from '../daily-planner.js';
import {dateKey} from '../study-core.js';
import {memoryStorage,mockEvents,planningBackend,settle,copy} from './helpers/planning-mock.js';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const names={physio:'physioChaptersData', anatomy:'anatomyLessonsData', biochem:'biochemData', pharm:'pharmacologyData', weeks:'weeksData'};
const data=Object.fromEntries(Object.entries(names).map(([key,name])=>[key,JSON.parse(JSON.stringify(vm.runInNewContext('('+html.match(new RegExp('const '+name+' = (\\[.*?\\n    \\]);','s'))[1]+')')))]));
const task=(id,minutes=60,extra={})=>({id,title:id,date:'2026-10-12',minutes,complete:false,deleted:false,...extra});
const cfg=extra=>({...defaultStudySettings(),...extra});
const suggest=(tasks,extra={})=>proposeSchedule({data,settings:cfg(),tasks,ids:tasks.map(t=>t.id),start:'2026-10-12',end:'2026-10-15',today:'2026-10-12',...extra});
function local(){const storage=memoryStorage();let id=0;const options={storage,events:mockEvents(),localOnly:true,newId:()=> 't'+(++id),today:()=> '2026-10-12',now:()=>1};return {storage,options,planner:createPlanner(options)};}
function clients(server){return ['a','b'].map(prefix=>{const {connection,db}=server.client();let count=0;const storage=memoryStorage(),planner=createPlanner({db,storage,events:mockEvents(),newId:()=>prefix+(++count),today:()=> '2026-10-12',now:()=>1});return {connection,db,storage,planner};});}
test('eight fixed classes bind original IDs and titles to exact Taipei dates and 18–22 slots without changing course data',()=>{
 const before=JSON.stringify(data),classes=fixedClasses(data);assert.equal(classes.length,8);assert.deepEqual(classes.map(c=>c.date),BIOCHEM_SLOTS);assert.deepEqual(classes.map(c=>c.course.id),['1','2','3','4','5','6','7','8']);assert.ok(classes.every(c=>c.locked&&c.start==='18:00'&&c.end==='22:00'&&c.timeZone==='Asia/Taipei'));assert.equal(classes.reduce((n,c)=>n+dailyCapacity(c.date,cfg(),[c],[],{}).fixedMinutes,0),1920);assert.equal(classes[6].title,data.biochem[6].title);assert.equal(classes[7].title,data.biochem[7].title);assert.equal(JSON.stringify(data),before);
});
test('fixed occupancy subtracts once, buffer applies only to flexible remainder, and rest/overrides do not move class',()=>{
 const classes=fixedClasses(data),day='2026-11-06',s=cfg();const d=dailyCapacity(day,s,classes,[]);assert.equal(d.total,360);assert.equal(d.fixedMinutes,240);assert.equal(d.buffer,24);assert.equal(d.flexible,96);const noBuffer=dailyCapacity(day,cfg({bufferPercent:0}),classes,[]);assert.equal(noBuffer.flexible,120);const rest=dailyCapacity(day,cfg({dateMinutes:{[day]:0}}),classes,[]);assert.equal(rest.shortfall,240);assert.equal(rest.flexible,0);assert.equal(rest.fixed[0].date,day);
});
test('deduplicates same class calendar events and merges overlapping intervals without hiding distinct conflicts',()=>{
 const classes=fixedClasses(data),day=classes[0].date,c=classes[0];const events={[day]:[{id:'same',text:c.title,startTime:'18:00',endTime:'22:00'},{id:'bound',fixedId:c.id,text:'課程'},{id:'busy',text:'就診',startTime:'17:00',endTime:'19:00'},{id:'note',text:'家事'}]};const d=dailyCapacity(day,cfg(),classes,[],events);assert.equal(d.fixedMinutes,300);assert.equal(d.timedConflicts.length,1);assert.equal(d.unknownEvents,1);assert.equal(unionMinutes([[10,50],[20,40],[50,60],[90,100]]),60);
});
test('weekly totals reserve exactly twenty percent of remaining capacity, not fixed class hours',()=>{
 const week=studyWeek('2026-11-06',cfg({weekMinutes:Array(7).fill(360)}),fixedClasses(data),[]);assert.equal(week.total,2520);assert.equal(week.fixed,240);assert.equal(week.buffer,456);assert.equal(week.remaining,1824);
});
test('fixed tasks and completed tasks remain untouched while biochemistry self review rolls normally',()=>{
 const tasks=[task('fixed',240,{planning:{version:1,fixedId:'biochem-class-1'},date:'2026-11-06'}),task('done',60,{complete:true}),task('review',60,{links:[{path:'biochem',id:'1'}]})];const result=suggest(tasks);assert.deepEqual(result.moves.map(m=>m.id),['review']);assert.equal(result.unplaced.length,2);assert.equal(result.fixed[0].date,'2026-11-06');assert.equal(tasks[0].date,'2026-11-06');assert.equal(tasks[1].complete,true);
});
test('core then normal then flexible priorities spread into available days and preserve original milestone metadata',()=>{
 const tasks=[task('flex',60,{planning:{version:1,priority:'flexible'}}),task('normal'),task('core',60,{planning:{version:1,priority:'core'}})];const result=suggest(tasks,{settings:cfg({weekMinutes:Array(7).fill(60),bufferPercent:0})});assert.deepEqual(result.moves.map(m=>[m.id,m.to]),[['core','2026-10-12'],['normal','2026-10-13'],['flex','2026-10-14']]);assert.equal(result.moves[1].patch.planning.originalDate,'2026-10-12');assert.ok(result.moves[1].patch.planning.originalWeek);assert.equal(result.feasible,false);
});
test('unknown estimates and excess work remain explicit, are not zero-load, and unplaced tasks remain in actual day loads',()=>{
 const tasks=[task('unknown',null),task('huge',200)];const result=suggest(tasks,{settings:cfg({weekMinutes:Array(7).fill(60),bufferPercent:0}),end:'2026-10-12'});assert.equal(result.moves.length,2);assert.equal(result.unplaced.length,0);assert.ok(result.moves.every(m=>m.to==='2026-10-12'));assert.ok(result.moves.every(m=>!Object.hasOwn(m.patch,'minutes')));assert.equal(result.loads[0].unknown,1);assert.equal(result.loads[0].assigned,200);assert.equal(result.loads[0].remaining,-140);assert.equal(result.feasible,false);
});
test('scheduler respects fixed and task time intervals but makes no full-hour claim for untimed work',()=>{
 const timed=task('timed',60,{date:'2026-11-05',planning:{version:1,start:'19:00',end:'20:00'}});const result=suggest([timed],{start:'2026-11-06',end:'2026-11-07',settings:cfg({weekMinutes:Array(7).fill(600),bufferPercent:0})});assert.equal(result.moves[0].to,'2026-11-07');assert.ok(result.timeCoverage.includes('時間需求未知'));const conflict=dailyCapacity('2026-11-06',cfg(),fixedClasses(data),[{...timed,date:'2026-11-06'}]);assert.equal(conflict.timedConflicts.length,1);
 const span=task('span',30,{planning:{version:1,start:'08:00',end:'10:00'}});assert.equal(dailyCapacity(span.date,cfg(),fixedClasses(data),[span]).assigned,120);
});
test('exam day and later never receive an automatic assignment; rest days and buffers are not relaxed',()=>{
 const s=cfg({examDate:'2026-10-14',weekMinutes:Array(7).fill(60),bufferPercent:20,dateMinutes:{'2026-10-12':0}});const result=suggest([task('core',60)],{settings:s,end:'2026-10-13'});assert.equal(result.moves.length,1);assert.equal(result.moves[0].to,'2026-10-13');assert.equal(result.feasible,false);assert.equal(result.fixed[0].date,'2026-11-06');assert.throws(()=>suggest([task('x')],{settings:s,end:'2026-10-14'}));assert.equal(s.dateMinutes['2026-10-12'],0);
});
test('waiting metadata retains a valid date, visibility and course links without changing awards',()=>{
 const h=local(),id=h.planner.add({title:'生化複習',minutes:60,links:[{path:'biochem',id:'1'}]});h.planner.update(id,{complete:true});h.planner.update(id,{complete:false});const award=copy(h.planner.awards()),snapshot=h.planner.snapshot(),result=suggest(h.planner.all(),{mode:'waiting'});h.planner.batch({[id]:result.moves[0].patch},{expected:snapshot});assert.equal(h.planner.get(id).date,'2026-10-12');assert.equal(h.planner.list('2026-10-12').length,0);assert.equal(h.planner.all()[0].planning.waiting,true);assert.equal(h.planner.get(id).deleted,false);assert.deepEqual(h.planner.awards(),award);const back=suggest(h.planner.all(),{mode:'date',target:'2026-10-13'});h.planner.batch({[id]:back.moves[0].patch},{expected:h.planner.snapshot()});assert.equal(h.planner.list('2026-10-13').length,1);assert.deepEqual(h.planner.awards(),award);assert.deepEqual(h.planner.get(id).links,[{path:'biochem',id:'1'}]);
});
test('preview and cancellation are pure; stale previews and locked/completed task moves have no partial local mutations',()=>{
 const h=local(),a=h.planner.add({title:'a',minutes:60}),b=h.planner.add({title:'b',minutes:60});const before=h.storage.getItem(PLANNER_KEY+'_local'),snapshot=h.planner.snapshot();const result=suggest(h.planner.all());assert.equal(h.storage.getItem(PLANNER_KEY+'_local'),before);h.planner.update(b,{complete:true});const changed=h.storage.getItem(PLANNER_KEY+'_local');assert.throws(()=>h.planner.batch(Object.fromEntries(result.moves.map(m=>[m.id,m.patch])),{expected:snapshot}));assert.equal(h.storage.getItem(PLANNER_KEY+'_local'),changed);h.planner.update(a,{planning:{version:1,priority:'normal',locked:true}});assert.throws(()=>h.planner.batch({[a]:{date:'2026-10-13'}}));assert.throws(()=>h.planner.update(a,{date:'2026-10-13'}));assert.equal(h.planner.get(a).date,'2026-10-12');
});
test('batch root transaction commits all task dates once and preserves awards, completed tasks and unrelated database paths',async()=>{
 const server=planningBackend({physiology:{keep:true},questOS:{v1:{training:{stage:3}}}}),[a,b]=clients(server);await settle(a.planner,b.planner);const x=a.planner.add({title:'x',minutes:60}),y=a.planner.add({title:'y',minutes:60}),done=a.planner.add({title:'done'});a.planner.update(done,{complete:true});await settle(a.planner,b.planner);const old=copy(server.get(PLANNER_PATH+'/'+done)),count=server.writes.length;
 a.planner.batch({[x]:{date:'2026-10-13'},[y]:{date:'2026-10-14'}},{expected:a.planner.snapshot()});await settle(a.planner,b.planner);assert.equal(server.writes.slice(count).length,1);assert.equal(server.writes.at(-1).path,PLANNER_PATH);assert.equal(b.planner.get(x).date,'2026-10-13');assert.equal(b.planner.get(y).date,'2026-10-14');assert.deepEqual(server.get(PLANNER_PATH+'/'+done),old);assert.equal(server.get('physiology/keep'),true);assert.equal(server.get('questOS/v1/training/stage'),3);
});
test('offline batches survive reload, reconnect atomically and retain zero duplicate XP',async()=>{
 const server=planningBackend(),[a,b]=clients(server);await settle(a.planner,b.planner);const x=a.planner.add({title:'x',minutes:60}),y=a.planner.add({title:'y',minutes:60});await settle(a.planner,b.planner);a.connection.online=false;a.planner.batch({[x]:{date:'2026-10-13'},[y]:{date:'2026-10-14'}});await settle(a.planner);assert.equal(server.get(PLANNER_PATH+'/'+x).date,'2026-10-12');const restored=createPlanner({storage:a.storage,events:mockEvents()});assert.equal(restored.status().batch.count,2);assert.equal(restored.get(x).date,'2026-10-13');a.connection.online=true;await a.planner.retry();await settle(a.planner,b.planner);assert.equal(b.planner.get(y).date,'2026-10-14');assert.equal(Object.keys(a.planner.awards()).length,0);assert.equal(a.planner.status().batch,null);
});
test('a remote completion stops the entire batch; discarding uses newer cloud state and does not move any task',async()=>{
 const server=planningBackend(),[a,b]=clients(server);await settle(a.planner,b.planner);const x=a.planner.add({title:'x',minutes:60}),y=a.planner.add({title:'y',minutes:60});await settle(a.planner,b.planner);b.connection.online=false;b.planner.batch({[x]:{date:'2026-10-13'},[y]:{date:'2026-10-14'}});await settle(b.planner);a.planner.update(x,{complete:true});await settle(a.planner);const count=server.writes.length;b.connection.online=true;await b.planner.retry();await settle(a.planner,b.planner);assert.ok(b.planner.status().batch.conflict);assert.equal(server.writes.length,count);assert.equal(server.get(PLANNER_PATH+'/'+y).date,'2026-10-12');b.planner.discardBatch();assert.equal(b.planner.get(x).complete,true);assert.equal(b.planner.get(x).date,'2026-10-12');assert.equal(b.planner.get(y).date,'2026-10-12');assert.equal(Object.keys(b.planner.awards()).length,1);
});
test('new occupancy on another device invalidates the full preview and no existing dates are partially moved',async()=>{
 const server=planningBackend(),[a,b]=clients(server);await settle(a.planner,b.planner);const x=a.planner.add({title:'x',minutes:60});await settle(a.planner,b.planner);b.connection.online=false;b.planner.batch({[x]:{date:'2026-10-13'}});await settle(b.planner);a.planner.add({title:'new occupancy',date:'2026-10-13',minutes:60});await settle(a.planner);b.connection.online=true;await b.planner.retry();await settle(a.planner,b.planner);assert.ok(b.planner.status().batch.conflict);assert.equal(server.get(PLANNER_PATH+'/'+x).date,'2026-10-12');
});
test('cancelling a queued batch during async preflight prevents a later root write',async()=>{
 const server=planningBackend(),{connection,db}=server.client();let release;const gate=new Promise(r=>release=r);let id=0;const p=createPlanner({db,storage:memoryStorage(),events:mockEvents(),newId:()=> 'x'+(++id),today:()=> '2026-10-12',readBatchContext:()=>gate});await settle(p);const x=p.add({title:'x'});await settle(p);p.batch({[x]:{date:'2026-10-13'}});await new Promise(r=>setImmediate(r));p.discardBatch();release(null);await settle(p);assert.equal(server.get(PLANNER_PATH+'/'+x).date,'2026-10-12');assert.equal(p.get(x).date,'2026-10-12');assert.ok(connection.online);
});
test('acknowledging the same batch after a crash is idempotent even if the task later completed',async()=>{
 const server=planningBackend(),[a,b]=clients(server);await settle(a.planner,b.planner);const x=a.planner.add({title:'x'});await settle(a.planner,b.planner);a.connection.online=false;a.planner.batch({[x]:{date:'2026-10-13'}});await settle(a.planner);const persisted=a.storage.getItem(PLANNER_KEY);a.connection.online=true;await a.planner.retry();await settle(a.planner,b.planner);b.planner.update(x,{complete:true});await settle(a.planner,b.planner);const {db}=server.client();a.storage.setItem(PLANNER_KEY,persisted);const restored=createPlanner({db,storage:a.storage,events:mockEvents()});await settle(restored);assert.equal(restored.status().batch,null);assert.equal(restored.get(x).complete,true);assert.equal(restored.get(x).date,'2026-10-13');assert.equal(Object.keys(restored.awards()).length,1);
});
test('capacity or calendar context changing before confirmation or reconnect halts the whole batch',async()=>{
 const server=planningBackend(),{db,connection}=server.client();let ctx={buffer:20},id=0;const p=createPlanner({db,storage:memoryStorage(),events:mockEvents(),newId:()=> 'x'+(++id),today:()=> '2026-10-12',batchContext:()=>ctx});await settle(p);const x=p.add({title:'x'});await settle(p);const original=copy(ctx);ctx={buffer:30};assert.throws(()=>p.batch({[x]:{date:'2026-10-13'}},{context:original}));connection.online=false;p.batch({[x]:{date:'2026-10-13'}});await settle(p);ctx={buffer:40};connection.online=true;await p.retry();await settle(p);assert.ok(p.status().batch.conflict);assert.equal(server.get(PLANNER_PATH+'/'+x).date,'2026-10-12');
});
test('fixed manual override requires confirmation, preserves original ID/title and remains protected from automatic scheduling',()=>{
 const storage=memoryStorage(),s=createStudySettings({localOnly:true,storage,events:mockEvents(),newId:()=> 'c1'}),before=storage.getItem(STUDY_SETTINGS_KEY+'_local');assert.throws(()=>s.setFixed('biochem-class-7',{date:'2026-12-19',start:'18:00',end:'22:00'}));assert.equal(storage.getItem(STUDY_SETTINGS_KEY+'_local'),before);s.setFixed('biochem-class-7',{date:'2026-12-19',start:'18:00',end:'22:00'},{confirmed:true,expected:s.config()});const c=fixedClasses(data,s.config())[6];assert.equal(c.date,'2026-12-19');assert.equal(c.course.id,'7');assert.equal(c.title,data.biochem[6].title);assert.equal(c.locked,true);assert.equal(data.biochem[6].date,'12/23 (三)');assert.throws(()=>s.set({dateMinutes:{'2026-02-30':0}}));
});
test('capacity settings sync independently and offline two-device conflicts retain both choices without touching study/life',async()=>{
 const server=planningBackend({physiology:{keep:true},habits:{'2026-10-12':{exercise:'keep'}}}),a=server.client(),b=server.client();let ca=0,cb=0;const sa=createStudySettings({db:a.db,storage:memoryStorage(),events:mockEvents(),newId:()=> 'a'+(++ca)}),sb=createStudySettings({db:b.db,storage:memoryStorage(),events:mockEvents(),newId:()=> 'b'+(++cb)});await settle(sa,sb);sa.set({bufferPercent:10});await settle(sa,sb);b.connection.online=false;sb.set({examDate:'2027-01-20'});await settle(sb);sa.set({weekMinutes:Array(7).fill(300)});await settle(sa);b.connection.online=true;await sb.retry();await settle(sa,sb);assert.ok(sb.status().conflict);sb.resolve(false);await settle(sa,sb);assert.equal(sb.config().examDate,'2027-01-16');assert.equal(sb.config().weekMinutes[0],300);assert.ok(server.writes.every(w=>w.path===STUDY_SETTINGS_PATH));assert.equal(server.get('physiology/keep'),true);assert.equal(server.get('habits/2026-10-12/exercise'),'keep');
});
test('Taipei midnight and Monday boundaries retain date semantics independent of host timezone',()=>{
 assert.equal(dateKey(new Date('2026-11-05T15:59:59Z')),'2026-11-05');assert.equal(dateKey(new Date('2026-11-05T16:00:00Z')),'2026-11-06');assert.equal(addDays('2026-12-31',1),'2027-01-01');assert.equal(studyWeek('2026-11-08',cfg(),fixedClasses(data),[]).days[0].day,'2026-11-02');assert.ok(planningSnapshotSame({links:[],_versions:{x:'1'}},{links:null,_versions:{x:'2'}}));assert.equal(taskPlanning(task('old'),data).priority,'normal');
});


test('rejected new-task validation cannot leave an orphan task or change persisted state',()=>{
 const storage=memoryStorage(),p=createPlanner({localOnly:true,storage,events:mockEvents(),newId:()=> 'bad',validateTask:()=>{throw Error('Known slot conflict');}});const before=storage.getItem(PLANNER_KEY+'_local');assert.throws(()=>p.add({title:'conflict'}));assert.deepEqual(p.all(),[]);assert.equal(storage.getItem(PLANNER_KEY+'_local'),before);
});


test('acknowledging this device own offline capacity settings does not falsely invalidate its task batch',async()=>{
 const server=planningBackend(),{db,connection}=server.client(),storage=memoryStorage();let count=0;const settings=createStudySettings({db,storage,events:mockEvents(),newId:()=> 's'+(++count)});const context=()=>({settings:settings.config(),events:{}});const p=createPlanner({db,storage,events:mockEvents(),newId:()=> 't'+(++count),today:()=> '2026-10-12',batchContext:context,readBatchContext:async()=>{await settings.retry();if(settings.status().pending)throw {code:'SETTINGS_PENDING'};return context();}});await settle(settings,p);const id=p.add({title:'x',minutes:60});await settle(p);connection.online=false;settings.set({bufferPercent:10});await settle(settings);p.batch({[id]:{date:'2026-10-13'}});await settle(p);connection.online=true;await settings.retry();await settle(settings);await p.retry();await settle(p);assert.equal(p.status().batch,null);assert.equal(server.get(PLANNER_PATH+'/'+id).date,'2026-10-13');assert.equal(settings.config().bufferPercent,10);
});

test('no-estimate tasks support date, spread and waiting without touching custom minutes or completion data',()=>{
 const tasks=[task('a',null),task('b',null),task('c',173)];const before=copy(tasks);
 const spread=suggest(tasks);assert.deepEqual(spread.moves.map(m=>m.to),['2026-10-12','2026-10-13','2026-10-14']);assert.equal(spread.feasible,false);
 for(const mode of ['date','waiting']){const r=suggest(tasks,{mode,target:'2026-10-13'});assert.equal(r.moves.length,3);assert.ok(r.moves.every(m=>!Object.hasOwn(m.patch,'minutes')));}
 assert.deepEqual(tasks,before);
});
test('optional count limits default to unlimited; rest and zero remaining budget are never assigned',()=>{
 const tasks=[task('a',null),task('b',null)];assert.equal(suggest(tasks,{end:'2026-10-12'}).moves.length,2);
 const limited=suggest(tasks,{end:'2026-10-12',settings:cfg({dailyTaskLimit:1})});assert.equal(limited.moves.length,1);assert.equal(limited.unplaced.length,1);
 assert.equal(suggest(tasks,{end:'2026-10-12',settings:cfg({dateMinutes:{'2026-10-12':0}})}).moves.length,0);
 const r=suggest(tasks,{start:'2026-11-06',end:'2026-11-07',settings:cfg({weekMinutes:Array(7).fill(240)})});assert.ok(r.moves.every(m=>m.to==='2026-11-07'));
});
test('preview date edits are pure, validate constraints and cannot bypass locks or task limits',()=>{
 const tasks=[task('a',null),task('b',143)];const settings=cfg({dailyTaskLimit:1,dateMinutes:{'2026-10-14':0}}),r=suggest(tasks,{settings});
 const args={data,settings,tasks,start:'2026-10-12',end:'2026-10-15',today:'2026-10-12'};
 const moved=reviseSchedule(r,{...args,dates:{a:'2026-10-15'}});assert.equal(moved.moves[0].to,'2026-10-15');assert.equal(r.moves[0].to,'2026-10-12');assert.equal(tasks[1].minutes,143);
 for(const day of ['','2026-10-14','2026-10-13','2027-01-16','2026-10-11'])assert.throws(()=>reviseSchedule(r,{...args,dates:{a:day}}));
 assert.throws(()=>reviseSchedule(r,{...args,tasks:[{...tasks[0],complete:true},tasks[1]]}));
});
test('progress uses independent actual course states and dated first task completions, never assigned dates',()=>{
 const unit=data.physio[0].sections[0],states={physiology:{[unit.id]:true}},tasks=[task('done',null,{date:'2026-12-01',complete:true,award:{day:'2026-10-12',xp:20}}),task('pending',null,{award:{day:'2026-10-12',xp:20}})];
 const r=progressSummary(data,states,tasks,{['physiology__'+unit.id]:{day:'2026-10-12',xp:20}},'2026-10-12');assert.equal(r.weekCourses,1);assert.equal(r.weekTasks,1);assert.equal(r.recentTasks,1);assert.equal(r.subjects[0].done,1);
 const undated=progressSummary(data,states,tasks,{},'2026-10-12');assert.equal(undated.weekCourses,0);assert.equal(undated.undatedCourses,1);
});

test('no-estimate batches reconnect across devices, preserve custom minutes and stop on remote completion',async()=>{
 const server=planningBackend(),[a,b]=clients(server);await settle(a.planner,b.planner);const x=a.planner.add({title:'no estimate'}),y=a.planner.add({title:'custom',minutes:173});await settle(a.planner,b.planner);
 a.connection.online=false;const r=suggest(a.planner.all());a.planner.batch(Object.fromEntries(r.moves.map(m=>[m.id,m.patch])),{expected:a.planner.snapshot()});await settle(a.planner);a.connection.online=true;await a.planner.retry();await settle(a.planner,b.planner);assert.equal(b.planner.get(x).date,'2026-10-12');assert.equal(b.planner.get(x).minutes,null);assert.equal(b.planner.get(y).date,'2026-10-13');assert.equal(b.planner.get(y).minutes,173);assert.deepEqual(a.planner.awards(),{});
 b.connection.online=false;const next=suggest(b.planner.all(),{mode:'date',target:'2026-10-15'});b.planner.batch(Object.fromEntries(next.moves.map(m=>[m.id,m.patch])),{expected:b.planner.snapshot()});await settle(b.planner);a.planner.update(x,{complete:true});await settle(a.planner);b.connection.online=true;await b.planner.retry();await settle(a.planner,b.planner);assert.ok(b.planner.status().batch.conflict);assert.equal(server.get(PLANNER_PATH+'/'+y).date,'2026-10-13');assert.equal(server.get(PLANNER_PATH+'/'+y).minutes,173);assert.equal(Object.keys(a.planner.awards()).length,1);
});

test('all eight formal class labels project onto the historical week titles without changing data',()=>{
 const before=JSON.stringify(data),classes=fixedClasses(data),labels=data.weeks.map(w=>studyWeekDisplayTitle(w,classes)).join(' ');
 for(const course of classes)assert.ok(labels.includes(course.date+' '+course.start+'–'+course.end));
 assert.ok(!labels.includes('第7堂(12/23)'));assert.ok(!labels.includes('(12/28)'));assert.equal(JSON.stringify(data),before);
 const edited=fixedClasses(data,cfg({fixedOverrides:{'biochem-class-8':{date:'2026-12-24',start:'17:00',end:'21:00'}}}));assert.ok(studyWeekDisplayTitle(data.weeks[12],edited).includes('2026-12-24 17:00–21:00'));
});
test('soft-deleted tasks remain retrievable after reload and cross-device restore retains the original award',async()=>{
 const server=planningBackend(),[a,b]=clients(server);await settle(a.planner,b.planner);const id=a.planner.add({title:'restore',minutes:173});a.planner.update(id,{complete:true});await settle(a.planner,b.planner);const award=copy(a.planner.get(id).award);a.planner.remove(id);await settle(a.planner,b.planner);
 const restored=createPlanner({...a,storage:a.storage,events:mockEvents()});await settle(restored);assert.equal(restored.all().find(t=>t.id===id).deleted,true);assert.deepEqual(restored.get(id).award,award);b.planner.update(id,{deleted:false});await settle(a.planner,b.planner,restored);assert.equal(restored.get(id).deleted,false);assert.equal(restored.get(id).complete,true);assert.equal(restored.get(id).minutes,173);assert.deepEqual(restored.get(id).award,award);assert.equal(Object.keys(restored.awards()).length,1);
});
