import {planningLocked} from './daily-planner.js';
import {PRIORITIES,taskPlanning} from './adaptive-core.js';
import {flattenSubjects, dateKey} from './study-core.js';
const node=(tag,className,text)=>{const element=document.createElement(tag);element.className=className;if(text!==undefined)element.textContent=text;return element;};
const button=(text,action,className='workspace-button')=>{const element=node('button',className,text);element.type='button';element.onclick=action;return element;};
export function courseCatalog(data) {
  const items=new Map(flattenSubjects(data).map(item=>[item.path+'__'+item.id,item]));
  const groups=(source,path,id,children)=>source.map(group=>({id:String(group[id]),title:group.title,items:group[children].map(item=>({...items.get(path+'__'+item.id),groupId:String(group[id]),meta:item.page?'p. '+item.page:item.duration||''}))}));
  return [
    {path:'physiology',tab:'physiology',title:'First Choice 生理學',groups:groups(data.physio,'physiology','chapterId','sections')},
    {path:'videos',tab:'anatomy',title:'趙俊彥解剖學',groups:groups(data.anatomy,'videos','lessonId','lectures')},
    {path:'biochem',tab:'biochem',title:'鐸鐸生化學',groups:data.biochem.map(item=>({id:String(item.id),title:item.title,items:[{...items.get('biochem__'+item.id),groupId:String(item.id),meta:item.duration||''}]}))},
    {path:'pharmacology',tab:'pharmacology',title:'子翔藥理學',groups:groups(data.pharm,'pharmacology','unitId','lectures')}
  ];
}
export function createPlannerUI({data,planner,states,today=()=>dateKey()}) {
  const catalog=courseCatalog(data),courseMap=new Map(catalog.flatMap(subject=>subject.groups.flatMap(group=>group.items.map(item=>[item.path+'__'+item.id,item]))));
  let selectedDate=today(),undoId=null;
  const list=document.getElementById('task-list');
  const controls=node('div','planner-controls');
  const date=node('input','workspace-input');date.type='date';date.id='planner-date';date.value=selectedDate;date.setAttribute('aria-label','查看任務日期');
  const reset=button('今天',()=>{selectedDate=today();date.value=selectedDate;render();});
  controls.append(date,reset,button('規劃今日任務',()=>open(), 'workspace-button primary'));list.before(controls);
  const feedback=node('p','workspace-note');feedback.id='planner-status';feedback.setAttribute('role','status');
  const conflicts=node('div','planner-conflicts');conflicts.id='planner-conflicts';
  const history=node('details','planner-history');history.append(node('summary','','歷史與未完成任務'));const historyList=node('div','planner-history-list');history.append(historyList);list.after(feedback,conflicts,history);
  date.onchange=()=>{if(date.value){selectedDate=date.value;render();}};
  function makeDialog(markup) {
    const dialog=node('dialog','workspace-dialog');dialog.innerHTML=markup;document.body.append(dialog);
    dialog.querySelector('[data-close]').onclick=()=>dialog.close();return dialog;
  }
  const picker=makeDialog('<form id="planner-form"><div class="dialog-heading"><h2>規劃學習任務</h2><button type="button" data-close aria-label="關閉任務規劃">關閉</button></div><div class="planner-form-grid"><label>安排日期<input type="date" id="task-date" required></label><label>每個任務預計分鐘（選填）<input type="number" id="task-minutes" min="1" max="1440" step="1" placeholder="不設定時間"></label></div><label>自由任務<input id="task-custom" maxlength="160" placeholder="例如：考古題 50 題、閱讀或複習"></label><div class="picker-tools"><label>科目<select id="task-subject"></select></label><label>快速選擇<select id="task-source"><option value="all">全部課程</option><option value="unfinished">尚未完成課程</option><option value="week">週計畫相關</option><option value="recent">最近安排的課程</option></select></label><label id="task-week-label" hidden>參考週次<select id="task-week"></select></label></div><label>搜尋課程<input id="task-search" type="search" placeholder="搜尋章節或課程"></label><p id="task-selection" class="workspace-note" role="status"></p><div id="task-course-picker"></div><p class="workspace-note">完成今日任務不會自動完成課程。</p><p id="planner-error" role="alert"></p><div class="dialog-actions"><button type="submit" class="workspace-button primary">加入任務</button></div></form>');
  const priorityLabel=node('label','','任務優先級');const priority=node('select');priority.id='task-priority';for(const [value,title] of Object.entries(PRIORITIES)){const option=node('option','',title);option.value=value;option.selected=value==='normal';priority.append(option);}priorityLabel.append(priority);picker.querySelector('#planner-error').before(priorityLabel);
  const choices=new Map();
  const subjectSelect=picker.querySelector('#task-subject');
  for(const subject of catalog){const option=node('option','',subject.title);option.value=subject.path;subjectSelect.append(option);}
  const weekSelect=picker.querySelector('#task-week');
  for(const week of data.weeks){const option=node('option','',`第 ${week.w} 週 · ${week.date}`);option.value='W'+week.w;weekSelect.append(option);}
  function renderChoices() {
    const source=picker.querySelector('#task-source').value;
    picker.querySelector('#task-week-label').hidden=source!=='week';
    const search=picker.querySelector('#task-search').value.trim().toLowerCase();
    const subject=catalog.find(item=>item.path===subjectSelect.value);
    const recent=new Set(planner.dates().flatMap(day=>planner.list(day)).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,10).flatMap(task=>(task.links||[]).map(link=>link.path+'__'+link.id)));
    const target=picker.querySelector('#task-course-picker');target.replaceChildren();
    for(const group of subject.groups) {
      const items=group.items.filter(item=>(!search||(group.title+' '+item.title).toLowerCase().includes(search)) &&
        (source!=='unfinished'||!states()[item.path]?.[item.id]) && (source!=='week'||item.week===weekSelect.value) && (source!=='recent'||recent.has(item.path+'__'+item.id)));
      if(!items.length)continue;
      const section=node('details','picker-group');section.open=!!search || target.children.length===0;
      section.append(node('summary','',group.title));
      const all=node('label','picker-row picker-all');const allCheck=node('input','');allCheck.type='checkbox';allCheck.checked=items.every(item=>choices.has(item.path+'__'+item.id));
      all.append(allCheck,node('span','','選取本組 '+items.length+' 項'));section.append(all);
      allCheck.onchange=()=>{for(const item of items){const key=item.path+'__'+item.id;if(allCheck.checked)choices.set(key,item);else choices.delete(key);}renderChoices();};
      for(const item of items){const label=node('label','picker-row');const cb=node('input','');cb.type='checkbox';cb.dataset.course=item.path+'__'+item.id;cb.checked=choices.has(cb.dataset.course);label.append(cb,node('span','',item.title),node('small','',item.meta));cb.onchange=()=>{if(cb.checked)choices.set(cb.dataset.course,item);else choices.delete(cb.dataset.course);updateSelection();allCheck.checked=items.every(i=>choices.has(i.path+'__'+i.id));};section.append(label);}
      target.append(section);
    }
    if(!target.children.length)target.append(node('p','workspace-note','沒有符合的課程，可以改選其他科目或新增自由任務。'));
    updateSelection();
  }
  function updateSelection(){picker.querySelector('#task-selection').textContent=`已選 ${choices.size} 個課程，可切換科目繼續選取。`;}
  for(const id of ['task-subject','task-source','task-week'])picker.querySelector('#'+id).onchange=renderChoices;
  picker.querySelector('#task-search').oninput=renderChoices;
  function open(week) {
    picker.querySelector('form').reset();choices.clear();picker.querySelector('#task-date').value=selectedDate;
    picker.querySelector('#planner-error').textContent='';
    const current=data.weeks.find(item=>today()>=item.start&&today()<=item.end);
    weekSelect.value='W'+(week||current?.w||1);
    picker.querySelector('#task-source').value=week?'week':'all';
    if(week){const subject=catalog.find(subject=>subject.groups.some(group=>group.items.some(item=>item.week==='W'+week)));if(subject)subjectSelect.value=subject.path;}
    renderChoices();picker.showModal();subjectSelect.focus({preventScroll:true});
  }
  picker.querySelector('form').onsubmit=event=>{
    event.preventDefault();const title=picker.querySelector('#task-custom').value.trim();
    if(!title&&!choices.size){picker.querySelector('#planner-error').textContent='請選擇課程或輸入自由任務。';return;}
    const raw=picker.querySelector('#task-minutes').value,minutes=raw?Number(raw):null;
    const targetDate=picker.querySelector('#task-date').value;
    const planning={version:1,priority:priority.value,waiting:false,locked:false};
    try {
      for(const item of choices.values())planner.add({title:item.title,date:targetDate,minutes,planning,links:[{path:item.path,id:String(item.id)}]});
      if(title)planner.add({title,date:targetDate,minutes,planning});
      selectedDate=targetDate;date.value=selectedDate;picker.close();render();
    }catch(error){picker.querySelector('#planner-error').textContent=error.message;}
  };
  const editor=makeDialog('<form><div class="dialog-heading"><h2 id="editor-heading">編輯任務</h2><button type="button" data-close aria-label="關閉任務編輯">關閉</button></div><label>任務名稱<input id="edit-title" required maxlength="160"></label><div class="planner-form-grid"><label>安排日期<input id="edit-date" type="date" required></label><label>預計分鐘（選填）<input id="edit-minutes" type="number" min="1" max="1440" step="1"></label></div><p id="edit-error" role="alert"></p><div class="dialog-actions"><button type="submit" class="workspace-button primary">儲存任務</button></div></form>');
  const advanced=node('details','planner-history');advanced.append(node('summary','','排程設定（優先級、鎖定、選填時段）'));advanced.innerHTML+='<label>優先級<select id="edit-priority"><option value="core">核心</option><option value="normal">一般</option><option value="flexible">彈性</option></select></label><label class="life-check"><input id="edit-locked" type="checkbox"> 鎖定日期，不參與重排</label><div class="planner-form-grid"><label>開始時間（選填）<input id="edit-start" type="time"></label><label>結束時間（選填）<input id="edit-end" type="time"></label></div><p class="workspace-note">自主生化複習不會因科目被鎖定；未指定時段者只檢查每日容量。完成任務仍不會自動完成課程。</p>';editor.querySelector('#edit-error').before(advanced);
  let editing=null;
  function edit(task,postpone=false) {editing=task.id;editor.querySelector('#editor-heading').textContent=postpone?'延後任務':'編輯任務';editor.querySelector('#edit-title').value=task.title;editor.querySelector('#edit-date').value=task.date;editor.querySelector('#edit-minutes').value=task.minutes??'';editor.querySelector('#edit-priority').value=task.planning?.priority||'normal';editor.querySelector('#edit-locked').checked=planningLocked(task);editor.querySelector('#edit-locked').disabled=!!task.planning?.fixedId;editor.querySelector('#edit-date').disabled=planningLocked(task);editor.querySelector('#edit-start').value=task.planning?.start||'';editor.querySelector('#edit-end').value=task.planning?.end||'';advanced.open=false;editor.querySelector('#edit-error').textContent='';editor.showModal();editor.querySelector(postpone?'#edit-date':'#edit-title').focus();}
  editor.querySelector('form').onsubmit=event=>{event.preventDefault();try{const minutes=editor.querySelector('#edit-minutes').value;planner.update(editing,{title:editor.querySelector('#edit-title').value,date:editor.querySelector('#edit-date').value,minutes:minutes?Number(minutes):null,planning:{...taskPlanning(planner.get(editing),data),priority:editor.querySelector('#edit-priority').value,locked:editor.querySelector('#edit-locked').checked,start:editor.querySelector('#edit-start').value||null,end:editor.querySelector('#edit-end').value||null}});editor.close();render();}catch(error){editor.querySelector('#edit-error').textContent=error.message;}};
  function locate(link) {
    const subject=catalog.find(subject=>subject.path===link.path);if(!subject)return;
    const prefix={videos:'video',physiology:'physio',biochem:'biochem',pharmacology:'pharm'}[link.path];
    const input=document.getElementById(prefix+'-search-input');input.value='';input.dispatchEvent(new Event('input'));
    const filter={videos:'filterAnatomyWeek',physiology:'filterPhysioChapter',biochem:'filterBiochemWeek',pharmacology:'filterPharmWeek'}[link.path];
    window[filter]?.('ALL');window.switchTab(subject.tab);window.SubjectUI.locate(link.path,String(link.id));
  }
  function render() {
    const focused=document.activeElement?.dataset.task;
    const tasks=planner.list(selectedDate),completed=tasks.filter(task=>task.complete).length;
    const status=planner.status();
    document.getElementById('tasks-title').textContent=selectedDate===today()?'今日任務':selectedDate+' 任務';
    document.getElementById('task-count').textContent=`${completed} / ${tasks.length} 任務`;
    const meter=document.getElementById('daily-meter');const percent=tasks.length?Math.round(completed/tasks.length*100):0;meter.querySelector('span').style.width=percent+'%';meter.setAttribute('aria-valuenow',String(percent));
    list.replaceChildren();
    if(!tasks.length){const empty=node('div','planner-empty');empty.append(node('p','','今天想讀什麼？先安排一個任務就好。'),button('新增學習任務',()=>open()));list.append(empty);}
    for(const task of tasks) {
      const batched=status.batch?.ids?.includes(task.id);
      const row=node('div','task-row planner-task'+(task.complete?' is-complete':''));row.dataset.taskId=task.id;
      const label=node('label','');const cb=node('input','');cb.type='checkbox';cb.checked=!!task.complete;cb.disabled=!!batched;cb.dataset.task=task.id;cb.onchange=()=>planner.update(task.id,{complete:cb.checked});
      const text=node('span','task-copy');text.append(node('strong','',task.title),node('small','',`${task.minutes?'預計 '+task.minutes+' 分鐘 · ':''}${task.award?'已獲得 20 XP':'+20 XP'}`));label.append(cb,text);row.append(label);
      if(batched)text.append(node('small','','整批排程待同步；同步或撤回後可修改'));
      if(planningLocked(task))text.append(node('small','','🔒 鎖定日期'));
      const tools=node('div','task-tools');
      for(const link of task.links||[]){const course=courseMap.get(link.path+'__'+link.id);if(course){const jump=button('課程',()=>locate(link),'task-link');jump.setAttribute('aria-label','前往課程：'+course.title);tools.append(jump);}}
      const menu=node('details','task-menu');const summary=node('summary','','•••');summary.setAttribute('aria-label','管理任務：'+task.title);menu.append(summary);const actions=node('div','task-menu-actions');
      for(const [title,action] of [['編輯',()=>edit(task)],['延後',()=>edit(task,true)],['複製至今天',()=>{planner.copy(task.id,today());selectedDate=today();date.value=selectedDate;render();}],['上移',()=>planner.move(task.id,-1)],['下移',()=>planner.move(task.id,1)],['刪除',()=>{undoId=task.id;planner.remove(task.id);render();}]]){const control=button(title,action);control.disabled=!!batched||(planningLocked(task)&&['延後','刪除','上移','下移'].includes(title));actions.append(control);}
      menu.append(actions);tools.append(menu);row.append(tools);list.append(row);
    }
    if(focused)list.querySelector(`[data-task="${CSS.escape(focused)}"]`)?.focus({preventScroll:true});
    const estimated=tasks.reduce((sum,task)=>sum+(task.minutes||0),0);
    feedback.replaceChildren(node('span','',status.error?'任務同步失敗（'+status.error+'），本機修改已保留。':status.pending?'任務待同步 · 本機修改已保留':estimated?'本日已設定預計 '+estimated+' 分鐘；完成率依任務數計算。':'完成率依任務數計算；時間可不設定。'));
    const waiting=planner.all().filter(task=>!task.deleted&&task.planning?.waiting).length;if(waiting)feedback.append(button(waiting+' 項待安排 → 週計畫',()=>window.switchTab('plan'),'workspace-link'));
    if(undoId)feedback.append(button('復原刪除',()=>{planner.update(undoId,{deleted:false});undoId=null;render();},'workspace-link'));
    conflicts.replaceChildren();
    const names={title:'名稱',date:'日期',minutes:'預計時間',complete:'完成狀態',deleted:'刪除狀態',order:'順序',links:'課程',planning:'排程設定'};
    for(const [id,fields] of Object.entries(status.conflicts)) {
      const cloud=planner.cloud(id),local=planner.get(id);
      const notice=node('div','planner-conflict');notice.append(node('p','',`「${local?.title||cloud.title||'任務'}」的${fields.map(field=>names[field]||field).join('、')}也在其他裝置修改。`));
      for(const field of fields)notice.append(node('small','',`${names[field]||field}：本機 ${JSON.stringify(local?.[field]??null)}／雲端 ${JSON.stringify(cloud[field]??null)}`));
      notice.append(button('保留本機修改',()=>planner.resolve(id,true)),button('採用雲端修改',()=>planner.resolve(id,false)));conflicts.append(notice);
    }
    historyList.replaceChildren();
    for(const day of planner.dates())if(day!==selectedDate){const tasks=planner.list(day),done=tasks.filter(task=>task.complete).length;historyList.append(button(`${day} · ${done}/${tasks.length} 完成`,()=>{selectedDate=day;date.value=day;render();},'history-date'));}
    if(!historyList.children.length)historyList.append(node('p','workspace-note','尚無其他日期的任務。'));
  }
  return {render,open,catalog,locate};
}
