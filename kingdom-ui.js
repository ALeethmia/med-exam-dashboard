import {createChroniclesUI} from './chronicles-ui.js';
import {buildingProgressSnapshot} from './territory-core.js';
import {createTerritoryUI} from './territory-ui.js';
import {BRAND} from './chapters.js';
import {kingdomSnapshot} from './kingdom-core.js';
import {lifeSummary} from './life-core.js';
import {dateKey,gameStats,COURSE_PROGRESS_NOTE} from './study-core.js';
const node=(tag,cls='',text)=>{const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;};
export function createKingdomUI({data,states,planner,settings,life,awards=()=>({}),courseDates=()=>({}),today=()=>dateKey()}) {
  const page=document.getElementById('tab-content-kingdom');page.classList.add('kingdom-page');
  page.innerHTML=`<section class="workspace-panel lord-profile" aria-labelledby="lord-name"><img class="lord-emblem" src="/public/art/lord-emblem.svg" alt="原創匿名學者領主徽章：兜帽、書本與符文" width="88" height="88"><div class="lord-identity"><p class="kingdom-eyebrow">冒險者公會證 · Aetheria</p><h2 id="lord-name">我的領主</h2><p class="lord-title">學者領主 · 邊境開拓者</p><p class="workspace-note">Aetheria／艾瑟利亞</p><p id="lord-chapter" class="lord-chapter"></p></div><div class="lord-card-progress"><div class="lord-summary"><span id="lord-study-count"></span><span id="lord-achievements-count"></span></div><a id="lord-open-chronicles" href="#kingdom-chronicles">查看我的編年史 →</a></div></section><section class="kingdom-intro"><p class="kingdom-eyebrow">${BRAND.concept} · Aetheria</p><h2>Chapter I <span>學者的試煉</span></h2><div class="kingdom-chapter-meta"><span id="kingdom-exam"></span><span>章節旅程 · 進行中</span><span>正式考試結果 · 尚未記錄</span></div></section>
  <section class="kingdom-territory" aria-labelledby="kingdom-domain-title"><div class="panel-heading"><div><p class="kingdom-eyebrow">艾瑟利亞 · 邊境領地</p><h3 id="kingdom-domain-title">第一盞燈火，已經點亮。</h3></div><span class="workspace-note">成長概覽</span></div><img class="kingdom-map" src="/public/art/aetheria.svg" alt="艾瑟利亞邊境：森林與山脈間的奧術學院、王國要塞與皇家兵營" width="960" height="380"><div id="kingdom-buildings" class="kingdom-buildings"></div></section>
  <section class="workspace-panel kingdom-reality" aria-labelledby="kingdom-reality-title"><div class="panel-heading"><h3 id="kingdom-reality-title">現實中的每一步</h3><span class="workspace-note">沿用學習與生活紀錄</span></div><div class="kingdom-life"><div><h4>今日學習</h4><p id="kingdom-study"></p><a href="#" data-kingdom-go="home">回到今日任務 →</a></div><div><h4>運動與恢復</h4><p id="kingdom-exercise"></p><a href="#" data-kingdom-go="exercise">查看運動計畫 →</a></div><div><h4>休閒與平衡</h4><p id="kingdom-leisure"></p></div></div><div id="kingdom-subjects"></div><p class="workspace-note">課程完成與每日任務各自記錄；休息、暫停或未安排都不代表失敗。</p><p class="workspace-note" data-course-progress-basis>${COURSE_PROGRESS_NOTE}</p></section>
  <details id="kingdom-chronicles" class="workspace-panel kingdom-chronicles"><summary>我的編年史 <span id="chronicle-achievement-count" class="workspace-note"></span></summary><div data-chronicle-content></div><details id="chronicle-detailed-history" class="chronicle-detailed-history"><summary>詳細歷史資料</summary><p class="workspace-note">原有 XP 與歷史紀錄完整保留，不換算為王國資源。</p><p id="xp-detail"></p><p id="game-sync-status" class="workspace-note" role="status"></p><details class="planner-history"><summary>舊時間目標紀錄</summary><div id="legacy-time-history"></div></details></details></details><p class="kingdom-footer">${BRAND.slogan}<br>${BRAND.meaning}</p>`;
  page.querySelector('.kingdom-territory').after(page.querySelector('#kingdom-chronicles'));
  const territory=createTerritoryUI(page);
  const chroniclesUI=createChroniclesUI(page.querySelector('#kingdom-chronicles'));
  page.querySelectorAll('[data-kingdom-go]').forEach(link=>link.onclick=event=>{event.preventDefault();window.switchTab(link.dataset.kingdomGo);});
  function openChronicles(){const chronicles=page.querySelector('#kingdom-chronicles');chronicles.open=true;chronicles.scrollIntoView({block:'start'});chronicles.querySelector('summary').focus({preventScroll:true});window.openChroniclesRequested=false;}
  page.querySelector('#lord-open-chronicles').onclick=event=>{event.preventDefault();openChronicles();};
  window.openKingdomChronicles=openChronicles;
  if(window.openChroniclesRequested)openChronicles();
  function render(){
    const day=today(),training=life.training(),snapshot=kingdomSnapshot({data,states:states(),settings:settings.config(),day,goals:lifeSummary(planner,day,training,life.habits(day)),training}),chapter=snapshot.chapter;
    const achievements=gameStats(awards(),day).achievements,unlocked=achievements.filter(a=>a.unlocked).length;
    page.querySelector('#lord-achievements-count').textContent=`已解鎖 ${unlocked} / ${achievements.length} 項成就`;
    page.querySelector('#chronicle-achievement-count').textContent=`已解鎖 ${unlocked} / ${achievements.length}`;
    page.querySelector('#lord-study-count').textContent=`已完成 ${snapshot.courses.done} 學習單元`;
    page.querySelector('#lord-chapter').textContent=chapter.label+' · '+chapter.title;
    page.querySelector('#kingdom-exam').textContent=chapter.goal+' · '+chapter.examDate+' · '+(chapter.examTiming==='elapsed'?'考試日期已過，結果待確認':chapter.examTiming==='today'?'今天是考試日':`倒數 ${chapter.daysRemaining} 天`);
    page.querySelector('#kingdom-study').textContent=snapshot.study.label;
    page.querySelector('#kingdom-exercise').textContent=snapshot.exercise.label;
    page.querySelector('#kingdom-leisure').textContent=(snapshot.leisure.title?snapshot.leisure.title+' · ':'')+snapshot.leisure.label;
    const subjects=page.querySelector('#kingdom-subjects');subjects.replaceChildren();for(const subject of snapshot.subjects){const row=node('div','kingdom-subject');row.dataset.subject=subject.path;row.append(node('span','',subject.title),node('span','',`已完成 ${subject.done} · 剩餘 ${subject.remaining} · ${subject.percent}% · ${['videos','pharmacology'].includes(subject.path)?'依影片時長':'依單元數'}`));subjects.append(row);}
    const territoryInput={data,states:states(),day,habits:life.recordedHabits(),courseDates:courseDates()};
    territory.render(territoryInput);
    chroniclesUI.render({chapter,buildings:buildingProgressSnapshot(territoryInput),achievements});
  }
  return {render,openChronicles};
}
