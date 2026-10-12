import {BUILDINGS} from './kingdom-core.js';
import {buildingProgressSnapshot,realmActivityGroups} from './territory-core.js';
const node=(tag,cls='',text)=>{const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const titles={academy:'奧術學院',barracks:'皇家兵營',keep:'王國要塞'};
function eventNode(event){const li=node('li','realm-event');li.dataset.eventId=event.id;const when=event.date||(event.id.startsWith('milestone:')?'目前狀態 · 無歷史解鎖日期':'日期未記錄');li.append(node('small','workspace-note',when+' · '+titles[event.category]),node('strong','',event.title),node('p','',event.original));const source=node('details','realm-event-source');source.append(node('summary','workspace-note','來源與記錄狀態'),node('p','workspace-note',event.source+' · '+event.detail));li.append(source);return li;}
function progressMeter(label,progress){const meter=node('div','workspace-meter');meter.setAttribute('role','progressbar');meter.setAttribute('aria-label',label);meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax','100');meter.setAttribute('aria-valuenow',String(Math.floor(progress)));const fill=node('span','');fill.style.width=progress+'%';meter.append(fill);return meter;}
function pathNode(path){const li=node('li','keep-path');li.dataset.path=path.id;const status=path.met?'已達標':path.requirements.some(r=>!r.available)?'課程資料不足，無法判定此路徑':'尚未達標';li.append(node('h6','',path.label+' · '+status),node('p','workspace-note',path.roman+' · '+path.name+'：符合下列全部條件'),progressMeter(path.label+' '+path.roman+' 階段進度',path.progress),node('p','keep-path-progress workspace-note','此路徑門檻進度 '+Math.floor(path.progress)+'%'));for(const r of path.requirements)li.append(node('p','keep-requirement',r.available?`${r.label}：目前 ${r.actual} / ${r.required} ${r.unit}，尚差 ${r.gap} ${r.unit}`:`${r.label}：尚無課程資料，無法判定門檻與差距`));return li;}
const groupInfo=[['dated','有日期的近期成果','依紀錄日期由新到舊列出最近 6 筆；紀錄日期不代表實際完成時刻。','尚無可驗證的有日期成果。'],['undated','未記日期的累積成果','列出最多 6 筆目前已完成但缺少有效日期的成果，不能判定何時完成，不列入近期成果。','目前沒有未記日期的累積成果。'],['milestones','目前建築階段','依目前證據顯示達標狀態，沒有歷史解鎖日期，不代表近期升級或永久解鎖。','目前尚未達到建築升級門檻。']];
export function createTerritoryUI(page){
 const container=page.querySelector('#kingdom-buildings');
 const note=node('p','workspace-note territory-source-note','階段表示目前資料達標，並非永久解鎖。取消課程或修正紀錄會重新計算；休息、未登入不扣分。地圖沿用既有插畫，尚無分階段外觀變化。');container.before(note);
 for(const {id,title} of BUILDINGS){const card=node('article','kingdom-building');card.dataset.building=id;
  const details=node('details','building-details');details.id='building-'+id;const summary=node('summary','');summary.append(node('h4','',title),node('p','building-stage'),node('p','building-metric workspace-note'));
  if(id!=='keep')summary.append(progressMeter(title+'下一階段進度',0));summary.append(node('small','building-progress-label workspace-note'),node('small','workspace-link','查看條件與成果'));
  const body=node('div','building-detail-body');body.append(node('h5','','為什麼目前達標'),node('p','building-reason'));
  if(id==='keep')body.append(node('h5','','本階段達標路徑'),node('ul','keep-current-paths'));
  body.append(node('h5','','下一階段（符合任一路徑）'),node('ul','building-next'),node('h5','','資料來源與限制'),node('p','building-source workspace-note'),node('h5','','相關成果'));
  for(const [key,title] of groupInfo){const section=node('section','building-event-group');section.dataset.eventGroup=key;section.append(node('h6','',title),node('ul','building-events'));body.append(section);}
  details.append(summary,body);card.append(details);container.append(card);
  details.addEventListener('toggle',()=>{if(details.open)container.querySelectorAll('.building-details').forEach(other=>{if(other!==details)other.open=false;});});
 }
 const activity=node('section','workspace-panel realm-activity');activity.id='realm-activity';activity.append(node('h3','','領地紀事與目前成果'),node('p','workspace-note','XP 日期與 Planner 排定日不當作完成日期。近期紀事、未記日期成果與目前階段分開呈現。'));
 for(const [key,title,note] of groupInfo){const section=node('section','realm-event-group');section.id='realm-'+key;section.append(node('h4','',title),node('p','workspace-note',note),node('ul','realm-events'));activity.append(section);}
 page.querySelector('.kingdom-territory').after(activity);
 function render(input){const buildings=buildingProgressSnapshot(input),groups=realmActivityGroups(buildings),e=buildings.evidence;
  for(const building of BUILDINGS){const b=buildings[building.id],details=container.querySelector('#building-'+building.id);
   details.querySelector('.building-stage').textContent=b.roman+' · '+b.name;
   details.querySelector('.building-metric').textContent=b.metric;
   if(building.id!=='keep'){const meter=details.querySelector('summary [role=progressbar]');meter.setAttribute('aria-valuenow',String(Math.floor(b.progress)));meter.firstChild.style.width=b.progress+'%';}
   details.querySelector('.building-progress-label').textContent=building.id==='keep'?(b.nextPaths.length?'下一階段：'+b.nextPaths.map(path=>path.label+' '+Math.floor(path.progress)+'%').join(' · '):'已達最高階段；各路徑達標狀態見下方'):b.stage===5?'最高門檻已達成':'下一階段門檻進度 '+Math.floor(b.progress)+'%';
   details.querySelector('.building-reason').textContent=b.reason;
   const next=details.querySelector('.building-next');next.replaceChildren();
   if(building.id==='keep'){const current=details.querySelector('.keep-current-paths');current.replaceChildren(...b.currentPaths.map(pathNode));if(!b.currentPaths.length)current.append(node('li','','初始階段，尚無升級路徑達標。'));next.append(...b.nextPaths.map(pathNode));if(!b.nextPaths.length)next.append(node('li','','已達最高階段；本階段兩條路徑仍分別依目前資料判定。'));}
   else if(!b.next.length)next.append(node('li','','已達本階段最高門檻；仍依目前資料判定。'));else for(const condition of b.next)next.append(node('li','',condition));
   details.querySelector('.building-source').textContent=building.id==='academy'?'四科目前完成勾選與 subjectStats 總單元數。門檻按實際單元數向上取整，不以四捨五入百分比、XP、任務或讀書時數升級。':building.id==='barracks'?`只讀已載入 habits 日期紀錄／本機舊打卡；正常與替代完成每日期最多一次，含 ${e.legacyTraining} 次舊 daily-sport=true 證據。可驗證下限，不代表完整歷史；另 ${e.ambiguousTraining} 筆類型為休息／未安排但標完成的矛盾紀錄保守不計。休息、症狀休息、未安排、待完成不計。未來日期、目前課表與取代菜單不回推完成。`:`四科目前課程完成＋已有運動／休閒完成日期，跨類別同日只計一次（運動 ${e.training} 次、休閒 ${e.leisure} 日，共 ${e.activityDays} 有效日）。跨領域路徑進度取各必要條件中最低比例；任一路徑達標即可升級，不合併為單一百分比。歷史可能不完整；不推測連續天數、不計活動時間，不要求每日三種類別完成。`;
   for(const [key,, ,empty] of groupInfo){const related=details.querySelector(`[data-event-group="${key}"] .building-events`),chosen=groups[key].filter(event=>building.id==='keep'||event.category===building.id).slice(0,3);related.replaceChildren(...chosen.map(eventNode));if(!chosen.length)related.append(node('li','workspace-note',empty));}
  }
  for(const [key,,,empty] of groupInfo){const list=activity.querySelector('#realm-'+key+' .realm-events'),events=groups[key].slice(0,key==='milestones'?3:6);list.replaceChildren(...events.map(eventNode));if(!events.length)list.append(node('li','workspace-note',empty));}
 }
 return {render};
}
