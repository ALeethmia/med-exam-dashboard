import {GAME_KEY, GAME_PATH, dateKey, awardKey, flattenSubjects, selectTasks, subjectStats, gameStats} from './study-core.js';

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
const save = () => localStorage.setItem(GAME_KEY, JSON.stringify(game));
const db = window.learningDB;
const states = () => window.readStudyStates();
const home = document.getElementById('tab-content-home');
const content = document.createElement('div');
content.innerHTML = `
  <div class="growth-strip"><span><strong id="growth-level">Lv. 1</strong> <span id="growth-xp">0 XP</span> · 每一次學習，都是累積</span><button class="workspace-link" data-go="progression">角色與成就 →</button></div>
  <div class="workspace-grid">
    <div class="workspace-stack">
      <section class="workspace-panel" aria-labelledby="tasks-title">
        <div class="panel-heading"><h2 id="tasks-title">今日任務</h2><span id="task-count"></span></div>
        <div class="workspace-meter" role="progressbar" aria-label="今日任務完成率" aria-valuemin="0" aria-valuemax="100" id="daily-meter"><span></span></div>
        <div id="task-list"></div>
        <p class="workspace-note">依讀書計畫推薦。完成任務即更新科目進度。</p>
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
        <div class="overall-summary"><div><span class="overall-number" id="overall-percent"></span><span class="overall-label">整體完成率</span></div><span id="overall-detail" class="workspace-note"></span></div>
        <div class="workspace-meter"><span id="overall-meter"></span></div>
        <div id="subject-summary"></div>
        <p class="workspace-note">整體依完成項目計算；影片科目依時長顯示。</p>
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
document.getElementById('retry-sync').addEventListener('click',()=>{window.retryLearningSync();void syncGame();});

function tasksForToday() {
  if (!game.days[day]) {
    game.days[day] = {tasks: selectTasks(allItems, states(), data.weeks, day)};
    save();
  }
  const list = game.days[day].tasks;
  return (Array.isArray(list) ? list : Object.values(list || {}))
    .filter(t => t && validItems.has(awardKey(t))).slice(0,3)
    .map(t => ({...validItems.get(awardKey(t)), xp:20}));
}
function openSubject(task) {
  // Clears stale filters, expands the owning unit and focuses the exact course.
  window.showStudyItem(task.path, task.id);
}
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
  const events=[{date:'2026-10-15',text:'國考報名截止'},{date:'2027-01-16',text:'第一階醫師國考'}];
  const known=new Set();
  for(const [date,entries] of Object.entries(window.readCalendarEvents() || {})) {
    if(date<day || !Array.isArray(entries)) continue;
    for(const event of entries) {
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
  const focusedTask=document.activeElement?.dataset.task;
  const current = states();
  const tasks = tasksForToday();
  const count = tasks.filter(t => current[t.path]?.[t.id]).length;
  document.getElementById('task-count').textContent = `${count} / ${tasks.length} 完成`;
  document.getElementById('today-label').textContent = new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date(day+'T12:00:00+08:00'));
  setMeter('daily-meter', tasks.length ? Math.round(count/tasks.length*100) : 0);
  const list = document.getElementById('task-list'); list.replaceChildren();
  if (!tasks.length) { const p=document.createElement('p'); p.className='workspace-note'; p.textContent='所有學習項目都已完成。今天留給複習與休息。'; list.append(p); }
  for (const task of tasks) {
    const complete = !!current[task.path]?.[task.id];
    const row=document.createElement('div'); row.className='task-row'+(complete?' is-complete':'');
    const label=document.createElement('label');
    const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=complete; cb.dataset.task=awardKey(task);
    cb.addEventListener('change', () => window.setStudyCompletion(task.path, task.id, cb.checked));
    const text=document.createElement('span'); const title=document.createElement('strong'); title.textContent=task.title;
    const meta=document.createElement('small'); meta.textContent=task.subject;
    text.append(title,meta); label.append(cb,text);
    const open=document.createElement('button'); open.className='task-open'; open.type='button'; open.textContent='查看'; open.setAttribute('aria-label','查看'+task.title); open.addEventListener('click',()=>openSubject(task));
    const xp=document.createElement('span');xp.className='task-xp';xp.textContent=game.awards[awardKey(task)]?'✓ 已獲得':'+20 XP';
    row.append(label,xp,open); list.append(row);
  }
  if(focusedTask) [...list.querySelectorAll('input')].find(input=>input.dataset.task===focusedTask)?.focus({preventScroll:true});
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
  const stats=gameStats(game.awards,day);
  document.getElementById('growth-level').textContent=`Lv. ${stats.level} · 學習者`;
  document.getElementById('growth-xp').textContent=`${stats.xp} XP`;
  document.getElementById('sidebar-level').textContent=`學習者 · Lv. ${stats.level}`;
  document.getElementById('level-title').textContent=`Lv. ${stats.level} · 學習者`;
  document.getElementById('xp-detail').textContent=`${stats.xp} XP · 距下一級 ${stats.next} XP`;
  document.getElementById('xp-meter').style.width=stats.xp%100+'%';
  document.getElementById('weekly-detail').textContent=`本週完成 ${stats.weekly} / 10 個任務 · 週一重新計算`;
  document.getElementById('weekly-meter').style.width=Math.min(100,stats.weekly/10*100)+'%';
  document.getElementById('game-sync-status').textContent=gameFailed?'成就雲端同步失敗，本機紀錄已保留；可使用重試同步。':db?'成就獨立同步，不影響原有學習紀錄。':'XP 與成就保存在此瀏覽器。';
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
    const tasks=tasksForToday();
    const result=await db.ref(`${GAME_PATH}/days/${day}`).transaction(existing=>existing || {tasks});
    const saved=result.snapshot.val();
    if (saved) game.days[day]=saved;
    // Each subject ID can award XP once, including across devices and retries.
    for(const [key, award] of Object.entries(game.awards)) {
      if (!validItems.has(key) || award.xp !== 20 || !/^\d{4}-\d{2}-\d{2}$/.test(award.day || '')) continue;
      const result=await db.ref(`${GAME_PATH}/awards/${key}`).transaction(existing=>existing || award);
      if (result.snapshot.val()) game.awards[key]=result.snapshot.val();
    }
    gameFailed=false;
    save();
  } catch { gameFailed=true; }
  finally { gameSyncing=false; render(); if(gameDirty && !gameFailed) void syncGame(); }
}
window.addEventListener('study-completed', event => {
  const task=tasksForToday().find(t=>t.path===event.detail.path && t.id===event.detail.id);
  if (task && event.detail.complete && !game.awards[awardKey(task)]) {
    game.awards[awardKey(task)]={xp:20, day};
    save();
    void syncGame();
  }
});
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
  db.ref(`${GAME_PATH}/days/${day}`).on('value', snap=>{
    if(snap.val()) { game.days[day]=snap.val(); save(); render(); }
  },()=>{gameFailed=true; render();});
}
// Refresh across midnight so legacy habits and the focus timer bind to the new date.
function checkDay() { if(dateKey()!==day) location.reload(); }
setInterval(checkDay,30000);
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) { checkDay(); void syncGame(); } });
window.addEventListener('online',()=>{window.retryLearningSync(); void syncGame();});
render();
void syncGame();
