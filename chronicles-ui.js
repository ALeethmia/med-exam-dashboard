import {BUILDINGS} from './kingdom-core.js';
const node=(tag,cls='',text)=>{const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;};
// A display projection of existing snapshots, not an event log or unlock system.
export function chronicleMilestones(buildings,achievements){
 const dated=buildings.evidence.events.filter(e=>e.category==='academy'&&e.date).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 const earliest=dated[0];
 return {
  history:earliest?[{id:'earliest-recorded-course',date:earliest.date,title:'最早已記錄的學習足跡',detail:earliest.original+'。這是現有紀錄中最早的日期，不代表人生中第一次完成課程。'}]:[],
  current:[
   {id:'course-progress',title:'知識的燈火',detail:'目前完成 '+buildings.evidence.courses.done+' / '+buildings.evidence.courses.total+' 課程單元。'},
   {id:'realm-progress',title:'領地逐步成形',detail:BUILDINGS.map(b=>b.title+' · '+buildings[b.id].name).join('；')},
   {id:'achievement-progress',title:'旅途中的榮譽',detail:'目前已解鎖 '+achievements.filter(a=>a.unlocked).length+' / '+achievements.length+' 項成就，徽章收錄於成就收藏。'}
  ]
 };
}
export function createChroniclesUI(chronicles){
 const host=chronicles.querySelector('[data-chronicle-content]');
 host.innerHTML=`<div class="chronicle-tabs" role="tablist" aria-label="編年史檢視">
 <button type="button" role="tab" id="chronicle-tab-story" aria-controls="chronicle-panel-story" aria-selected="true" tabindex="0" data-chronicle-view="story">冒險故事</button>
 <button type="button" role="tab" id="chronicle-tab-milestones" aria-controls="chronicle-panel-milestones" aria-selected="false" tabindex="-1" data-chronicle-view="milestones">重要里程碑</button>
 <button type="button" role="tab" id="chronicle-tab-collection" aria-controls="chronicle-panel-collection" aria-selected="false" tabindex="-1" data-chronicle-view="collection">成就收藏</button></div>
 <section class="chronicle-panel chronicle-story" id="chronicle-panel-story" role="tabpanel" aria-labelledby="chronicle-tab-story" tabindex="0"><p class="kingdom-eyebrow">Aetheria · 冒險仍在繼續</p><p class="chronicle-state">章節旅程 · 進行中</p><p class="workspace-note">這是正在書寫的旅程。國考目標尚未有完成結果，不會因日期經過而自動通關。</p></section>
 <section class="chronicle-panel" id="chronicle-panel-milestones" role="tabpanel" aria-labelledby="chronicle-tab-milestones" tabindex="0" hidden><h3>已留下的學習足跡</h3><ul class="chronicle-milestones" id="chronicle-history"></ul><h3>目前成長</h3><p class="workspace-note">依現有紀錄呈現的目前進度；沒有可靠的歷史達標日期。</p><ul class="chronicle-milestones" id="chronicle-current"></ul></section>
 <section class="chronicle-panel" id="chronicle-panel-collection" role="tabpanel" aria-labelledby="chronicle-tab-collection" tabindex="0" hidden><h3>旅途中的徽章</h3><p class="workspace-note">沿用原有成就與解鎖規則。已解鎖與待解鎖的徽章都保留在這裡。</p><div id="achievements" class="achievement-list"></div></section>`;
 const summary=chronicles.querySelector(':scope > summary'),chapter=node('h3'),story=node('p');chapter.id='chronicle-chapter';story.id='kingdom-story';
 summary.append(chapter,story,node('small','workspace-note chronicle-expand-hint','展開或收合閱讀內容'));
 const navigation=host.querySelector('.chronicle-tabs');chronicles.before(navigation);
 const tabs=[...navigation.querySelectorAll('[role=tab]')];
 function select(index,focus=false){
  chronicles.open=true;chronicles.dataset.view=tabs[index].dataset.chronicleView;
  for(const [i,tab] of tabs.entries()){
   tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;
   host.querySelector('#'+tab.getAttribute('aria-controls')).hidden=i!==index;
  }
  if(focus)tabs[index].focus();
 }
 tabs.forEach((tab,index)=>{
  tab.onclick=()=>select(index);
  tab.onkeydown=event=>{
   const next={ArrowRight:(index+1)%tabs.length,ArrowLeft:(index+tabs.length-1)%tabs.length,Home:0,End:tabs.length-1}[event.key];
   if(next!==undefined){event.preventDefault();select(next,true);}
  };
 });
 function render({chapter,buildings,achievements}){
  chronicles.querySelector('#chronicle-chapter').textContent=chapter.label+' · '+chapter.title;
  chronicles.querySelector('#kingdom-story').textContent=chapter.story;
  const milestones=chronicleMilestones(buildings,achievements);
  for(const [key,events] of Object.entries(milestones)){
   const list=host.querySelector('#chronicle-'+key);list.replaceChildren();
   for(const event of events){
    const li=node('li','chronicle-milestone');li.dataset.milestoneId=event.id;
    li.append(node('small','workspace-note',key==='history'?event.date:'目前進度 · 日期未記錄'),node('h4','',event.title),node('p','',event.detail));list.append(li);
   }
   if(!events.length)list.append(node('li','workspace-note','尚無可確認日期的重要足跡。已有成果仍保留於目前成長，不補填未知日期。'));
  }
 }
 return {render};
}
