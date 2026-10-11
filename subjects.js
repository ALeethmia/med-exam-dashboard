/* Shared course presentation. Learning state and writes remain in the legacy adapters. */
(() => {
  const preferenceKey='med_exam_subject_expansion_v1';
  let expanded={};
  try { expanded=JSON.parse(localStorage.getItem(preferenceKey) || '{}'); } catch {}
  if(!expanded || typeof expanded!=='object' || Array.isArray(expanded)) expanded={};
  const save=()=>localStorage.setItem(preferenceKey,JSON.stringify(expanded));
  const node=(tag,className,text)=>{const el=document.createElement(tag);el.className=className;if(text!==undefined)el.textContent=text;return el;};
  function prepare() {
    for(const [tab,prefix,statPrefix,containerId] of [
      ['anatomy','video','anatomy','anatomy-units-container'],['biochem','biochem','biochem','biochem-units-container'],
      ['physiology','physio','physio','physio-chapters-container'],['pharmacology','pharm','pharm','pharm-units-container']
    ]) {
      const page=document.getElementById('tab-content-'+tab), old=page.firstElementChild;
      page.classList.remove('legacy-page','space-y-6');page.classList.add('subject-page');
      const summary=node('section','workspace-panel course-overview');
      const heading=node('div','panel-heading');heading.append(node('h2','','課程進度'));
      const count=document.getElementById(prefix+'-progress-text');count.className='course-count';heading.append(count);summary.append(heading);
      const meter=node('div','workspace-meter');const bar=node('span','');bar.id=prefix+'-progress-bar';
      document.getElementById(bar.id).remove();meter.append(bar);summary.append(meter);
      for(const suffix of ['time-stat','unit-stat']) {const stat=document.getElementById(statPrefix+'-'+suffix);stat.className='workspace-note';summary.append(stat);}
      const tools=node('section','course-tools');
      const input=document.getElementById(prefix+'-search-input');input.className='course-search';input.placeholder='搜尋課程、章節或考點';input.setAttribute('aria-label','搜尋'+({anatomy:'解剖學',biochem:'生化學',physiology:'生理學',pharmacology:'藥理學'}[tab]));tools.append(input);
      const chips=document.getElementById((tab==='anatomy'?'anatomy':prefix)+'-filter-chips');
      chips.className='course-filters';
      [...chips.children].filter(el=>el.tagName!=='BUTTON').forEach(el=>el.remove());
      chips.querySelectorAll('button').forEach(button=>{
        const value=button.dataset.week || button.dataset.filter;
        if(value==='ALL')button.textContent='全部';else if(/^W\d+$/.test(value))button.textContent='第 '+value.slice(1)+' 週';
        else button.textContent=button.textContent.replace(/\s*\(.*\)/,'').trim();
      });tools.append(chips);
      // Keep the original study guidance, but remove duplicate headings and empty control wrappers.
      old.firstElementChild?.remove();
      [...old.children].filter(el=>!el.textContent.trim()).forEach(el=>el.remove());
      old.className='course-guide-body legacy-page';
      const guide=node('details','course-guide');guide.append(node('summary','','課程說明與複習建議'),old);
      const container=document.getElementById(containerId);container.className='course-list';
      page.replaceChildren(summary,tools,container,guide);
    }
  }
  function render({container,path,groups,state,query,onChange,onBatch,rowClass}) {
    const focused=document.activeElement;
    const focusId=container.contains(focused)?focused.dataset.focusId:null;
    const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const week='W'+(Math.floor((Date.parse(date)-Date.parse('2026-10-01'))/604800000)+1);
    const first=groups.find(group=>group.all.some(item=>!state[item.id])) || groups[0];
    container.replaceChildren();
    for(const group of groups) {
      const key=path+'__'+group.id;
      const details=node('details','course-group');details.dataset.group=key;
      const done=group.all.filter(item=>!!state[item.id]).length;
      details.open=!!query || (Object.hasOwn(expanded,key)?!!expanded[key]:group===first || group.week===week);
      const summary=node('summary','course-group-heading');
      const titles=node('span','course-group-titles');titles.append(node('strong','',group.title),node('small','',group.meta));
      const status=node('span','course-group-status',`${done} / ${group.all.length} · ${Math.round(done/group.all.length*100)}%`);
      if(done===group.all.length)status.classList.add('is-complete');
      if(group.week===week)titles.append(node('small','course-current','本週'));
      summary.append(titles,status);details.append(summary);
      details.addEventListener('toggle',()=>{if(!query){expanded[key]=details.open;save();}});
      const body=node('div','course-group-body');
      if(onBatch) {
        const actions=node('div','course-batch');
        for(const [label,complete] of [['全選',true],['取消全選',false]]) {
          const button=node('button','',label);button.type='button';button.dataset.focusId=key+'__'+complete;
          button.setAttribute('aria-label',label+'：'+group.title);button.addEventListener('click',()=>onBatch(group.id,complete));actions.append(button);
        }body.append(actions);
      }
      if(group.note)body.append(node('p','course-group-note',group.note));
      for(const item of group.items) {
        const row=node('div','course-row '+rowClass+(state[item.id]?' completed':''));row.dataset.id=item.id;row.dataset.studyKey=path+'__'+item.id;
        const label=node('label','course-row-label');const cb=node('input','');cb.type='checkbox';cb.checked=!!state[item.id];cb.dataset.id=item.id;cb.dataset.focusId=row.dataset.studyKey;
        if(path==='physiology')cb.id=item.id;
        cb.addEventListener('change',()=>onChange(item.id,cb.checked));
        const copy=node('span','course-row-copy');copy.append(node('strong','title-text',item.title),node('small','',item.meta));label.append(cb,copy);row.append(label);
        if(item.notes?.length) {
          const info=node('details','course-item-notes');
          const notesKey=row.dataset.studyKey+'__notes';info.open=!!expanded[notesKey];
          const summary=node('summary','','課程重點');summary.dataset.focusId=notesKey;info.append(summary);
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
    row.closest('.course-group').open=true;
    requestAnimationFrame(()=>{row.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});row.querySelector('input').focus({preventScroll:true});});
  }
  window.SubjectUI={prepare,render,locate};
})();
