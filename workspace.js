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
  <p id="local-banner" class="local-banner hidden">本機模式 · 學習紀錄只保存在此瀏覽器，不連接正式資料庫。</p>
  <div class="workspace-grid">
    <section class="workspace-panel" aria-labelledby="tasks-title">
      <div class="panel-heading"><h2 id="tasks-title">今日任務</h2><span id="task-count"></span></div>
      <p id="today-label" class="workspace-eyebrow"></p>
      <div class="workspace-meter" role="progressbar" aria-label="今日任務完成率" aria-valuemin="0" aria-valuemax="100" id="daily-meter"><span></span></div>
      <div id="task-list"></div>
      <p class="workspace-note">依目前週次推薦 3 個未完成項目。勾選即更新原有學科進度，每個項目首次完成今日任務可得 20 XP。</p>
    </section>
    <section class="workspace-panel" aria-labelledby="progress-title">
      <div class="panel-heading"><h2 id="progress-title">學習進度</h2><span>四科總覽</span></div>
      <span class="overall-number" id="overall-percent"></span><span class="overall-label">學習項目完成率</span>
      <div class="workspace-meter"><span id="overall-meter"></span></div>
      <p class="workspace-note" id="overall-detail"></p>
      <div id="subject-summary"></div>
    </section>
  </div>
  <section class="workspace-panel game-summary" aria-label="學習成就">
    <div><h3 id="level-title"></h3><p id="xp-detail"></p><div class="workspace-meter"><span id="xp-meter"></span></div><p id="game-sync-status" role="status"></p></div>
    <div><h3>每週挑戰</h3><p id="weekly-detail"></p><div class="workspace-meter"><span id="weekly-meter"></span></div></div>
    <div style="grid-column:1/-1"><h3>小小的里程碑</h3><div class="achievement-list" id="achievements"></div></div>
  </section>`;
home.prepend(content);
document.getElementById('local-banner').classList.toggle('hidden', !window.workspaceLocalOnly);
const appearance = document.getElementById('appearance');
appearance.value = window.getAppearance();
appearance.addEventListener('change', () => window.setAppearance(appearance.value));
document.getElementById('retry-sync').addEventListener('click', () => { window.retryLearningSync(); void syncGame(); });
for (const [id,title] of [['stats','學習統計'],['calendar','行事曆'],['schedule','作息與習慣'],['exercise','運動計畫'],['plan','讀書計畫']]) {
  const heading = document.createElement('h2'); heading.className='workspace-page-title'; heading.textContent=title;
  document.getElementById('tab-content-'+id).prepend(heading);
}

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
  const tab = ({videos:'anatomy',physiology:'physiology',biochem:'biochem',pharmacology:'pharmacology'})[task.path];
  // Clear stale search/filter state so the selected task can always be found.
  window.showStudyItem(task.path, task.id);
  window.switchTab(tab);
  document.getElementById('tab-content-'+tab).scrollIntoView({block:'start', behavior:'smooth'});
}
function setMeter(id, percent) {
  const meter = document.getElementById(id);
  meter.querySelector('span').style.width = percent+'%';
  meter.setAttribute('aria-valuenow',String(percent));
}
function render() {
  const current = states();
  const tasks = tasksForToday();
  const count = tasks.filter(t => current[t.path]?.[t.id]).length;
  document.getElementById('task-count').textContent = `${count} / ${tasks.length} 完成`;
  document.getElementById('today-label').textContent = day.replaceAll('-',' / ');
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
    const meta=document.createElement('small'); meta.textContent=`${task.subject} · ${game.awards[awardKey(task)] ? 'XP 已獲得' : '+20 XP'}`;
    text.append(title,meta); label.append(cb,text);
    const open=document.createElement('button'); open.className='task-open'; open.type='button'; open.textContent='查看'; open.setAttribute('aria-label','查看'+task.title); open.addEventListener('click',()=>openSubject(task));
    row.append(label,open); list.append(row);
  }
  const subjects=subjectStats(data,current);
  const done=subjects.reduce((s,t)=>s+t.done,0), total=subjects.reduce((s,t)=>s+t.total,0);
  const percent=Math.round(done/total*100);
  document.getElementById('overall-percent').textContent=percent+'%';
  document.getElementById('overall-meter').style.width=percent+'%';
  document.getElementById('overall-detail').textContent=`${done} / ${total} 個項目 · 各科進度保留原有計算方式`;
  const summary=document.getElementById('subject-summary'); summary.replaceChildren();
  for(const subject of subjects) {
    const button=document.createElement('button'); button.className='subject-row'; button.type='button'; button.addEventListener('click',()=>window.switchTab(subject.tab));
    button.innerHTML='<span class="row-heading"><span></span><span></span></span><div class="workspace-meter"><span></span></div><small></small>';
    const spans=button.querySelectorAll('.row-heading span'); spans[0].textContent=subject.title; spans[1].textContent=subject.percent+'%';
    button.querySelector('.workspace-meter span').style.width=subject.percent+'%';
    button.querySelector('small').textContent=`${subject.done} / ${subject.total} ${subject.unit}`;
    summary.append(button);
  }
  const stats=gameStats(game.awards,day);
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
