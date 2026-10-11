/* Shared course presentation. Learning state and writes remain in the legacy adapters. */
(() => {
  const preferenceKey='med_exam_subject_expansion_v1';
  let expanded={};
  try { expanded=JSON.parse(localStorage.getItem(preferenceKey) || '{}'); } catch {}
  if(!expanded || typeof expanded!=='object' || Array.isArray(expanded)) expanded={};
  let selected={};
  try { selected=JSON.parse(localStorage.getItem('med_exam_subject_selection_v1') || '{}'); } catch {}
  if(!selected || typeof selected!=='object' || Array.isArray(selected)) selected={};
  const saveSelection=()=>localStorage.setItem('med_exam_subject_selection_v1',JSON.stringify(selected));
  const save=()=>localStorage.setItem(preferenceKey,JSON.stringify(expanded));
  const node=(tag,className,text)=>{const el=document.createElement(tag);el.className=className;if(text!==undefined)el.textContent=text;return el;};
  function prepare() {
    for(const [tab,prefix,statPrefix,containerId] of [
      ['anatomy','video','anatomy','anatomy-units-container'],['biochem','biochem','biochem','biochem-units-container'],
      ['physiology','physio','physio','physio-chapters-container'],['pharmacology','pharm','pharm','pharm-units-container']
    ]) {
      const page=document.getElementById('tab-content-'+tab), old=page.firstElementChild;
      page.classList.remove('legacy-page','space-y-6');page.classList.add('subject-page');
      const summary=node('section','course-overview');
      const heading=node('div','panel-heading');heading.append(node('h2','','學習進度'));
      const count=document.getElementById(prefix+'-progress-text');count.className='course-count';heading.append(count);summary.append(heading);
      const meter=node('div','workspace-meter');const bar=node('span','');bar.id=prefix+'-progress-bar';
      document.getElementById(bar.id).remove();meter.append(bar);summary.append(meter);
      const stats=node('details','course-stat-details');stats.append(node('summary','','查看時數與單元統計'));
      for(const suffix of ['time-stat','unit-stat']) {const stat=document.getElementById(statPrefix+'-'+suffix);stat.className='workspace-note';stats.append(stat);}
      summary.append(stats);
      const tools=node('section','course-tools');
      const input=document.getElementById(prefix+'-search-input');input.className='course-search';input.placeholder='搜尋課程、章節或考點';input.setAttribute('aria-label','搜尋'+({anatomy:'解剖學',biochem:'生化學',physiology:'生理學',pharmacology:'藥理學'}[tab]));tools.append(input);
      const chips=document.getElementById((tab==='anatomy'?'anatomy':prefix)+'-filter-chips');
      chips.className='course-filters';
      [...chips.children].filter(el=>el.tagName!=='BUTTON').forEach(el=>el.remove());
      chips.querySelectorAll('button').forEach(button=>{
        const value=button.dataset.week || button.dataset.filter;
        // The FC chapter index is rendered from the book, not mixed with study weeks.
        if(tab==='physiology' && !['ALL','W1','W2'].includes(value)){button.remove();return;}
        if(value==='ALL')button.textContent='不限週次';else if(/^W\d+$/.test(value))button.textContent='第 '+value.slice(1)+' 週';
      });
      const plan=node('details','course-plan-filter');plan.append(node('summary','','讀書計畫篩選'),chips);tools.append(plan);
      // Keep the original study guidance, but remove duplicate headings and empty control wrappers.
      old.firstElementChild?.remove();
      [...old.children].filter(el=>!el.textContent.trim()).forEach(el=>el.remove());
      old.className='course-guide-body legacy-page';
      const guide=node('details','course-guide');guide.append(node('summary','','課程說明與複習建議'),old);
      const container=document.getElementById(containerId);container.className='course-list';
      const layout=node('div','course-library');
      const index=node('nav','course-index');index.id=containerId+'-index';index.setAttribute('aria-label','課程目錄');
      layout.append(index,container);page.replaceChildren(summary,tools,layout,guide);
    }
  }
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
      const option=node('option','',group.title);option.value=group.id;option.selected=active;mobile.append(option);
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
      if(group.note){const note=node('details','course-chapter-notes');note.append(node('summary','','章節複習建議'),node('p','course-group-note',group.note));body.append(note);}
      for(const item of group.items) {
        const row=node('div','course-row '+rowClass+(state[item.id]?' completed':''));row.dataset.id=item.id;row.dataset.studyKey=path+'__'+item.id;
        const label=node('label','course-row-label');const cb=node('input','');cb.type='checkbox';cb.checked=!!state[item.id];cb.dataset.id=item.id;cb.dataset.focusId=row.dataset.studyKey;
        if(path==='physiology')cb.id=item.id;
        cb.addEventListener('change',()=>onChange(item.id,cb.checked));
        const copy=node('span','course-row-copy');copy.append(node('strong','title-text',item.title),node('small','',item.meta));label.append(cb,copy);row.append(label);
        if(item.notes?.length) {
          const info=node('details','course-item-notes');
          const notesKey=row.dataset.studyKey+'__notes';info.open=!!expanded[notesKey];
          const summary=node('summary','','筆記與重點');summary.dataset.focusId=notesKey;info.append(summary);
          info.addEventListener('toggle',()=>{expanded[notesKey]=info.open;save();});
          for(const [title,text] of item.notes)if(text){const p=node('p','');p.append(node('strong','',title+'：'),document.createTextNode(text));info.append(p);}
          row.append(info);
        }body.append(row);
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
  window.SubjectUI={prepare,render,locate};
})();
