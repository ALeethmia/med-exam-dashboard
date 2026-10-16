import {projectTask} from './src/planner/task-projection.js';
import {preserveRewardCache} from './legacy-rewards.js';
const learningStorage=window.learningStorage;
import {showVersion} from './src/ui/version-ui.js';
import {createCourseDates} from './course-dates.js';
import {createGrowthUI} from './src/study/growth-ui.js';
import {createKingdomUI} from './src/kingdom/kingdom-ui.js';
import {createStudySettings,normalizeSettings,STUDY_SETTINGS_PATH} from './adaptive-store.js';
import {fixedClasses,interval,calendarConstraints,studyWeekDisplayTitle} from './src/planner/adaptive-core.js';
import {createAdaptiveUI} from './src/planner/adaptive-ui.js';
import {createPlanner} from './daily-planner.js';
import {createPlannerUI} from './src/planner/planner-ui.js';
import {createWeekPlanUI} from './src/planner/week-plan-ui.js';
import {createTimeTasks} from './time-tasks.js';
import {createLifeStore} from './life-store.js';
import {createLifeUI} from './src/study/life-ui.js';
import {GAME_KEY, GAME_PATH, COURSE_PROGRESS_NOTE, dateKey, awardKey, flattenSubjects, subjectStats, gameStats} from './src/study/study-core.js';

const preservedRewards=preserveRewardCache(learningStorage);
const data = window.studyData;
if (!data) throw new Error('課程資料未能載入');
const allItems = flattenSubjects(data);
const validItems = new Map(allItems.map(t => [awardKey(t), t]));
let game = {days:{}, awards:{}};
try {
  const saved = JSON.parse(learningStorage.getItem(GAME_KEY) || '{}');
  game = {days:saved.days || {}, awards:saved.awards || {}};
} catch {}
let day = dateKey();
let gameSyncing = false;
let gameDirty = false;
let gameFailed = false;
const save = () => learningStorage.setItem(GAME_KEY, JSON.stringify(game));
const db = window.learningDB;
const states = () => window.readStudyStates();
const courseDates=createCourseDates({keys:new Set(validItems.keys()),db,lifecycle:window.i3Runtime?.lifecycle,localOnly:window.workspaceLocalOnly,writer:window.courseSync,onChange:()=>{window.SubjectUI?.refreshDates?.();window.updateWorkspace?.();}});
window.courseDates={...courseDates,today:()=>dateKey(),day:key=>Object.hasOwn(courseDates.records(),key)?courseDates.records()[key]?.day||null:game.awards[key]?.day||null};
const initiallyCompleted=new Set(allItems.filter(item=>states()[item.path]?.[item.id]).map(awardKey));
// A durable course request owns its original day; replaying this handoff is first-only.
window.prepareCourseDates=changes=>Object.fromEntries(Object.entries(changes).filter(([path,complete])=>complete&&!initiallyCompleted.has(path.replace('/','__'))&&!game.awards[path.replace('/','__')]).map(([path])=>[path.replace('/','__'),dateKey()]));
window.acceptCourseDates=()=>{window.SubjectUI?.refreshDates?.();return true;};
void window.courseSync?.pump();
window.addEventListener('study-completed',event=>{const {path,id,complete}=event.detail,key=path+'__'+id;if(complete&&validItems.has(key)&&!initiallyCompleted.has(key)&&!game.awards[key])courseDates.set(key,dateKey(),{firstOnly:true});});

