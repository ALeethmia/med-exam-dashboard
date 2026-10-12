import {BUILDINGS} from './kingdom-core.js';
import {buildingProgressSnapshot,realmActivitySnapshot} from './territory-core.js';
const node=(tag,cls='',text)=>{const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const titles={academy:'奧術學院',barracks:'皇家兵營',keep:'王國要塞'};
function eventNode(event){const li=node('li','realm-event');li.dataset.eventId=event.id;li.append(node('small','workspace-note',(event.date||'日期未記錄')+' · '+titles[event.category]),node('strong','',event.title),node('p','',event.original));const source=node('details','realm-event-source');source.append(node('summary','workspace-note','來源與記錄狀態'),node('p','workspace-note',event.source+' · '+event.detail));li.append(source);return li;}
export function createTerritoryUI(page){
 const container=page.querySelector('#kingdom-buildings');
 const note=node('p','workspace-note territory-source-note','階段表示目前資料達標，並非永久解鎖。取消課程或修正紀錄會重新計算；休息、未登入不扣分。地圖沿用既有插畫，尚無分階段外觀變化。');container.before(note);
 for(const {id,title} of BUILDINGS){const card=node('article','kingdom-building');card.dataset.building=id;
  const details=node('details','building-details');details.id='building-'+id;const summary=node('summary','');summary.append(node('h4','',title),node('p','building-stage'),node('p','building-metric workspace-note'));
  const meter=node('div','workspace-meter');meter.setAttribute('role','progressbar');meter.setAttribute('aria-label',title+'下一階段進度');meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax','100');meter.append(node('span',''));summary.append(meter,node('small','building-progress-label workspace-note'),node('small','workspace-link','查看條件與成果'));
  const body=node('div','building-detail-body');body.append(node('h5','','為什麼目前達標'),node('p','building-reason'),node('h5','','下一階段（符合任一路徑）'),node('ul','building-next'),node('h5','','資料來源與限制'),node('p','building-source workspace-note'),node('h5','','相關成果'),node('ul','building-events'));details.append(summary,body);card.append(details);container.append(card);
  details.addEventListener('toggle',()=>{if(details.open)container.querySelectorAll('.building-details').forEach(other=>{if(other!==details)other.open=false;});});
 }
 const activity=node('section','workspace-panel realm-activity');activity.id='realm-activity';activity.append(node('h3','','最近領地發生了什麼'),node('p','workspace-note','有日期的成果依紀錄日期排序；未記日期成果與目前達標說明不代表近期或永久解鎖。XP 日期與 Planner 排定日不當作完成日期。'),node('ul','realm-events'));
 page.querySelector('.kingdom-territory').after(activity);
 function render(input){const buildings=buildingProgressSnapshot(input),events=realmActivitySnapshot(buildings),e=buildings.evidence;
  for(const building of BUILDINGS){const b=buildings[building.id],details=container.querySelector('#building-'+building.id);
   details.querySelector('.building-stage').textContent=b.roman+' · '+b.name;
   details.querySelector('.building-metric').textContent=b.metric;
   const meter=details.querySelector('[role=progressbar]');meter.setAttribute('aria-valuenow',String(Math.round(b.progress)));meter.firstChild.style.width=b.progress+'%';
   details.querySelector('.building-progress-label').textContent=b.stage===5?'最高門檻已達成':'下一階段門檻進度 '+Math.round(b.progress)+'%';
   details.querySelector('.building-reason').textContent=b.reason;
   const next=details.querySelector('.building-next');next.replaceChildren();if(!b.next.length)next.append(node('li','','已達本階段最高門檻；仍依目前資料判定。'));else for(const condition of b.next)next.append(node('li','',condition));
   details.querySelector('.building-source').textContent=building.id==='academy'?'四科目前完成勾選與 subjectStats 總單元數。門檻按實際單元數向上取整，不以四捨五入百分比、XP、任務或讀書時數升級。':building.id==='barracks'?`只讀已載入 habits 日期紀錄／本機舊打卡；正常與替代完成每日期最多一次，含 ${e.legacyTraining} 次舊 daily-sport=true 證據。可驗證下限，不代表完整歷史；另 ${e.ambiguousTraining} 筆類型為休息／未安排但標完成的矛盾紀錄保守不計。休息、症狀休息、未安排、待完成不計。未來日期、目前課表與取代菜單不回推完成。`:`四科目前課程完成＋已有運動／休閒完成日期，跨類別同日只計一次（運動 ${e.training} 次、休閒 ${e.leisure} 日，共 ${e.activityDays} 有效日）。歷史可能不完整；不推測連續天數、不計活動時間，不要求每日三種類別完成。`;
   const related=details.querySelector('.building-events');related.replaceChildren();const chosen=events.filter(event=>building.id==='keep'||event.category===building.id).slice(0,3);for(const event of chosen)related.append(eventNode(event));if(!chosen.length)related.append(node('li','workspace-note','尚無可驗證的相關成果，沿用原有學習與生活紀錄即可。'));
  }
  const list=activity.querySelector('.realm-events');list.replaceChildren();for(const event of events.slice(0,6))list.append(eventNode(event));if(!events.length)list.append(node('li','workspace-note','尚無可驗證的領地紀事。完成課程或原有生活安排後，已有紀錄會在這裡呈現。'));
 }
 return {render};
}
