import {dateKey} from './study-core.js';
export function createWeekPlanUI({data,openPlanner,today=()=>dateKey()}) {
  const container=document.getElementById('checklist-container');
  container.classList.add('week-plan-list');
  const expanded=new Set(data.weeks.filter(week=>today()>=week.start&&today()<=week.end).map(week=>week.w));
  const node=(tag,className,text)=>{const element=document.createElement(tag);element.className=className;if(text!==undefined)element.textContent=text;return element;};
  function refresh() {
    for(const week of data.weeks) {
      const card=document.getElementById('week-card-'+week.w);if(!card)continue;
      let details=card.parentElement;
      if(!details.classList.contains('week-plan-item')) {
        details=node('details','week-plan-item');details.dataset.week=week.w;details.open=expanded.has(week.w);
        const summary=node('summary','week-plan-heading');
        const title=node('span','');title.append(node('strong','',`第 ${week.w} 週`),node('small','',week.date));
        summary.append(title,node('span','week-plan-state',''));details.append(summary);
        card.before(details);card.className='week-plan-body';details.append(card);
        const add=node('button','workspace-button','選取內容加入今日任務');add.type='button';add.onclick=()=>openPlanner(week.w);card.append(add);
        details.addEventListener('toggle',()=>{if(details.open)expanded.add(week.w);else expanded.delete(week.w);});
      }
      const label=card.querySelector('.week-plan-title');if(label)label.textContent=window.studyWeekLabel?.(week)||week.title;
      const percent=window.readWeekCompletion(week.w);
      details.querySelector('.week-plan-state').textContent=`${percent===100?'已完成':percent>0?'進行中':'尚未開始'} · ${percent}%`;
      details.classList.toggle('is-current',today()>=week.start&&today()<=week.end);
      const checkbox=card.querySelector('input');if(checkbox)checkbox.setAttribute('aria-label',`確認第 ${week.w} 週完成（沿用原週計畫紀錄）`);
    }
  }
  window.decorateWeekPlan=refresh;
  const jump=document.getElementById('jump-today-week-btn');
  jump?.addEventListener('click',()=>{
    const week=data.weeks.find(week=>today()>=week.start&&today()<=week.end);if(!week)return;
    const details=container.querySelector(`[data-week="${week.w}"]`);details.open=true;details.scrollIntoView({block:'center',behavior:'smooth'});
  });
  const note=node('p','workspace-note','週次與區間保留原計畫作歷史參考；生化正式課日期依固定課表顯示。完成率沿用既有課程與手動週勾選紀錄；不會自動建立每日任務。');container.before(note);
  refresh();return {refresh};
}