const timeTasks=createTimeTasks({db,localOnly:window.workspaceLocalOnly,day,onChange:()=>window.updateWorkspace?.()});
let studySettings;
function studyContext(){return {settings:studySettings?.config()||normalizeSettings(),events:window.readCalendarEvents()||{},courses:window.readConfirmedStudyStates?.()||states()};}
async function readStudyContext(){
  if(!db||window.workspaceLocalOnly)return studyContext();
  await studySettings.retry();
  if(studySettings.status().pending)throw {code:'SETTINGS_PENDING'};
  const [config,events,...courses]=await Promise.all([db.ref(STUDY_SETTINGS_PATH).once('value'),db.ref('custom_events').once('value'),...['videos','biochem','physiology','pharmacology'].map(path=>db.ref(path).once('value'))]);
  return {settings:normalizeSettings(config.val()||{}),events:events.val()||{},courses:Object.fromEntries(['videos','biochem','physiology','pharmacology'].map((path,i)=>[path,courses[i].val()||{}]))};
}
function validateStudyTask(task,{batch=false}={}){
  if(task.deleted)return;
  const range=interval(task.planning?.start,task.planning?.end);if(!range||task.planning?.waiting||task.planning?.fixedId)return;
  const busy=calendarConstraints(task.date,fixedClasses(data,studySettings?.config()||normalizeSettings()),window.readCalendarEvents()||{});
  if(busy.items.some(e=>range[0]<e.range[1]&&e.range[0]<range[1]))throw new Error('任務時段與固定課程／定時行程衝突，請調整時段。');
  if(!batch&&planner.all().some(other=>{if(other.id===task.id||other.deleted||other.planning?.waiting||other.date!==task.date)return false;const slot=interval(other.planning?.start,other.planning?.end);return slot&&range[0]<slot[1]&&slot[0]<range[1];}))throw new Error('任務時段與其他已安排任務衝突，請調整時段。');
}
const planner=createPlanner({db,localOnly:window.workspaceLocalOnly,onChange:()=>window.updateWorkspace?.(),batchContext:studyContext,readBatchContext:readStudyContext,validateTask:validateStudyTask,projectTask:task=>projectTask(task,{data,states:states(),status:window.i3Runtime?.read().status||'loading'}),canOperate:()=>window.i3Runtime?.read().status==='ready'});
studySettings=createStudySettings({db,localOnly:window.workspaceLocalOnly,onChange:()=>{window.updateWorkspace?.();window.renderCalendar?.();window.renderBiochemUnits?.();if(studySettings&&!studySettings.status().pending)void planner.retry();}});
window.fixedStudySchedule=()=>fixedClasses(data,studySettings.config());
window.studyExamDate=()=>studySettings.config().examDate;
window.studyDateKey=()=>dateKey();
window.biochemScheduleLabel=id=>{const c=window.fixedStudySchedule().find(c=>c.course.id===String(id));return c?'🔒 固定課程 · '+c.date+' '+c.start+'–'+c.end+'（台灣時間）':null;};
window.studyWeekLabel=week=>studyWeekDisplayTitle(week,window.fixedStudySchedule());
window.refreshBiochemScheduleDisplay=()=>{
  const classes=window.fixedStudySchedule(),dates=classes.map(c=>c.date).sort();
  const period=document.getElementById('biochem-course-period');if(period)period.textContent='正式課程：'+dates[0]+'–'+dates.at(-1)+' · 台灣時間（各堂時段見課程）';
  for(const chip of document.querySelectorAll('.biochem-filter-btn')){
    if(chip.dataset.week==='ALL')continue;
    const courses=data.biochem.filter(c=>c.weekKey===chip.dataset.week).map(c=>classes.find(slot=>slot.course.id===String(c.id)));
    chip.textContent='原計畫第 '+chip.dataset.week.slice(1)+' 週 · '+courses.map(c=>'第'+c.course.id+'堂 '+c.date+' '+c.start+'–'+c.end).join('／');
  }
};
const life=createLifeStore({db,localOnly:window.workspaceLocalOnly,onChange:()=>window.updateWorkspace?.(),onHabits:(date,habits)=>window.applyLifeHabits?.(date,habits),mergeLegacy:(date,value)=>window.mergeLearningSnapshot('habits/'+date,value)});
window.lifeHabits={set:life.setHabit};
window.readLifeHabits=life.habits;
window.readLifeExercise=life.exercise;
window.eligibleLifeHabits=(date,habits)=>{
  const exercise=life.exercise(date),leisure=habits.questOS_v1?.leisure;
  return ['daily-exam',...(!['symptom_rest','not_scheduled'].includes(exercise.status)?['daily-sport']:[]),...(leisure?.status==='not_scheduled'?[]:['daily-game'])];
};
const home = document.getElementById('tab-content-home');
const content = document.createElement('div');
content.innerHTML = `

  <div class="workspace-grid">
    <div class="workspace-stack">
      <section class="workspace-panel" aria-labelledby="tasks-title">
        <div class="panel-heading"><h2 id="tasks-title">今日任務</h2><span id="task-count"></span></div>
        <div class="workspace-meter" role="progressbar" aria-label="今日任務完成率" aria-valuemin="0" aria-valuemax="100" id="daily-meter"><span></span></div>
        <div id="task-list"></div>
        <p class="workspace-note">自主安排每天的學習；課程任務依課程進度；一般任務獨立勾選。完成任務不再新增 XP。</p>
      </section>
      <section class="workspace-panel" aria-labelledby="week-title">
        <div class="panel-heading"><h2 id="week-title">本週計畫</h2><button class="workspace-link" data-go="plan">全部週次 →</button></div>
        <div class="week-summary"><strong id="current-week"></strong><span id="current-week-percent"></span></div>
        <p id="current-week-description" class="workspace-note"></p>
        <div class="workspace-meter success" role="progressbar" aria-label="本週計畫完成率" aria-valuemin="0" aria-valuemax="100" id="week-meter"><span></span></div>
        <p id="current-week-range" class="workspace-note"></p>
      </section>
    </div>
    <div class="workspace-stack">
      <section class="workspace-panel" aria-labelledby="progress-title">
        <div class="panel-heading"><h2 id="progress-title">科目進度</h2><button class="workspace-link" data-go="subjects">所有科目 →</button></div>
        <div class="overall-summary"><div><span class="overall-number" id="overall-percent"></span><span class="overall-label">整體完成率（按單元數）</span></div><span id="overall-detail" class="workspace-note"></span></div>
        <div class="workspace-meter"><span id="overall-meter"></span></div>
        <div id="subject-summary"></div>
        <p class="workspace-note" data-course-progress-basis>${COURSE_PROGRESS_NOTE}</p>
      </section>
      <section class="workspace-panel" aria-labelledby="upcoming-title">
        <div class="panel-heading"><h2 id="upcoming-title">近期日程</h2><button class="workspace-link" data-go="calendar">行事曆 →</button></div>
        <div id="upcoming-list"></div>
      </section>
    </div>
  </div>`;
