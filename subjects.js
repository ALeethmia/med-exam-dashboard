/* Shared course presentation. Learning state and writes remain in the legacy adapters. */
(() => {
  let selected={};
  try { selected=JSON.parse(localStorage.getItem('med_exam_subject_selection_v1') || '{}'); } catch {}
  if(!selected || typeof selected!=='object' || Array.isArray(selected)) selected={};
  const saveSelection=()=>localStorage.setItem('med_exam_subject_selection_v1',JSON.stringify(selected));
  const node=(tag,className,text)=>{const el=document.createElement(tag);el.className=className;if(text!==undefined)el.textContent=text;return el;};
  function prepare() {
    for(const [tab,prefix,statPrefix,containerId] of [
      ['anatomy','video','anatomy','anatomy-units-container'],['biochem','biochem','biochem','biochem-units-container'],
      ['physiology','physio','physio','physio-chapters-container'],['pharmacology','pharm','pharm','pharm-units-container']
    ]) {
      const page=document.getElementById('tab-content-'+tab);
      page.classList.remove('legacy-page','space-y-6');page.classList.add('subject-page');
      const summary=node('section','course-overview');
      const heading=node('div','panel-heading');heading.append(node('h2','','學習進度'));
      const count=document.getElementById(prefix+'-progress-text');count.className='course-count';heading.append(count);summary.append(heading);
      const meter=node('div','workspace-meter');const bar=node('span','');bar.id=prefix+'-progress-bar';
      document.getElementById(bar.id).remove();meter.append(bar);summary.append(meter);
      const stats=node('details','course-stat-details');stats.append(node('summary','','查看時數與單元統計'));
      for(const suffix of ['time-stat','unit-stat']) {const stat=document.getElementById(statPrefix+'-'+suffix);stat.className='workspace-note';stats.append(stat);}
      summary.append(stats);
      if(tab==='pharmacology') {
        const courseLink=node('a','course-resource-link','開啟子翔藥理課程 ↗');
        courseLink.href='https://med-learning-story.com/zihsiang-pharmacology/course/';
        courseLink.target='_blank';courseLink.rel='noopener noreferrer';
        courseLink.setAttribute('aria-label','開啟子翔藥理課程（另開分頁）');
        summary.append(courseLink);
      }
      if(tab==='biochem'){const period=node('p','workspace-note','正式課程：2026-11-06–2026-12-23 · 18:00–22:00（台灣時間）');period.id='biochem-course-period';summary.append(period);}
      const tools=node('section','course-tools');
      const input=document.getElementById(prefix+'-search-input');input.className='course-search';input.placeholder='搜尋課程、章節或考點';input.setAttribute('aria-label','搜尋'+({anatomy:'解剖學',biochem:'生化學',physiology:'生理學',pharmacology:'藥理學'}[tab]));tools.append(input);
      const chips=document.getElementById((tab==='anatomy'?'anatomy':prefix)+'-filter-chips');
      chips.className='course-filters';
      [...chips.children].filter(el=>el.tagName!=='BUTTON').forEach(el=>el.remove());
      chips.querySelectorAll('button').forEach(button=>{
        const value=button.dataset.week || button.dataset.filter;
        // The FC chapter index is rendered from the book, not mixed with study weeks.
        if(tab==='physiology' && !['ALL','W1','W2'].includes(value)){button.remove();return;}
        if(value==='ALL')button.textContent='不限週次';else if(tab!=='biochem'&&/^W\d+$/.test(value))button.textContent='第 '+value.slice(1)+' 週';
      });
      const plan=node('details','course-plan-filter');plan.append(node('summary','','讀書計畫篩選'),chips);tools.append(plan);
      const container=document.getElementById(containerId);container.className='course-list';
      const layout=node('div','course-library');
      const index=node('nav','course-index');index.id=containerId+'-index';index.setAttribute('aria-label','課程目錄');
      layout.append(index,container);page.replaceChildren(summary,tools,layout);
    }
  }
  function dateControls(row) {
    const service=window.courseDates;if(!service)return;
    let tools=row.querySelector('.course-first-date');if(!tools){tools=node('div','course-first-date');tools.addEventListener('focusout',()=>setTimeout(()=>dateControls(row),0));row.append(tools);}
    const focused=tools.querySelector('input')===document.activeElement;if(focused)return;
    tools.replaceChildren();const key=row.dataset.studyKey,day=service.day(key),status=service.status(key);
    const label=node('label','','首次完成');const input=node('input','');input.type='date';input.value=day||'';input.max=service.today();input.setAttribute('aria-label','首次完成日期');
    const message=node('span','workspace-note');message.setAttribute('role','status');
    input.addEventListener('change',()=>{try{service.set(key,input.value||null);input.blur();dateControls(row);}catch(e){message.textContent=e.message;input.value=day||'';}});label.append(input);tools.append(label);
    const remove=node('button','course-date-remove','移除日期');remove.type='button';remove.disabled=!day;remove.addEventListener('click',()=>service.set(key,null));tools.append(remove);
    message.textContent=status.conflict?'日期已在其他裝置變更，請選擇保留哪份紀錄。':status.error|| (status.pending?'日期待同步':'');tools.append(message);
    if(status.conflict)for(const [text,keep] of [['採用雲端日期',false],['保留本機日期',true]]){const button=node('button','workspace-link',text);button.type='button';button.addEventListener('click',()=>service.resolve(key,keep));tools.append(button);}
  }
  function refreshDates(){document.querySelectorAll('[data-study-key]').forEach(dateControls);}
  function render({container,path,groups,state,query,onChange,onBatch,rowClass}) {
    const focused=document.activeElement;
    const focusId=container.contains(focused)?focused.dataset.focusId:null;

    const first=groups.find(group=>String(group.id)===selected[path]) || groups[0];
    const index=document.getElementById(container.id+'-index');index.replaceChildren();
    index.append(node('h2','',path==='physiology'?'FC 課本目錄':'課程目錄'));
    const mobile=node('select','course-chapter-select');mobile.setAttribute('aria-label','選擇章節');
    const selectGroup=id=>{
      const mobileControl=document.activeElement?.tagName==='SELECT';
      selected[path]=String(id);saveSelection();render({container,path,groups,state,query,onChange,onBatch,rowClass});
      const control=mobileControl?index.querySelector('select'):[...index.querySelectorAll('button')].find(button=>button.dataset.chapter===String(id));
      control?.focus({preventScroll:true});
    };
    groups.forEach((group,i)=>{
      const done=group.all.filter(item=>!!state[item.id]).length;
      const button=node('button','course-index-entry');button.type='button';button.dataset.chapter=group.id;
      const active=group===first;button.setAttribute('aria-current',active?'page':'false');
      if(path!=='physiology')button.append(node('span','course-index-number',String(i+1).padStart(2,'0')));
      button.append(node('span','course-index-title',group.title),node('small','',`${done}/${group.all.length}`));
      button.addEventListener('click',()=>selectGroup(group.id));index.append(button);
      const option=node('option','',group.title+(path==='biochem'?' · '+group.meta:''));option.value=group.id;option.selected=active;mobile.append(option);
    });
    mobile.addEventListener('change',()=>selectGroup(mobile.value));index.append(mobile);
    container.replaceChildren();
    for(const group of groups) {
      const key=path+'__'+group.id;
      const details=node('details','course-group');details.dataset.group=key;
      const done=group.all.filter(item=>!!state[item.id]).length;
      details.open=true;details.classList.toggle('hidden',!query && group!==first);
      const summary=node('summary','course-group-heading');
      const titles=node('span','course-group-titles');titles.append(node('strong','',group.title),node('small','',group.meta));
      const status=node('span','course-group-status',`${done} / ${group.all.length} · ${Math.round(done/group.all.length*100)}%`);
      if(done===group.all.length)status.classList.add('is-complete');

      summary.append(titles,status);details.append(summary);
      summary.addEventListener('click',event=>event.preventDefault());
      const body=node('div','course-group-body');
      if(onBatch) {
        const actions=node('div','course-batch');
        for(const [label,complete] of [['全選',true],['取消全選',false]]) {
          const button=node('button','',label);button.type='button';button.dataset.focusId=key+'__'+complete;
          button.setAttribute('aria-label',label+'：'+group.title);button.addEventListener('click',()=>onBatch(group.id,complete));actions.append(button);
        }body.append(actions);
      }
      for(const item of group.items) {
        const row=node('div','course-row '+rowClass+(state[item.id]?' completed':''));row.dataset.id=item.id;row.dataset.studyKey=path+'__'+item.id;
        const label=node('label','course-row-label');const cb=node('input','');cb.type='checkbox';cb.checked=!!state[item.id];cb.dataset.id=item.id;cb.dataset.focusId=row.dataset.studyKey;
        if(path==='physiology')cb.id=item.id;
        cb.addEventListener('change',()=>onChange(item.id,cb.checked));
        const copy=node('span','course-row-copy');copy.append(node('strong','title-text',item.title),node('small','',item.meta));label.append(cb,copy);row.append(label);
        dateControls(row);body.append(row);
      }details.append(body);container.append(details);
    }
    if(!groups.length){const empty=node('p','course-empty','找不到符合條件的課程，請調整搜尋或篩選。');empty.setAttribute('role','status');container.append(empty);}
    if(focusId)[...container.querySelectorAll('[data-focus-id]')].find(el=>el.dataset.focusId===focusId)?.focus({preventScroll:true});
  }
  function locate(path,id) {
    const row=[...document.querySelectorAll('[data-study-key]')].find(el=>el.dataset.studyKey===path+'__'+id);
    if(!row)return;
    const group=row.closest('.course-group');
    const container=group.parentElement;
    selected[path]=group.dataset.group.slice(path.length+2);saveSelection();
    container.querySelectorAll(':scope > .course-group').forEach(el=>el.classList.toggle('hidden',el!==group));
    const index=document.getElementById(container.id+'-index');
    index.querySelectorAll('button').forEach(button=>button.setAttribute('aria-current',button.dataset.chapter===selected[path]?'page':'false'));
    index.querySelector('select').value=selected[path];group.open=true;
    requestAnimationFrame(()=>{row.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});row.querySelector('input').focus({preventScroll:true});});
  }
  window.SubjectUI={prepare,render,locate,refreshDates};
})();
