import {dateKey} from './study-core.js';
import {lifeSummary,trainingWeek,exerciseMenu,TYPES,STATUS,STAGES} from './life-core.js';
const statusLabel=exercise=>exercise.type==='rest'&&exercise.status==='not_scheduled'?'恢復日 · 無須打卡':STATUS[exercise.status];
const node=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const button=(text,action,cls='workspace-button')=>{const el=node('button',cls,text);el.type='button';el.onclick=action;return el;};
export function createLifeUI({store,planner,today=()=>dateKey()}) {
  let selectedDay=today();
  const summary=node('section','life-overview');summary.setAttribute('aria-labelledby','life-title');
  summary.innerHTML='<div class="panel-heading"><h2 id="life-title">今日目標</h2><span class="workspace-note">學習 · 活動 · 恢復</span></div><div class="life-goals"><div id="life-study"></div><div id="life-exercise"></div><div id="life-leisure"></div></div><p id="life-sync" class="workspace-note" role="status"></p><div id="life-conflicts"></div>';
  document.querySelector('#tab-content-home .workspace-grid').before(summary);
  const page=document.getElementById('tab-content-exercise');page.classList.remove('legacy-page');page.replaceChildren();
  const header=node('section','workspace-panel');
  header.innerHTML='<div class="panel-heading"><h2>循序漸進體能重建</h2><button id="training-settings" class="workspace-button" type="button">訓練設定</button></div><div class="training-stage"><strong id="training-stage"></strong><span id="training-week-progress"></span></div><p id="training-stage-detail" class="workspace-note"></p><p class="workspace-note">八週參考架構，每階段建議兩週，僅供參考；可隨時升降階，日期不會自動推進。可維持、減量或暫停，醫療評估與實際身體狀況優先。</p><p class="workspace-note">仍有晃動或重心不穩時，請先暫停步行並接受醫療評估；可選擇休息，不勉強完成。</p><details class="training-safety"><summary>開始前與不舒服時</summary><p>仍有晃動、頭暈或重心不穩時，先暫停步行並接受醫療評估。坐姿活動也只在身體舒適時進行，不勉強完成。若突然出現嚴重頭暈、無法站穩、單側無力或說話異常，應立即就醫。</p><p>步行保持能輕鬆交談的強度；坐姿動作間可休息 30–60 秒。症狀休息與未安排不算未達標，不扣 XP。</p></details>';
  const week=node('section','workspace-panel');week.innerHTML='<div class="panel-heading"><h2>本週安排</h2><span class="workspace-note">點選日期查看菜單</span></div><div id="training-week" class="training-week"></div>';
  const workout=node('section','workspace-panel');workout.innerHTML='<div class="panel-heading"><h2 id="training-date-title">今日訓練</h2><label class="visually-hidden" for="training-date">查看訓練日期</label><input id="training-date" type="date" class="workspace-input"></div><div class="training-toolbar" id="training-toolbar"></div><p id="training-description" class="workspace-note"></p><div id="training-actions"></div><div id="training-controls" class="training-controls"></div><p id="training-feedback" class="workspace-note" role="status"></p>';
  page.append(header,week,workout);
  const date=workout.querySelector('#training-date');date.value=selectedDay;date.onchange=()=>{if(date.value){selectedDay=date.value;render();}};
  function dialog(markup) {const el=node('dialog','workspace-dialog');el.innerHTML=markup;document.body.append(el);el.querySelector('[data-close]').onclick=()=>el.close();return el;}
  const leisure=dialog('<form id="leisure-form"><div class="dialog-heading"><h2>今日休閒</h2><button type="button" data-close>關閉</button></div><label>活動名稱<input id="leisure-title" maxlength="120" placeholder="遊戲、放鬆、閱讀…"></label><label>時間目標（選填，分鐘）<input id="leisure-minutes" type="number" min="1" max="240" placeholder="不設定時間"></label><label class="life-check"><input type="checkbox" id="leisure-complete"> 已完成</label><p class="workspace-note">休閒是恢復與平衡；時間長短不會增加 XP 或獎勵。清空名稱可取消安排。</p><p role="alert" id="leisure-error"></p><div class="dialog-actions"><button type="submit" class="workspace-button primary">儲存休閒</button></div></form>');
  function openLeisure() {const current=store.habits(today()).questOS_v1?.leisure||lifeSummary(planner,today(),store.training(),store.habits(today())).leisure;leisure.querySelector('#leisure-title').value=current.title;leisure.querySelector('#leisure-minutes').value=current.minutes??'';leisure.querySelector('#leisure-complete').checked=current.status==='complete';leisure.querySelector('#leisure-error').textContent='';leisure.showModal();}
  leisure.querySelector('form').onsubmit=event=>{event.preventDefault();try {const time=leisure.querySelector('#leisure-minutes').value;store.setLeisure(today(),{title:leisure.querySelector('#leisure-title').value,minutes:time?Number(time):null,status:leisure.querySelector('#leisure-complete').checked?'complete':'pending'});leisure.close();}catch(error){leisure.querySelector('#leisure-error').textContent=error.message;}};
  const studyTime=dialog('<form id="study-time-form"><div class="dialog-heading"><h2>今日學習時間目標</h2><button type="button" data-close>關閉</button></div><label>分鐘（選填）<input id="study-goal-minutes" type="number" min="1" max="1440" placeholder="留空取消目標"></label><p class="workspace-note">時間是規劃參考，不影響任務或課程完成率。</p><p id="study-time-error" role="alert"></p><div class="dialog-actions"><button type="submit" class="workspace-button primary">儲存時間目標</button></div></form>');
  studyTime.querySelector('form').onsubmit=event=>{event.preventDefault();try{const raw=studyTime.querySelector('input').value;store.setStudyMinutes(today(),raw?Number(raw):null);studyTime.close();}catch(error){studyTime.querySelector('#study-time-error').textContent=error.message;}};
  const settings=dialog('<form id="training-settings-form"><div class="dialog-heading"><h2>訓練設定</h2><button type="button" data-close>關閉</button></div><p id="settings-stage" class="workspace-note"></p><div id="stage-actions" class="training-controls"></div><label class="life-check"><input id="training-paused" type="checkbox"> 暫停訓練（未記錄日期顯示恢復日）</label><label class="life-check"><input id="training-standing" type="checkbox"> 步態穩定，且已經評估適合支撐站姿動作</label><p class="workspace-note">支撐站姿只在階段 3–4 選用；關閉時仍使用坐姿菜單。</p><h3>每週安排</h3><p class="workspace-note">套用到尚未記錄的日期；已儲存的菜單與結果保持原樣。</p><div id="training-week-settings" class="training-settings-grid"></div><p role="alert" id="settings-error"></p><div class="dialog-actions"><button type="submit" class="workspace-button primary">儲存設定</button></div></form>');
  const weekdays=['週一','週二','週三','週四','週五','週六','週日'];
  for(let i=0;i<7;i++){const label=node('label','',weekdays[i]);const select=node('select','');select.id='training-weekday-'+i;for(const [value,title] of Object.entries(TYPES)){const option=node('option','',title);option.value=value;select.append(option);}label.append(select);settings.querySelector('#training-week-settings').append(label);}
  function saveSettings(start=false) {
    try {
      const config=store.training();
      store.setTraining({stage:Number(settings.querySelector('#training-stage-select').value),paused:start?false:settings.querySelector('#training-paused').checked,supportedStanding:settings.querySelector('#training-standing').checked,week:weekdays.map((_,i)=>settings.querySelector('#training-weekday-'+i).value),...(start?{startedOn:config.startedOn||today(),stageSince:config.stageSince||today()}:{} )});
      settings.close();
    }catch(error){settings.querySelector('#settings-error').textContent=error.message;}
  }
  function settingsStage() {
    const config=store.training();settings.querySelector('#settings-stage').textContent=`目前階段 ${config.stage} · ${STAGES[config.stage-1].title}${config.startedOn?' · 本階段自 '+config.stageSince+' 起':' · 尚未開始'}`;
    const actions=settings.querySelector('#stage-actions');actions.replaceChildren();
    const label=node('label','','訓練階段');const select=node('select','');select.id='training-stage-select';
    for(const stage of STAGES){const option=node('option','',`階段 ${stage.id} · ${stage.title}`);option.value=String(stage.id);select.append(option);}select.value=String(config.stage);label.append(select);actions.append(label);
    actions.append(button('回到階段 1',()=>{select.value='1';}),node('p','workspace-note','可隨時選擇任一階段；兩週節奏僅供參考。儲存後套用到尚未記錄的日期，已有菜單與結果不會被更改。'));
    if(!config.startedOn)actions.append(button('開始訓練',()=>saveSettings(true)));
  }
  header.querySelector('#training-settings').onclick=()=>{const config=store.training();settings.querySelector('#training-paused').checked=config.paused;settings.querySelector('#training-standing').checked=config.supportedStanding;config.week.forEach((type,i)=>settings.querySelector('#training-weekday-'+i).value=type);settings.querySelector('#settings-error').textContent='';settingsStage();settings.showModal();};
  settings.querySelector('form').onsubmit=event=>{event.preventDefault();saveSettings();};
  const schedule=dialog('<form id="exercise-schedule-form"><div class="dialog-heading"><h2>安排訓練</h2><button type="button" data-close>關閉</button></div><label>訓練日期<input id="exercise-schedule-date" type="date" required></label><label>訓練類型<select id="exercise-schedule-type"></select></label><label>預計分鐘（選填）<input id="exercise-schedule-minutes" type="number" min="1" max="60" placeholder="使用階段建議時間"></label><p class="workspace-note">這是單日安排。改到其他日期會保留原日期的完成紀錄；若原日尚未開始，會改為未安排。請依耐受情況減量，休息日不用完成動作。</p><p id="exercise-schedule-error" role="alert"></p><div class="dialog-actions"><button type="submit" class="workspace-button primary">儲存訓練安排</button></div></form>');
  for(const [value,title] of Object.entries(TYPES)){const option=node('option','',title);option.value=value;schedule.querySelector('select').append(option);}
  schedule.querySelector('select').onchange=()=>{schedule.querySelector('#exercise-schedule-minutes').value='';};
  let editingDay=null;
  function openSchedule() {editingDay=selectedDay;const current=store.exercise(selectedDay);schedule.querySelector('#exercise-schedule-date').value=selectedDay;schedule.querySelector('select').value=current.type;schedule.querySelector('#exercise-schedule-minutes').value=current.minutes??'';schedule.querySelector('#exercise-schedule-error').textContent='';schedule.showModal();}
  schedule.querySelector('form').onsubmit=event=>{event.preventDefault();try{const target=schedule.querySelector('#exercise-schedule-date').value;const time=schedule.querySelector('#exercise-schedule-minutes').value;store.schedule(target,schedule.querySelector('select').value,time?Number(time):null);const previous=store.exercise(editingDay);if(target!==editingDay&&previous.status==='pending'&&!Object.values(previous.actions).some(Boolean))store.schedule(editingDay,'none');selectedDay=target;date.value=target;schedule.close();render();}catch(error){schedule.querySelector('#exercise-schedule-error').textContent=error.message;}};
  function perform(action) {try{action();workout.querySelector('#training-feedback').textContent='已保存在本機；休息也是照顧自己。';}catch(error){workout.querySelector('#training-feedback').textContent=error.message;}}
  function describeChoice(value) {
    if(value===null)return '尚未設定';
    if(typeof value==='number')return value+' 分鐘';
    if(value.week)return `階段 ${value.stage} · ${value.paused?'暫停':'進行中'} · 每週 ${value.week.map(type=>TYPES[type]).join('／')}`;
    if(value.category==='exercise')return `${TYPES[value.type]} · ${STATUS[value.status]} · ${Object.values(value.actions||{}).filter(Boolean).length} 個動作已勾選${value.minutes?' · '+value.minutes+' 分鐘':''}`;
    return `${value.title||'未安排'} · ${value.status==='complete'?'已完成':value.status==='pending'?'尚未完成':'未安排'}${value.minutes?' · '+value.minutes+' 分鐘':''}`;
  }
  function renderSummary() {
    const goals=lifeSummary(planner,today(),store.training(),store.habits(today()));
    const study=summary.querySelector('#life-study');study.replaceChildren(node('strong','','讀書'),node('p','',`${goals.study.done} / ${goals.study.total} 任務 · ${goals.study.percent}%`));
    const time=goals.study.minutes??(goals.study.plannedMinutes||null);study.append(node('small','',time?`時間${goals.study.minutes?'目標':'安排'} ${time} 分鐘`:'時間目標選填'),button('時間目標',()=>{studyTime.querySelector('input').value=goals.study.minutes??'';studyTime.querySelector('#study-time-error').textContent='';studyTime.showModal();},'workspace-link'));
    const exercise=summary.querySelector('#life-exercise');exercise.replaceChildren(node('strong','','運動'),node('p','',goals.exercise.legacy?'已完成（舊打卡）':TYPES[goals.exercise.type]+(goals.exercise.minutes?' · '+goals.exercise.minutes+' 分鐘':'')),node('small','',statusLabel(goals.exercise)),button('訓練菜單 →',()=>{selectedDay=today();date.value=selectedDay;window.switchTab('exercise');render();},'workspace-link'));
    const leisureGoal=summary.querySelector('#life-leisure');leisureGoal.replaceChildren(node('strong','','休閒'),node('p','',goals.leisure.title||'尚未安排'),node('small','',(goals.leisure.minutes?goals.leisure.minutes+' 分鐘 · ':'')+(goals.leisure.status==='complete'?'已完成':goals.leisure.status==='pending'?'尚未完成':'未安排')),button('安排休閒',openLeisure,'workspace-link'));
    if(goals.leisure.title){const label=node('label','life-check');const cb=node('input','');cb.type='checkbox';cb.checked=goals.leisure.status==='complete';cb.setAttribute('aria-label','完成今日休閒');cb.onchange=()=>store.setLeisure(today(),{...goals.leisure,status:cb.checked?'complete':'pending'});label.append(cb,node('span','','完成'));leisureGoal.append(label);}
    const status=store.status();summary.querySelector('#life-sync').textContent=status.error?'生活目標同步失敗（'+status.error+'），本機紀錄已保留。':status.pending?'生活目標待同步 · 本機紀錄已保留':'';
    const conflicts=summary.querySelector('#life-conflicts');conflicts.replaceChildren();
    for(const id of Object.keys(status.conflicts)){const choice=store.choices(id),notice=node('div','planner-conflict');notice.append(node('p','',`「${id==='training'?'訓練設定':id.replace(':exercise',' 運動').replace(':leisure',' 休閒').replace(':studyMinutes',' 學習時間')}」也在其他裝置修改。請選擇要保留的內容。`));for(const [name,value] of [['本機',choice.local],['雲端',choice.cloud]]){const detail=node('details','');detail.append(node('summary','',name+'內容'),node('p','workspace-note',describeChoice(value)));notice.append(detail);}notice.append(button('保留本機修改',()=>store.resolve(id,true)),button('採用雲端修改',()=>store.resolve(id,false)));conflicts.append(notice);}
    // Conflicts remain reachable from the workout page as well as the overview.
    workout.querySelector('#training-feedback').textContent=status.error?'同步失敗，本機紀錄已保留，可重試。':Object.keys(status.conflicts).length?'有跨裝置修改衝突，請回總覽選擇保留內容。':status.pending?'待同步 · 本機紀錄已保留':'';
  }
  function render() {
    renderSummary();const config=store.training(),weekly=trainingWeek(config,today(),store.habits);
    header.querySelector('#training-stage').textContent=`階段 ${config.stage} · ${STAGES[config.stage-1].title}`;
    header.querySelector('#training-stage-detail').textContent=config.paused?'目前暫停 · 未記錄日期為恢復日':config.stageSince?`本階段自 ${config.stageSince} 起 · ${STAGES[config.stage-1].weeks}為參考，不自動升級`:'尚未開始 · 從訓練設定開始，或先安排單日低強度活動。';
    header.querySelector('#training-week-progress').textContent=`本週 ${weekly.completed} / ${weekly.planned} 次完成 · ${weekly.rest} 天恢復`;
    const days=week.querySelector('#training-week');days.replaceChildren();
    weekly.days.forEach((day,i)=>{const b=button('',()=>{selectedDay=day.date;date.value=selectedDay;render();},'training-day');b.setAttribute('aria-pressed',String(day.date===selectedDay));b.append(node('strong','',weekdays[i]),node('time','',day.date.slice(5).replace('-','/')),node('span','',day.legacy?'舊打卡':TYPES[day.type]),node('small','',statusLabel(day)));days.append(b);});
    workout.querySelector('#training-date-title').textContent=selectedDay===today()?'今日訓練':selectedDay+' 訓練';
    const current=store.exercise(selectedDay),menu=exerciseMenu({...current,alternative:current.mode==='alternative'}),canCheck=!config.paused&&!['symptom_rest','not_scheduled'].includes(current.status);
    const toolbar=workout.querySelector('#training-toolbar');toolbar.replaceChildren(button('修改日期／類型',openSchedule),button('回到今天',()=>{selectedDay=today();date.value=selectedDay;render();}));
    workout.querySelector('#training-description').textContent=`${current.legacy?'舊運動打卡 · 沒有動作明細':TYPES[current.type]+(current.mode==='alternative'?'（低強度替代）':'')+(current.minutes?' · 預計 '+current.minutes+' 分鐘':'')} · ${statusLabel(current)}`;
    const actions=workout.querySelector('#training-actions'),focused=document.activeElement?.dataset.exerciseAction;actions.replaceChildren();
    if(!menu.length||['symptom_rest','not_scheduled'].includes(current.status))actions.append(node('p','training-empty',config.paused?'目前暫停訓練，休息不需要補做。':current.status==='symptom_rest'?'今天先恢復，不需要完成訓練。':current.status==='complete'?'舊打卡已完成；沒有回填動作紀錄。':current.type==='rest'?'恢復日，不需打卡或補做。':'今天沒有訓練安排，按需要調整即可。'));
    else for(const action of menu){const row=node('div','training-action');const label=node('label','');const cb=node('input','');cb.type='checkbox';cb.checked=!!current.actions[action.id];cb.disabled=!canCheck;cb.dataset.exerciseAction=action.id;cb.onchange=()=>perform(()=>store.toggleAction(selectedDay,action.id,cb.checked));const copy=node('span','');copy.append(node('strong','',action.name),node('small','',action.en));label.append(cb,copy);row.append(label,node('p','training-dose',`${action.sets} 組 × ${action.minutes?action.minutes+' 分鐘':(action.perSide?'每側 ':'')+action.reps+' 下'}`),node('p','',action.instruction),node('p','workspace-note',action.caution));actions.append(row);}
    if(focused)actions.querySelector('[data-exercise-action="'+CSS.escape(focused)+'"]')?.focus({preventScroll:true});
    const controls=workout.querySelector('#training-controls');controls.replaceChildren();
    const finish=button('完成今日訓練',()=>perform(()=>store.finish(selectedDay)),'workspace-button primary');finish.id='finish-training';finish.disabled=!canCheck||!menu.length||menu.some(action=>!current.actions[action.id]);controls.append(finish,button('改用低強度替代',()=>perform(()=>store.alternative(selectedDay))),button('症狀休息',()=>perform(()=>store.symptomRest(selectedDay))),button('設為恢復日',()=>perform(()=>store.schedule(selectedDay,'rest'))));
  }
  // Old sport/rest checkboxes now call the same model; hide the punitive streak display.
  const streak=document.getElementById('streak-days')?.parentElement;
  if(streak){streak.id='legacy-streak-display';streak.hidden=true;}
  return {render};
}