home.prepend(content);
const brandNote=document.createElement('p');brandNote.className='workspace-note becoming-home-brand';brandNote.textContent='Becoming · Your life. Your story. Your world.';home.append(brandNote);
const readAwards=()=>({...game.awards,...timeTasks.awards(),...planner.awards()});
window.growthPlanner=planner;
window.courseCatalogKeys=new Set(validItems.keys());
const legacyNotice=document.createElement('p');legacyNotice.className='workspace-note';legacyNotice.dataset.legacyRewards='';legacyNotice.textContent='歷史 XP 僅供回顧，不影響領主等級。舊待同步獎勵不自動補發。';document.querySelector('.workspace-main').prepend(legacyNotice);
const plannerUI=createPlannerUI({data,planner,states});
const lifeUI=createLifeUI({store:life,planner});
const weekUI=createWeekPlanUI({data,openPlanner:week=>plannerUI.open(week)});
const adaptiveUI=createAdaptiveUI({data,planner,settings:studySettings,context:studyContext,states,courseAwards:()=>game.awards,events:()=>window.readCalendarEvents()||{}});
const kingdomUI=createKingdomUI({data,states:()=>window.readConfirmedStudyStates?.()||states(),planner,settings:studySettings,life,awards:readAwards,courseDates:()=>courseDates.records()});
const growthUI=createGrowthUI({data,states,planner,life,awards:readAwards,courseAwards:()=>game.awards,courseDates:()=>courseDates.records()});
window.renderBiochemUnits?.();window.renderCalendar?.();
document.querySelectorAll('[data-go]').forEach(button=>button.addEventListener('click',()=>window.switchTab(button.dataset.go)));
const appearance=document.getElementById('appearance');
function updateAppearanceControls() {
  appearance.value=window.getAppearance();
  document.querySelectorAll('[data-appearance]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.appearance===window.getAppearance())));
}
appearance.addEventListener('change',()=>window.setAppearance(appearance.value));
document.querySelectorAll('[data-appearance]').forEach(button=>button.addEventListener('click',()=>window.setAppearance(button.dataset.appearance)));
window.addEventListener('appearance-change',updateAppearanceControls); updateAppearanceControls();
document.getElementById('mobile-menu').addEventListener('click',()=>{
  const open=document.getElementById('workspace-nav').classList.toggle('mobile-open');
  document.getElementById('mobile-menu').setAttribute('aria-expanded',String(open));
});
document.getElementById('retry-sync').addEventListener('click',()=>{if(window.i3Runtime?.read().status==='error'){window.i3Runtime.retry();return;}window.retryLearningSync();void courseDates.retry();void syncGame();void timeTasks.retry();void planner.retry();void life.retry();void studySettings.retry();});

function setMeter(id, percent) {
  const meter = document.getElementById(id);
  meter.querySelector('span').style.width = percent+'%';
  meter.setAttribute('aria-valuenow',String(percent));
}
function renderPlanningSummary() {
  const week=data.weeks.find(w=>day>=w.start && day<=w.end);
  const percent=week?window.readWeekCompletion(week.w):0;
  document.getElementById('current-week').textContent=week?`第 ${week.w} 週`:'讀書計畫';
  document.getElementById('current-week-percent').textContent=week?percent+'%':'';
  document.getElementById('current-week-description').textContent=week?week.title.split('＋')[0].trim():'目前不在 16 週計畫期間，依自己的需要安排複習。';
  document.getElementById('current-week-range').textContent=week?`${week.start.slice(5).replace('-','/')} – ${week.end.slice(5).replace('-','/')} · 沿用既有週計畫進度`:'';
  setMeter('week-meter',percent);
  const events=[{date:'2026-10-15',text:'國考報名截止'},{date:studySettings.config().examDate,text:'第一階醫師國考'}];
  for(const c of window.fixedStudySchedule())events.push({date:c.date,text:'🔒 固定課程 · '+c.start+'–'+c.end+' '+c.title});
  const known=new Set();
  for(const [date,entries] of Object.entries(window.readCalendarEvents() || {})) {
    if(date<day || !Array.isArray(entries)) continue;
    for(const event of entries) {
      if(window.fixedStudySchedule().some(c=>event.fixedId===c.id||(c.date===date&&(event.text===c.title||/^鐸鐸生化(?:課|正式課|班)?$/.test(event.text||'')))))continue;
      const key=event.id || date+'__'+event.text;
      if(known.has(key))continue;known.add(key);events.push({date,text:event.text});
    }
  }
  const list=document.getElementById('upcoming-list');list.replaceChildren();
  for(const event of events.filter(e=>e.date>=day).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,3)) {
    const row=document.createElement('div');row.className='upcoming-row';
    const date=document.createElement('time');date.dateTime=event.date;date.textContent=event.date.slice(5).replace('-','/');
    const title=document.createElement('span');title.textContent=event.text;row.append(date,title);list.append(row);
  }
  if(!list.children.length) {const message=document.createElement('p');message.className='workspace-note';message.textContent='近期沒有安排，留些彈性給自己。';list.append(message);}
}

