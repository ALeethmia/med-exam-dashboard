import {createStudySettings,normalizeSettings,STUDY_SETTINGS_PATH} from './adaptive-store.js';
import {fixedClasses,interval,calendarConstraints} from './adaptive-core.js';
import {createAdaptiveUI} from './adaptive-ui.js';
import {createPlanner} from './daily-planner.js';
import {createPlannerUI} from './planner-ui.js';
import {createWeekPlanUI} from './week-plan-ui.js';
import {createTimeTasks} from './time-tasks.js';
import {createLifeStore} from './life-store.js';
import {createLifeUI} from './life-ui.js';
import {GAME_KEY, GAME_PATH, dateKey, awardKey, flattenSubjects, subjectStats, gameStats} from './study-core.js';

const data = window.studyData;
if (!data) throw new Error('課程資料未能載入');
const allItems = flattenSubjects(data);
const validItems = new Map(allItems.map(t => [awardKey(t), t]));
let game = {days:{}, awards:{}};
try {
  const saved = JSON.parse(localStorage.getItem(GAME_KEY) || '{}');
  game = {days:saved.days || {}, awards:saved.awards || {}};
} catch {}
let day = dateKey();
let gameSyncing = false;
let gameDirty = false;
let gameFailed = false;
let lastLevel=null;
let levelNoticeTimer;
const save = () => localStorage.setItem(GAME_KEY, JSON.stringify(game));
const db = window.learningDB;
const states = () => window.readStudyStates();
const timeTasks=createTimeTasks({db,localOnly:window.workspaceLocalOnly,day,onChange:()=>window.updateWorkspace?.()});
let studySettings;
function studyContext(){return {settings:studySettings?.config()||normalizeSettings(),events:window.readCalendarEvents()||{}};}
async function readStudyContext(){
  if(!db||window.workspaceLocalOnly)return studyContext();
  await studySettings.retry();
  if(studySettings.status().pending)throw {code:'SETTINGS_PENDING'};
  const [config,events]=await Promise.all([db.ref(STUDY_SETTINGS_PATH).once('value'),db.ref('custom_events').once('value')]);
  return {settings:normalizeSettings(config.val()||{}),events:events.val()||{}};
}
function validateStudyTask(task,{batch=false}={}){
  const range=interval(task.planning?.start,task.planning?.end);if(!range||task.planning?.waiting||task.planning?.fixedId)return;
  const busy=calendarConstraints(task.date,fixedClasses(data,studySettings?.config()||normalizeSettings()),window.readCalendarEvents()||{});
  if(busy.items.some(e=>range[0]<e.range[1]&&e.range[0]<range[1]))throw new Error('任務時段與固定課程／定時行程衝突，請調整時段。');
  if(!batch&&planner.all().some(other=>{if(other.id===task.id||other.deleted||other.planning?.waiting||other.date!==task.date)return false;const slot=interval(other.planning?.start,other.planning?.end);return slot&&range[0]<slot[1]&&slot[0]<range[1];}))throw new Error('任務時段與其他已安排任務衝突，請調整時段。');
}
const planner=createPlanner({db,localOnly:window.workspaceLocalOnly,onChange:()=>window.updateWorkspace?.(),batchContext:studyContext,readBatchContext:readStudyContext,validateTask:validateStudyTask});
studySettings=createStudySettings({db,localOnly:window.workspaceLocalOnly,onChange:()=>{window.updateWorkspace?.();window.renderCalendar?.();window.renderBiochemUnits?.();if(studySettings&&!studySettings.status().pending)void planner.retry();}});
window.fixedStudySchedule=()=>fixedClasses(data,studySettings.config());
window.studyExamDate=()=>studySettings.config().examDate;
window.studyDateKey=()=>dateKey();
window.biochemScheduleLabel=id=>{const c=window.fixedStudySchedule().find(c=>c.course.id===String(id));return c?'🔒 固定課程 · '+c.date+' '+c.start+'–'+c.end+'（台灣時間）':null;};
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
  <div class="growth-strip"><span><strong id="growth-level">Lv. 1</strong> <span id="growth-xp">0 XP</span> · 每一次學習，都是累積 <span id="level-notice" role="status"></span></span><button class="workspace-link" data-go="progression">角色與成就 →</button></div>
  <div class="workspace-grid">
    <div class="workspace-stack">
      <section class="workspace-panel" aria-labelledby="tasks-title">
        <div class="panel-heading"><h2 id="tasks-title">今日任務</h2><span id="task-count"></span></div>
        <div class="workspace-meter" role="progressbar" aria-label="今日任務完成率" aria-valuemin="0" aria-valuemax="100" id="daily-meter"><span></span></div>
        <div id="task-list"></div>
        <p class="workspace-note">自主安排每天的學習；課程完成請在科目頁另行勾選。</p>
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
        <div class="overall-summary"><div><span class="overall-number" id="overall-percent"></span><span class="overall-label">已追蹤課程完成率</span></div><span id="overall-detail" class="workspace-note"></span></div>
        <div class="workspace-meter"><span id="overall-meter"></span></div>
        <div id="subject-summary"></div>
        <p class="workspace-note">整體依四科 115 個項目計算；生理與生化依項目數，解剖與藥理依影片時長。</p>
      </section>
      <section class="workspace-panel" aria-labelledby="upcoming-title">
        <div class="panel-heading"><h2 id="upcoming-title">近期日程</h2><button class="workspace-link" data-go="calendar">行事曆 →</button></div>
        <div id="upcoming-list"></div>
      </section>
    </div>
  </div>`;
home.prepend(content);
const progression=document.getElementById('tab-content-progression');
progression.innerHTML=`<section class="workspace-panel game-summary" aria-label="學習成就">
  <div><h3 id="level-title"></h3><p id="xp-detail"></p><div class="workspace-meter"><span id="xp-meter"></span></div><p id="game-sync-status" role="status"></p></div>
  <div><h3>每週挑戰</h3><p id="weekly-detail"></p><div class="workspace-meter success"><span id="weekly-meter"></span></div></div>
  <div style="grid-column:1/-1"><h3>學習里程碑</h3><div class="achievement-list" id="achievements"></div></div>
