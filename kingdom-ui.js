import {BRAND} from './chapters.js';
import {BUILDINGS,kingdomSnapshot} from './kingdom-core.js';
import {lifeSummary} from './life-core.js';
import {dateKey} from './study-core.js';
const node=(tag,cls='',text)=>{const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;};
export function createKingdomUI({data,states,planner,settings,life,today=()=>dateKey()}) {
  const page=document.getElementById('tab-content-kingdom');page.classList.add('kingdom-page');
  page.innerHTML=`<section class="kingdom-intro"><p class="kingdom-eyebrow">${BRAND.concept} · Aetheria</p><h2>Chapter I <span>學者的試煉</span></h2><p id="kingdom-story"></p><div class="kingdom-chapter-meta"><span id="kingdom-exam"></span><span>章節旅程 · 進行中</span><span>正式考試結果 · 尚未記錄</span></div></section>
  <section class="kingdom-territory" aria-labelledby="kingdom-domain-title"><div class="panel-heading"><div><p class="kingdom-eyebrow">艾瑟利亞 · 邊境領地</p><h3 id="kingdom-domain-title">第一盞燈火，已經點亮。</h3></div><span class="workspace-note">初始領地</span></div><img class="kingdom-map" src="/public/art/aetheria.svg" alt="艾瑟利亞邊境：森林與山脈間的奧術學院、王國要塞與皇家兵營" width="960" height="380"><div id="kingdom-buildings" class="kingdom-buildings"></div></section>
  <section class="workspace-panel kingdom-reality" aria-labelledby="kingdom-reality-title"><div class="panel-heading"><h3 id="kingdom-reality-title">現實中的每一步</h3><span class="workspace-note">沿用學習與生活紀錄</span></div><div class="kingdom-life"><div><h4>今日學習</h4><p id="kingdom-study"></p><a href="#" data-kingdom-go="home">回到今日任務 →</a></div><div><h4>運動與恢復</h4><p id="kingdom-exercise"></p><a href="#" data-kingdom-go="exercise">查看運動計畫 →</a></div><div><h4>休閒與平衡</h4><p id="kingdom-leisure"></p></div></div><div id="kingdom-subjects"></div><p class="workspace-note">課程完成與每日任務各自記錄；休息、暫停或未安排都不代表失敗。</p></section>
  <section class="kingdom-outlook"><div><h3>章節里程碑</h3><ul id="kingdom-milestones"></ul><p class="workspace-note">準備進度和王國里程碑不代表考試通過。考試延期或日期經過，既有成果仍保留。</p></div><div><h3>旅程的下一頁</h3><p>奧術研究 · 軍隊招募 · 迷霧森林遠征 · 魔獸與遺跡探索</p><p class="workspace-note">未來開放</p><p class="workspace-note">研究點連結學習，訓練點連結適合的運動，士氣點連結合理休息。尚未啟用資源結算。</p></div></section><details id="kingdom-chronicles" class="workspace-panel kingdom-chronicles"><summary>我的編年史</summary><p class="workspace-note">保留每一步學習的成果。歷史 XP 只作紀錄，不是王國資源，也不會換算成研究點、訓練點或士氣點。</p><p id="xp-detail"></p><p id="game-sync-status" class="workspace-note" role="status"></p><div id="achievements" class="achievement-list"></div><details class="planner-history"><summary>舊時間目標紀錄</summary><div id="legacy-time-history"></div></details></details><p class="kingdom-footer">${BRAND.slogan}<br>${BRAND.meaning}</p>`;
  const buildings=page.querySelector('#kingdom-buildings');for(const building of BUILDINGS){const card=node('article','kingdom-building');card.dataset.building=building.id;card.append(node('p','kingdom-eyebrow','初始建築'),node('h4','',building.title),node('p','',building.role),node('small','workspace-note',building.detail));buildings.append(card);}
  page.querySelectorAll('[data-kingdom-go]').forEach(link=>link.onclick=event=>{event.preventDefault();window.switchTab(link.dataset.kingdomGo);});
  function openChronicles(){const chronicles=page.querySelector('#kingdom-chronicles');chronicles.open=true;chronicles.scrollIntoView({block:'start'});chronicles.querySelector('summary').focus({preventScroll:true});window.openChroniclesRequested=false;}
  window.openKingdomChronicles=openChronicles;
  if(window.openChroniclesRequested)openChronicles();
  function render(){
    const day=today(),training=life.training(),snapshot=kingdomSnapshot({data,states:states(),settings:settings.config(),day,goals:lifeSummary(planner,day,training,life.habits(day)),training}),chapter=snapshot.chapter;
    page.querySelector('#kingdom-story').textContent=chapter.story;
    page.querySelector('#kingdom-exam').textContent=chapter.goal+' · '+chapter.examDate+' · '+(chapter.examTiming==='elapsed'?'考試日期已過，結果待確認':chapter.examTiming==='today'?'今天是考試日':`倒數 ${chapter.daysRemaining} 天`);
    page.querySelector('#kingdom-study').textContent=snapshot.study.label;
    page.querySelector('#kingdom-exercise').textContent=snapshot.exercise.label;
    page.querySelector('#kingdom-leisure').textContent=(snapshot.leisure.title?snapshot.leisure.title+' · ':'')+snapshot.leisure.label;
    const subjects=page.querySelector('#kingdom-subjects');subjects.replaceChildren();for(const subject of snapshot.subjects){const row=node('div','kingdom-subject');row.dataset.subject=subject.path;row.append(node('span','',subject.title),node('span','',`已完成 ${subject.done} · 剩餘 ${subject.remaining} · ${subject.percent}%`));subjects.append(row);}
    const academy=buildings.querySelector('[data-building=academy]');let note=academy.querySelector('[data-course-summary]');if(!note){note=node('p','kingdom-academy-progress');note.dataset.courseSummary='';academy.append(note);}note.textContent=`課程 ${snapshot.courses.done} / ${snapshot.courses.total} 單元 · 剩餘 ${snapshot.courses.remaining}`;
    const milestones=page.querySelector('#kingdom-milestones');milestones.replaceChildren();for(const milestone of snapshot.milestones)milestones.append(node('li','',`${milestone.reached?'已達成':'待累積'} · ${milestone.title} — ${milestone.detail}`));
  }
  return {render,openChronicles};
}