function render() {
  if(typeof planner!=='undefined'){const held=planner.status().held.length+(timeTasks.held?.().length||0);const el=document.querySelector('[data-legacy-rewards]');if(el)el.textContent='歷史 XP 僅供回顧，不影響領主等級。'+(held||preservedRewards||window.becomingStorage?.legacyKeys().length?'偵測到舊獎勵／快取，已隔離保留，未自動補發；需人工核對。':'新任務不再發放 XP。');}
  window.SubjectUI?.refreshDates?.();
  const current=states();
  document.getElementById('today-label').textContent=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date(day+'T12:00:00+08:00'));
  window.refreshBiochemScheduleDisplay();plannerUI.render();weekUI.refresh();lifeUI.render();adaptiveUI.render();kingdomUI.render();growthUI.render();
  const legacy=document.getElementById('legacy-time-history');legacy.replaceChildren();
  const historical=timeTasks.history();
  for(const date of Object.keys(historical).filter(date=>Object.keys(historical[date]).length).sort().reverse()){const row=document.createElement('p');row.className='workspace-note';row.textContent=date+' · '+Object.entries(historical[date]).map(([id,task])=>({morning:'上午',afternoon:'下午',review:'複習'}[id]||id)+': '+(task.complete?'完成':'未完成')+(task.awarded?'（已領 XP）':'')).join(' · ');legacy.append(row);}
  if(!legacy.children.length){const row=document.createElement('p');row.className='workspace-note';row.textContent='尚無舊時間目標紀錄。';legacy.append(row);}
  const subjects=subjectStats(data,current);
  const done=subjects.reduce((s,t)=>s+t.done,0), total=subjects.reduce((s,t)=>s+t.total,0);
  const percent=Math.round(done/total*100);
  document.getElementById('overall-percent').textContent=percent+'%';
  document.getElementById('overall-meter').style.width=percent+'%';
  document.getElementById('overall-detail').textContent=`${done} / ${total} 項目`;
  const summary=document.getElementById('subject-summary'); summary.replaceChildren();
  for(const subject of subjects) {
    const button=document.createElement('button'); button.className='subject-row'; button.type='button'; button.addEventListener('click',()=>window.switchTab(subject.tab));
    button.innerHTML='<span class="row-heading"><span></span><span></span></span><div class="workspace-meter"><span></span></div><small></small>';
    const spans=button.querySelectorAll('.row-heading span'); spans[0].textContent=subject.title; spans[1].textContent=subject.percent+'%';
    button.querySelector('.workspace-meter span').style.width=subject.percent+'%';
    button.querySelector('small').textContent=`${subject.done} / ${subject.total} ${subject.unit}`;
    summary.append(button);
  }
  renderPlanningSummary();
  const stats=gameStats(readAwards(),day);
  document.getElementById('xp-detail').textContent=`歷史 ${stats.xp} XP（不決定目前等級）`;
  document.getElementById('game-sync-status').textContent=(gameFailed||timeTasks.failed()||planner.status().error)?'成就雲端同步失敗，本機紀錄已保留；可使用重試同步。':db?'歷史獎勵唯讀；新任務不再發放 XP。':'XP 與成就保存在此瀏覽器。';

}
window.updateWorkspace = render;