</section><p class="workspace-note">XP 記錄學習行動，不代表醫學知識熟練度。休息不會扣除已累積的成長。</p>`;
const plannerUI=createPlannerUI({data,planner,states});
const lifeUI=createLifeUI({store:life,planner});
const weekUI=createWeekPlanUI({data,openPlanner:week=>plannerUI.open(week)});
const adaptiveUI=createAdaptiveUI({data,planner,settings:studySettings,context:studyContext,states,events:()=>window.readCalendarEvents()||{}});
window.renderBiochemUnits?.();window.renderCalendar?.();
const legacyHistory=document.createElement('details');legacyHistory.className='planner-history';legacyHistory.innerHTML='<summary>舊時間目標紀錄</summary><div id="legacy-time-history"></div>';progression.append(legacyHistory);
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
document.getElementById('retry-sync').addEventListener('click',()=>{window.retryLearningSync();void syncGame();void timeTasks.retry();void planner.retry();void life.retry();void studySettings.retry();});

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
  const current=states();
  document.getElementById('today-label').textContent=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date(day+'T12:00:00+08:00'));
  plannerUI.render();weekUI.refresh();lifeUI.render();adaptiveUI.render();
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
  const stats=gameStats({...game.awards,...timeTasks.awards(),...planner.awards()},day);
  if(lastLevel!==null && stats.level>lastLevel){const notice=document.getElementById('level-notice');notice.textContent='升到 Lv. '+stats.level;clearTimeout(levelNoticeTimer);levelNoticeTimer=setTimeout(()=>{notice.textContent='';},8000);}
  lastLevel=stats.level;
  document.getElementById('growth-level').textContent=`Lv. ${stats.level} · 學習者`;
  document.getElementById('growth-xp').textContent=`${stats.xp} XP`;
  document.getElementById('sidebar-level').textContent=`學習者 · Lv. ${stats.level}`;
  document.getElementById('level-title').textContent=`Lv. ${stats.level} · 學習者`;
  document.getElementById('xp-detail').textContent=`${stats.xp} XP · 距下一級 ${stats.next} XP`;
  document.getElementById('xp-meter').style.width=stats.xp%100+'%';
  document.getElementById('weekly-detail').textContent=`本週完成 ${stats.weekly} / 10 個任務 · 週一重新計算`;
  document.getElementById('weekly-meter').style.width=Math.min(100,stats.weekly/10*100)+'%';
  document.getElementById('game-sync-status').textContent=(gameFailed||timeTasks.failed()||planner.status().error)?'成就雲端同步失敗，本機紀錄已保留；可使用重試同步。':db?'成就獨立同步，不影響原有學習紀錄。':'XP 與成就保存在此瀏覽器。';
  const achievements=document.getElementById('achievements'); achievements.replaceChildren();
  for(const a of stats.achievements) {
    const el=document.createElement('div'); el.className='achievement'+(a.unlocked?' unlocked':''); el.textContent=(a.unlocked?'✓ ':'○ ')+a.title;
    const detail=document.createElement('small'); detail.textContent=a.detail; el.append(detail); achievements.append(el);
  }
}
window.updateWorkspace = render;

async function syncGame() {
  if (!db || window.workspaceLocalOnly) return;
  if (gameSyncing) { gameDirty=true; return; }
  gameDirty=false;
  gameSyncing=true;
  try {
    // Each subject ID can award XP once, including across devices and retries.
    for(const [key, award] of Object.entries(game.awards)) {
      if (!validItems.has(key) || award.xp !== 20 || !/^\d{4}-\d{2}-\d{2}$/.test(award.day || '')) continue;
      const result=await db.ref(`${GAME_PATH}/awards/${key}`).transaction(existing=>existing || award);
      if (result.snapshot.val()) game.awards[key]=result.snapshot.val();
    }
    gameFailed=false;
    save();
  } catch { gameFailed=true; }
  finally { gameSyncing=false; render(); if(gameDirty && !gameFailed) void syncGame();void timeTasks.retry();void planner.retry(); }
}
window.addEventListener('learning-change', render);
window.addEventListener('storage', event => {
  if (event.key===GAME_KEY) {
    try { const incoming=JSON.parse(event.newValue || '{}'); game.days={...game.days,...incoming.days}; game.awards={...game.awards,...incoming.awards}; } catch {}
  }
  window.refreshStudyStates(); render();
});
if (db && !window.workspaceLocalOnly) {
  db.ref(`${GAME_PATH}/awards`).on('value', snap => {
    game.awards={...game.awards,...(snap.val() || {})}; save(); render();
  },()=>{gameFailed=true; render();});

}
// Refresh across midnight so legacy habits and the focus timer bind to the new date.
function checkDay() { if(dateKey()!==day) location.reload(); }
setInterval(checkDay,30000);
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) { checkDay(); void syncGame();void timeTasks.retry();void planner.retry();void life.retry();void studySettings.retry(); } });
window.addEventListener('online',()=>{window.retryLearningSync(); void syncGame();void timeTasks.retry();void planner.retry();void life.retry();void studySettings.retry();});
render();
void syncGame();
void timeTasks.retry();void planner.retry();void life.retry();void studySettings.retry();
