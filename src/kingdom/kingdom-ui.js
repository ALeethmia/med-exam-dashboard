import {growthPercent} from './realm-growth.js';
import {mapKingdomReadOnly,captureExistingReadModel} from './readonly-mapping.js';
import {createI2aMap} from './i2a-map.js?v=i2b';
import {createChroniclesUI} from './chronicles-ui.js';
import {buildingProgressSnapshot} from './territory-core.js';
import {createTerritoryUI} from './territory-ui.js';
import {BRAND} from './chapters.js';
import {kingdomSnapshot} from './kingdom-core.js';
import {lifeSummary} from '../study/life-core.js';
import {dateKey,gameStats,COURSE_PROGRESS_NOTE} from '../study/study-core.js';
const node=(tag,cls='',text)=>{const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;};
export function createKingdomUI({data,states,planner,settings,life,awards=()=>({}),courseDates=()=>({}),today=()=>dateKey()}) {
  const page=document.getElementById('tab-content-kingdom');page.classList.add('kingdom-page');
  page.innerHTML=`<section class="workspace-panel lord-profile" aria-labelledby="lord-name"><img class="lord-emblem" src="./public/art/lord-emblem.svg" alt="原創匿名學者領主徽章：兜帽、書本與符文" width="88" height="88"><div class="lord-identity"><p class="kingdom-eyebrow">冒險者公會證 · 唯讀來源</p><h2 id="lord-name">身份尚未取得</h2><p class="lord-title">學者領主 · 邊境開拓者</p><p class="workspace-note">Aetheria／艾瑟利亞</p><p id="lord-chapter" class="lord-chapter"></p></div><div class="lord-card-progress"><div class="lord-summary"><span id="lord-xp-level"></span><span id="lord-study-count"></span><span id="lord-achievements-count"></span></div><p class="workspace-note" id="lord-realm-progress"></p><progress id="lord-realm-meter" max="1" value="0" aria-label="王國整體發展進度"></progress><a id="lord-open-chronicles" href="#kingdom-chronicles">查看我的編年史 →</a></div></section><div class="kingdom-chapter-meta"><span id="kingdom-exam"></span><span>章節旅程 · 進行中</span><span>正式考試結果 · 尚未記錄</span></div>
  <section class="kingdom-territory" aria-labelledby="kingdom-domain-title"><div class="panel-heading"><div><p class="kingdom-eyebrow">艾瑟利亞 · 邊境領地</p><h3 id="kingdom-domain-title">Chapter 1 — 初始之地</h3></div><span class="workspace-note">成長概覽</span></div><div class="i2a-map-layout"><div class="i2a-map-pane" data-map-host></div><div id="kingdom-buildings" class="kingdom-buildings"></div></div></section>
  <section class="workspace-panel kingdom-reality" aria-labelledby="kingdom-reality-title"><div class="panel-heading"><h3 id="kingdom-reality-title">現實中的每一步</h3><span class="workspace-note">沿用學習與生活紀錄</span></div><div class="kingdom-life"><div><h4>今日學習</h4><p id="kingdom-study"></p><a href="#" data-kingdom-go="home">回到今日任務 →</a></div><div><h4>運動與恢復</h4><p id="kingdom-exercise"></p><a href="#" data-kingdom-go="exercise">查看運動計畫 →</a></div><div><h4>休閒與平衡</h4><p id="kingdom-leisure"></p></div></div><div id="kingdom-subjects"></div><p class="workspace-note">課程型任務依課程進度；一般任務獨立記錄；休息、暫停或未安排都不代表失敗。</p><p class="workspace-note" data-course-progress-basis>${COURSE_PROGRESS_NOTE}</p></section>
  <details id="kingdom-chronicles" class="workspace-panel kingdom-chronicles"><summary>我的編年史 <span id="chronicle-achievement-count" class="workspace-note"></span></summary><div data-chronicle-content></div><details id="chronicle-detailed-history" class="chronicle-detailed-history"><summary>詳細歷史資料</summary><p class="workspace-note">原有 XP 與歷史紀錄完整保留，不換算為王國資源。</p><p id="xp-detail"></p><p id="game-sync-status" class="workspace-note" role="status"></p><details class="planner-history"><summary>舊時間目標紀錄</summary><div id="legacy-time-history"></div></details></details></details><p class="kingdom-footer">${BRAND.slogan}<br>${BRAND.meaning}</p>`;
  const loadStatus=node('div','i3-load-status');loadStatus.dataset.loadStatus='';loadStatus.setAttribute('role','status');loadStatus.append(node('span'));const retry=node('button','','重試讀取');retry.type='button';retry.onclick=()=>window.i3Runtime?.retry();loadStatus.append(retry);page.prepend(loadStatus);
  const characterStory=node('section','character-story');characterStory.setAttribute('aria-label','角色與故事');
  const profile=page.querySelector('.lord-profile'),chronicles=page.querySelector('#kingdom-chronicles');
  const chronicleCard=node('section','workspace-panel chronicle-card');chronicleCard.setAttribute('aria-labelledby','chronicle-card-title');
  const heading=node('div','chronicle-card-heading');heading.append(node('h2','','我的編年史'),page.querySelector('#chronicle-achievement-count'));heading.firstChild.id='chronicle-card-title';
  chronicles.classList.remove('workspace-panel');chronicles.querySelector(':scope > summary').replaceChildren();
  chronicleCard.append(heading,chronicles);profile.before(characterStory);characterStory.append(profile,chronicleCard);
  const territory=createTerritoryUI(page);
  const liteMap=createI2aMap(page);
  const chroniclesUI=createChroniclesUI(page.querySelector('#kingdom-chronicles'));
  page.querySelectorAll('[data-kingdom-go]').forEach(link=>link.onclick=event=>{event.preventDefault();window.switchTab(link.dataset.kingdomGo);});
  function openChronicles(){const chronicles=page.querySelector('#kingdom-chronicles');chronicles.open=true;// I2a: adjacent cards, no forced scroll.
chronicles.querySelector('summary').focus({preventScroll:true});window.openChroniclesRequested=false;}
  page.querySelector('#lord-open-chronicles').onclick=event=>{event.preventDefault();openChronicles();};
  window.openKingdomChronicles=openChronicles;
  if(window.openChroniclesRequested)openChronicles();
  function render(){
    const state=window.i3Runtime?.read()||{status:'signedOut',epoch:0};
    const known=state.status==='ready';
    const model=mapKingdomReadOnly(captureExistingReadModel({data,readStudyStates:states,life,courseDates:{records:courseDates},readAwards:awards,readIdentity:()=>state.identity,settings,today,status:state.status,sessionEpoch:state.epoch,kind:window.i3FixtureOnly?'fixture':'readonly',readiness:Object.fromEntries(['data','states','habits','courseDates','awards','identity','settings','day'].map(k=>[k,known]))}));
    const statusNode=page.querySelector('[data-load-status]');statusNode.dataset.state=state.status;
    statusNode.querySelector('span').textContent=({loading:'正在等待首次完整資料快照…',ready:'資料快照已就緒（空紀錄亦為有效結果）',error:'資料讀取失敗；未顯示舊進度。',signedOut:'尚未登入；未載入任何個人進度。'})[state.status]||'尚未取得';
    statusNode.querySelector('button').hidden=state.status!=='error';
    const {lord,chapter,stats}=model,achievements=stats?.achievements||[],unlocked=achievements.filter(a=>a.unlocked).length;
    // Collection shares the same loaded snapshot as the lord and chronicle summary.
    const collection=page.querySelector('#achievements');collection.replaceChildren();
    if(!stats)collection.append(node('p','workspace-note','成就資料尚未取得。'));
    else for(const achievement of achievements){const item=node('div','achievement'+(achievement.unlocked?' unlocked':''));item.append(node('strong','',achievement.title),node('small','achievement-status',achievement.unlocked?'已解鎖':'待解鎖'),node('small','',achievement.detail));collection.append(item);}
    page.querySelector('#lord-name').textContent=lord.name||'身份尚未取得';
    page.querySelector('.lord-identity>.kingdom-eyebrow').textContent=model.kind==='fixture'?'冒險者公會證 · 去識別化 Fixture':'冒險者公會證 · 唯讀來源';
    page.querySelector('#lord-xp-level').textContent=model.growth.available?`Lv. ${lord.level} · 王國整體 ${growthPercent(model.growth.progress)}`:'領主等級尚未取得';
    page.querySelector('#lord-realm-progress').textContent=model.growth.available?`學院 ${growthPercent(model.growth.academy)} ×40% · 兵營 ${growthPercent(model.growth.barracks)} ×40% · 要塞 ${growthPercent(model.growth.keep)} ×20%。依目前 ${model.growth.catalogCount} 個課程計算；目錄變更會重算。`:'正在等待有效課程及活動紀錄。';
    const meter=page.querySelector('#lord-realm-meter');meter.hidden=!model.growth.available;if(model.growth.available)meter.value=model.growth.progress;
    page.querySelector('#lord-achievements-count').textContent=stats?`已解鎖 ${unlocked} / ${achievements.length} 項成就`:'成就資料尚未取得';
    page.querySelector('#chronicle-achievement-count').textContent=stats?`已解鎖 ${unlocked} / ${achievements.length}`:'尚未取得';
    page.querySelector('#lord-study-count').textContent=model.courses?`已完成 ${model.courses.done} 學習單元`:'學習進度尚未取得';
    page.querySelector('#lord-chapter').textContent=chapter.label+' · '+chapter.title;
    page.querySelector('#kingdom-exam').textContent=chapter.examDate?chapter.goal+' · '+chapter.examDate+' · '+(chapter.examTiming==='elapsed'?'考試日期已過，結果待確認':chapter.examTiming==='today'?'今天是考試日':`倒數 ${chapter.daysRemaining} 天`):'考試日期尚未取得';
    page.querySelector('#kingdom-study').textContent=model.courses?`${model.courses.done} / ${model.courses.total} 課程單元`:'尚未取得';
    page.querySelector('#kingdom-exercise').textContent=model.availability.barracks?`${model.territory.evidence.training} 個已有證據的訓練日`:'尚未取得';
    page.querySelector('#kingdom-leisure').textContent=model.availability.keep?`${model.territory.evidence.activityDays} 個已有證據的活動日`:'尚未取得';
    const subjects=page.querySelector('#kingdom-subjects');subjects.replaceChildren();for(const subject of model.subjects||[]){const row=node('div','kingdom-subject');row.dataset.subject=subject.path;row.append(node('span','',subject.title),node('span','',`已完成 ${subject.done} · 剩餘 ${subject.total-subject.done} · ${subject.percent}%`));subjects.append(row);}
    territory.render(model.territoryInput,{buildings:{...model.territory,...model.buildings},activity:model.activity});
    liteMap.update(model);
    if(model.chronicles)chroniclesUI.render({chapter,buildings:model.territory,achievements});else{page.querySelector('#chronicle-chapter').textContent='編年史尚未取得';page.querySelector('#kingdom-story').textContent='來源尚未完整載入，不補造學習足跡或歷史達標日期。';for(const key of ['history','current'])page.querySelector('#chronicle-'+key).replaceChildren(node('li','workspace-note','尚未取得可呈現的編年史資料。'));}
  }
  const unsubscribe=window.i3Runtime?.subscribe(()=>render());
  return {render,openChronicles,dispose(){unsubscribe?.();liteMap.dispose();}};
}