async function syncGame() { /* Historical ledger is read-only; no cached reward replay. */ }
window.addEventListener('learning-change', render);
window.addEventListener('storage', event => {
  if (event.key===GAME_KEY) {
    try { const incoming=JSON.parse(event.newValue || '{}'); game.days={...game.days,...incoming.days}; game.awards={...game.awards,...incoming.awards}; } catch {}
  }
  window.refreshStudyStates(); render();
});
if (db && !window.workspaceLocalOnly) {
  db.ref(`${GAME_PATH}/awards`).on('value', snap => {
    game.awards={...(snap.val() || {})}; save(); render();
  },()=>{gameFailed=true; render();});

}
// Refresh across midnight so legacy habits and the focus timer bind to the new date.
function checkDay() { if(dateKey()!==day) location.reload(); }
setInterval(checkDay,30000);
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) { checkDay(); void syncGame();void timeTasks.retry();void planner.retry();void life.retry();void studySettings.retry(); } });
window.addEventListener('online',()=>{window.retryLearningSync();void courseDates.retry(); void syncGame();void timeTasks.retry();void planner.retry();void life.retry();void studySettings.retry();});
render();
void syncGame();
void timeTasks.retry();void planner.retry();void life.retry();void studySettings.retry();

void showVersion();

window.addEventListener('learning-read-ready',()=>{void planner.retry();void timeTasks.retry();void courseDates.retry();void life.retry();void studySettings.retry();window.retryLearningSync();window.updateWorkspace?.();});
