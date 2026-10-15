import {BUILDINGS} from './kingdom-core.js';
import {buildingProgressSnapshot,realmActivityGroups,ACADEMY_STAGES,BARRACKS_STAGES,KEEP_STAGES,COURSE_THRESHOLDS,TRAINING_THRESHOLDS} from './territory-core.js';
const node=(tag,cls='',text)=>{const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const names={academy:ACADEMY_STAGES,barracks:BARRACKS_STAGES,keep:KEEP_STAGES};
const insignia={
 academy:'<path d="M4 6h6l2 2 2-2h6v13h-6l-2 2-2-2H4zM12 8v13M6 10h3M6 13h3M16 10l1-2 1 2 2 1-2 1-1 2-1-2-2-1z"/>',
 barracks:'<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6zM9 7l7 10M8 13l4-3M15 7l-7 10M12 10l4 3"/>',
 keep:'<path d="M4 21V9h4v3h3V6h3v6h3V9h3v12zM10 21v-5h4v5M12 6V2h6l-2 2 2 2z"/>'
};
const growth={academy:'每完成一堂課程，都為學院添上一頁知識。',barracks:'每一次有效訓練，都讓守護領地的力量更穩固。',keep:'學習、運動與休閒，都能為領地帶來成長。'};
// Presentation only: targets come from the existing stage thresholds and route requirements.
function targetView(id,b,e){
 if(b.stage===5)return {next:'已達最高階段',number:id==='academy'?String(e.courses.done):id==='barracks'?String(e.training):String(e.activityDays),unit:id==='academy'?'已完成課程':id==='barracks'?'累積有效訓練':'累積活動日',remaining:'最高階段已達成，繼續累積你的成果。',progress:100};
 if(id==='academy'){
  if(!e.courses.total)return {next:names[id][b.stage],number:'—',unit:'尚無課程資料',remaining:'完成第一堂課程，為學院點亮燈火。',progress:0};
  const required=Math.ceil(e.courses.total*COURSE_THRESHOLDS[b.stage]/100);
  return {next:names[id][b.stage],number:e.courses.done+' / '+required,unit:'課程單元',remaining:'再完成 '+Math.max(0,required-e.courses.done)+' 堂課程即可升級',progress:b.progress};
 }
 if(id==='barracks'){
  const required=TRAINING_THRESHOLDS[b.stage];
  return {next:names[id][b.stage],number:e.training+' / '+required,unit:'有效訓練',remaining:'再完成 '+Math.max(0,required-e.training)+' 次訓練即可升級',progress:b.progress};
 }
 const available=b.nextPaths.filter(p=>p.requirements.every(r=>r.available));
 const closest=[...available].sort((a,c)=>a.requirements.reduce((n,r)=>n+r.gap,0)-c.requirements.reduce((n,r)=>n+r.gap,0))[0];
 if(!closest)return {next:names[id][b.stage],number:'—',unit:'尚無可用紀錄',remaining:'開始學習或記錄活動，讓領地逐步成長。',progress:0};
 const gaps=closest.requirements.filter(r=>r.gap>0).map(r=>r.kind==='courses'?r.gap+' 堂課程':r.gap+' 個活動日');
 const limiting=[...closest.requirements].sort((a,c)=>a.progress-c.progress)[0];
 return {next:names[id][b.stage],number:limiting.actual+' / '+limiting.required,unit:limiting.kind==='courses'?'課程單元':'活動日',remaining:'再完成 '+gaps.join('與 ')+'即可升級',progress:closest.progress};
}
function progressMeter(label){const meter=node('div','workspace-meter');meter.setAttribute('role','progressbar');meter.setAttribute('aria-label',label);meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax','100');meter.setAttribute('aria-valuenow','0');meter.append(node('span'));return meter;}
function eventNode(event){
 const li=node('li','realm-event');li.dataset.eventId=event.id;
 li.append(node('small','workspace-note',event.date||'日期未記錄'),node('strong','',event.original));
 if(event.detail==='目前未勾選完成；保留首次日期紀錄')li.append(node('p','workspace-note','曾完成，目前已取消勾選'));
 return li;
}
function recentEvents(groups,id,limit){
 const unique=new Map();
 for(const event of [...groups.dated,...groups.undated])if((id==='keep'||event.category===id)&&!unique.has(event.id))unique.set(event.id,event);
 return [...unique.values()].slice(0,limit);
}
function pathText(path){return path.requirements.map(r=>r.available?(r.kind==='courses'?'課程 ':'活動日 ')+r.actual+' / '+r.required+(r.kind==='courses'?' 單元':' 天'):'課程資料尚未載入').join(' · ');}
function pathNode(path){
 const li=node('li','keep-path');li.dataset.path=path.id;
 li.append(node('h6','',(path.id==='study'?'學習路線':'跨領域路線')+' · '+(path.met?'已達標':'尚未達標')));
 for(const r of path.requirements)li.append(node('p','keep-requirement',r.available?(r.kind==='courses'?'課程':'活動日')+'：目前 '+r.actual+' / '+r.required+' '+r.unit+'，尚差 '+r.gap+' '+r.unit:'課程資料尚未載入'));
 return li;
}
function sourceText(id,e){
 if(id==='academy')return '依各科目前勾選完成的課程計算，單元門檻向上取整，不以四捨五入的百分比判定。學習時數、任務與 XP 不計入課程進度。';
 if(id==='barracks')return '依已載入的運動完成紀錄計算；正常與低強度替代訓練，每日最多計一次。包含 '+e.legacyTraining+' 次舊運動打卡。休息、未安排與待完成不計；另有 '+e.ambiguousTraining+' 筆互相矛盾的紀錄未計入。這是可確認的累積次數，歷史資料可能不完整。';
 return '依目前課程完成數與運動、休閒的完成日期計算；同一天兩種活動只算一個活動日。學習路線或跨領域路線任一達標即可升級，不要求連續登入或每天完成所有活動。歷史資料可能不完整。';
}
export function createTerritoryUI(page){
 const container=page.querySelector('#kingdom-buildings');
 for(const {id,title} of BUILDINGS){
  const card=node('article','kingdom-building');card.dataset.building=id;
  const details=node('details','building-details');details.id='building-'+id;
  const summary=node('summary');
  const heading=node('div','building-heading'),sigil=node('span','building-sigil');sigil.setAttribute('aria-hidden','true');sigil.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'+insignia[id]+'</svg>';heading.append(sigil,node('h4','',title));
  summary.append(heading,node('small','building-stage-label workspace-note','目前階段'),node('p','building-stage'),node('p','building-next-target'),node('p','building-number'),node('small','building-unit workspace-note'),progressMeter(title+'下一階段進度'));
  if(id==='keep')summary.append(node('small','building-fastest-label workspace-note','最快達成的建設條件'),node('p','building-progress-label'),node('div','keep-route-overview'));
  else summary.append(node('p','building-progress-label'));
  summary.append(node('small','building-metric workspace-note'),node('small','building-open-hint','最近成果與成長故事 ›'));
  const body=node('div','building-detail-body');body.append(node('p','building-growth',growth[id]),node('h5','','最近成果'),node('ul','building-events'));
  const navigation=node('a','building-navigation',id==='academy'?'前往課程 →':id==='barracks'?'前往運動紀錄 →':'前往今日活動 →');navigation.href='#';navigation.onclick=event=>{event.preventDefault();window.switchTab(id==='academy'?'subjects':id==='barracks'?'exercise':'home');};body.append(navigation);
  const basis=node('details','building-basis');basis.append(node('summary','','資料來源與計算說明'),node('p','building-source workspace-note'),node('p','workspace-note','成果依已記錄日期由新到舊排列；沒有日期的成果排在後面，標示「日期未記錄」。紀錄所屬日期不代表實際完成時刻，也不推測缺少的歷史日期。'),node('p','workspace-note','目前階段依現有紀錄判定；更正課程或活動會重新計算。休息與未登入不扣分。'),node('h5','','詳細升級門檻'));
  if(id==='keep')basis.append(node('h6','','目前階段'),node('ul','keep-current-paths'));
  basis.append(node('ul','building-next'));body.append(basis);details.append(summary,body);card.append(details);container.append(card);
 }
 const activity=node('details','workspace-panel realm-activity');activity.id='realm-activity';activity.append(node('summary','','領地紀事'),node('p','workspace-note','每一步都留下足跡。先看有日期的成果，再回顧未記日期的成果。'),node('ul','realm-events'));
 const note=node('details','realm-history-note');note.append(node('summary','workspace-note','關於紀事日期'),node('p','workspace-note','只使用已記錄的完成日期；未記日期的成果無法判定何時發生。紀事不把目前建築階段當作新事件，也不推測缺少的歷史紀錄。'));activity.append(note);
 page.querySelector('.kingdom-territory').after(activity);
 function render(input,projection=null){
  const buildings=projection?.buildings||buildingProgressSnapshot(input),groups=projection?.activity||realmActivityGroups(buildings),e=buildings.evidence;
  for(const {id,title} of BUILDINGS){
   const b=buildings[id],details=container.querySelector('#building-'+id);if(b.available===false){for(const cls of ['building-stage','building-next-target','building-number','building-unit','building-progress-label','building-metric','building-fastest-label','building-source']){const el=details.querySelector('.'+cls);if(el)el.textContent=cls==='building-stage'?'尚未取得':cls==='building-source'?b.reason:'';}details.querySelector('.workspace-meter').hidden=true;for(const cls of ['building-events','building-next','keep-route-overview','keep-current-paths'])details.querySelector('.'+cls)?.replaceChildren();continue;}details.querySelector('.workspace-meter').hidden=false;const view=targetView(id,b,e);
   details.querySelector('.building-stage').textContent=b.name;
   details.querySelector('.building-next-target').textContent=b.stage===5?view.next:'下一階段 · '+view.next;
   details.querySelector('.building-number').textContent=view.number;
   details.querySelector('.building-unit').textContent=view.unit;
   details.querySelector('.building-progress-label').textContent=view.remaining;
   const meter=details.querySelector('[role=progressbar]');meter.setAttribute('aria-valuenow',String(Math.floor(view.progress)));meter.setAttribute('aria-valuetext',view.number+' '+view.unit+'；'+view.remaining);meter.firstChild.style.width=view.progress+'%';
   details.querySelector('.building-metric').textContent=id==='academy'?'總進度 '+e.courses.done+' / '+e.courses.total+' 單元':id==='barracks'?'累積有效訓練 '+e.training+' 次':'';
   const events=recentEvents(groups,id,3);details.querySelector('.building-events').replaceChildren(...(events.length?events.map(eventNode):[node('li','workspace-note','尚無成果，從下一次現實中的行動開始。')]));
   details.querySelector('.building-source').textContent=sourceText(id,e);
   const next=details.querySelector('.building-next');next.replaceChildren();
   if(id==='keep'){
    const overview=details.querySelector('.keep-route-overview');overview.replaceChildren(...b.nextPaths.map(path=>{const line=node('p','workspace-note',(path.id==='study'?'學習路線 · ':'跨領域路線 · ')+pathText(path));line.dataset.path=path.id;return line;}));
    const current=details.querySelector('.keep-current-paths');current.replaceChildren(...(b.currentPaths.length?b.currentPaths.map(pathNode):[node('li','workspace-note','從邊境營地開始累積成果。')]));
    next.append(...(b.nextPaths.length?b.nextPaths.map(pathNode):[node('li','workspace-note','已達最高階段。')]));
   }else next.append(node('li','workspace-note',b.stage===5?'已達最高階段。':title+' → '+view.next+'：'+(id==='academy'?(e.courses.total?'完成 '+Math.ceil(e.courses.total*COURSE_THRESHOLDS[b.stage]/100)+' 單元（總課程的 '+COURSE_THRESHOLDS[b.stage]+'%）':'等待課程資料載入'):'完成 '+TRAINING_THRESHOLDS[b.stage]+' 次有效訓練')));
  }
  if(projection&&!projection.activity){activity.querySelector('.realm-events').replaceChildren(node('li','workspace-note','歷程資料尚未取得'));return;}const history=recentEvents(groups,'keep',12);activity.querySelector('.realm-events').replaceChildren(...(history.length?history.map(eventNode):[node('li','workspace-note','尚無成果，從下一次現實中的行動開始。')]));
 }
 return {render};
}
