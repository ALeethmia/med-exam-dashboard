import {dateKey} from './study-core.js';
import {lifeSummary,trainingWeek,exerciseMenu,TYPES,STATUS,STAGES,MENU_VERSION,stageExercise,untouchedExercise,RECOMMENDED_WEEK,walkRangeText,hasTrainingMenu,modeExercise,menuConfig,scheduleNeedsConfirmation} from './life-core.js';
const statusLabel=exercise=>exercise.type==='rest'&&exercise.status==='not_scheduled'?'恢復日 · 無須打卡':STATUS[exercise.status];
const doseText=action=>`${action.sets} 組 × ${action.minutes?action.minutes+' 分鐘':action.seconds?action.seconds+' 秒':(action.perSide?'每側 ':'')+action.reps+' 下'}${action.holdSeconds?'（每次 '+action.holdSeconds+' 秒）':''}`;
const menuFor=record=>exerciseMenu({...record,alternative:record.mode==='alternative'});
const node=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const button=(text,action,cls='workspace-button')=>{const el=node('button',cls,text);el.type='button';el.onclick=action;return el;};
export function createLifeUI({store,planner,today=()=>dateKey()}) {
  let selectedDay=today();
  const summary=node('section','life-overview');summary.setAttribute('aria-labelledby','life-title');
  summary.innerHTML='<div class="panel-heading"><h2 id="life-title">今日目標</h2><span class="workspace-note">學習 · 活動 · 恢復</span></div><div class="life-goals"><div id="life-study"></div><div id="life-exercise"></div><div id="life-leisure"></div></div><p id="life-sync" class="workspace-note" role="status"></p><div id="life-conflicts"></div>';
  document.querySelector('#tab-content-home .workspace-grid').before(summary);
  const page=document.getElementById('tab-content-exercise');page.classList.remove('legacy-page');page.replaceChildren();
  const header=node('section','workspace-panel');
  header.innerHTML='<div class="panel-heading"><h2>八週全身體能重建</h2><button id="training-settings" class="workspace-button" type="button">訓練設定</button></div><div class="training-stage"><strong id="training-stage"></strong><span id="training-week-progress"></span></div><p id="training-stage-detail" class="workspace-note"></p><p class="workspace-note">八週參考架構，每階段建議兩週，僅供參考；可隨時升降階，日期不會自動推進。可維持、減量或暫停，醫療評估與實際身體狀況優先。</p><p class="workspace-note">仍有晃動或重心不穩時，請先暫停步行並接受醫療評估；可選擇休息，不勉強完成。</p><details class="training-safety"><summary>開始前與不舒服時</summary><p>仍有晃動、頭暈或重心不穩時，先暫停步行並接受醫療評估。坐姿活動也只在身體舒適時進行，不勉強完成。若突然出現嚴重頭暈、無法站穩、單側無力或說話異常，應立即就醫。</p><p>步行保持能輕鬆交談的強度；坐姿動作間可休息 30–60 秒。症狀休息與未安排不算未達標，不扣 XP。</p></details>';
  const week=node('section','workspace-panel');week.innerHTML='<div class="panel-heading"><h2>本週安排</h2><span class="workspace-note">點選日期查看菜單</span></div><div id="training-week" class="training-week"></div>';
  const weekGuide=node('p','workspace-note');weekGuide.id='training-week-guide';week.append(weekGuide);
  const workout=node('section','workspace-panel');workout.innerHTML='<div class="panel-heading"><h2 id="training-date-title">今日訓練</h2><label class="visually-hidden" for="training-date">查看訓練日期</label><input id="training-date" type="date" class="workspace-input"></div><div class="training-toolbar" id="training-toolbar"></div><p id="training-description" class="workspace-note"></p><div id="training-actions"></div><div id="training-controls" class="training-controls"></div><p id="training-feedback" class="workspace-note" role="status"></p>';
  page.append(header,week,workout);
  const mismatch=node('div','stage-mismatch');mismatch.id='training-stage-mismatch';workout.querySelector('#training-description').after(mismatch);
  const revisionHistory=node('details','planner-history');revisionHistory.id='training-revisions';revisionHistory.append(node('summary','','保留的原菜單與結果'));const revisionList=node('div','');revisionHistory.append(revisionList);workout.append(revisionHistory);
  const date=workout.querySelector('#training-date');date.value=selectedDay;date.onchange=()=>{if(date.value){selectedDay=date.value;render();}};
  function dialog(markup) {const el=node('dialog','workspace-dialog');el.innerHTML=markup;document.body.append(el);el.querySelector('[data-close]').onclick=()=>el.close();return el;}
  const leisure=dialog('<form id="leisure-form"><div class="dialog-heading"><h2>今日休閒</h2><button type="button" data-close>關閉</button></div><label>活動名稱<input id="leisure-title" maxlength="120" placeholder="遊戲、放鬆、閱讀…"></label><label>時間目標（選填，分鐘）<input id="leisure-minutes" type="number" min="1" max="240" placeholder="不設定時間"></label><label class="life-check"><input type="checkbox" id="leisure-complete"> 已完成</label><p class="workspace-note">休閒是恢復與平衡；時間長短不會增加 XP 或獎勵。清空名稱可取消安排。</p><p role="alert" id="leisure-error"></p><div class="dialog-actions"><button type="submit" class="workspace-button primary">儲存休閒</button></div></form>');
  function openLeisure() {const current=store.habits(today()).questOS_v1?.leisure||lifeSummary(planner,today(),store.training(),store.habits(today())).leisure;leisure.querySelector('#leisure-title').value=current.title;leisure.querySelector('#leisure-minutes').value=current.minutes??'';leisure.querySelector('#leisure-complete').checked=current.status==='complete';leisure.querySelector('#leisure-error').textContent='';leisure.showModal();}
  leisure.querySelector('form').onsubmit=event=>{event.preventDefault();try {const time=leisure.querySelector('#leisure-minutes').value;store.setLeisure(today(),{title:leisure.querySelector('#leisure-title').value,minutes:time?Number(time):null,status:leisure.querySelector('#leisure-complete').checked?'complete':'pending'});leisure.close();}catch(error){leisure.querySelector('#leisure-error').textContent=error.message;}};
  const studyTime=dialog('<form id="study-time-form"><div class="dialog-heading"><h2>今日學習時間目標</h2><button type="button" data-close>關閉</button></div><label>分鐘（選填）<input id="study-goal-minutes" type="number" min="1" max="1440" placeholder="留空取消目標"></label><p class="workspace-note">時間是規劃參考，不影響任務或課程完成率。</p><p id="study-time-error" role="alert"></p><div class="dialog-actions"><button type="submit" class="workspace-button primary">儲存時間目標</button></div></form>');
  studyTime.querySelector('form').onsubmit=event=>{event.preventDefault();try{const raw=studyTime.querySelector('input').value;store.setStudyMinutes(today(),raw?Number(raw):null);studyTime.close();}catch(error){studyTime.querySelector('#study-time-error').textContent=error.message;}};
  const settings=dialog('<form id="training-settings-form"><div class="dialog-heading"><h2>訓練設定</h2><button type="button" data-close>關閉</button></div><p id="settings-stage" class="workspace-note"></p><div id="stage-actions" class="training-controls"></div><label class="life-check"><input id="training-paused" type="checkbox"> 暫停訓練（未記錄日期顯示恢復日）</label><div class="planner-form-grid"><label>預設訓練模式<select id="training-mode"><option value="general">一般體能重建</option><option value="alternative">低強度替代</option></select></label><label>動作條件<select id="training-readiness"><option value="seated">不穩或未評估：使用坐姿替代</option><option value="supported">步態穩定且適合：使用支撐站姿</option></select></label></div><p class="workspace-note">一般模式依條件安排下肢、推、拉、核心。明顯頭暈、晃動或不適時，請選低強度替代或症狀休息，不勉強運動。</p><h3>每週安排</h3><p class="workspace-note">套用到尚未記錄的日期；已儲存的菜單與結果保持原樣。</p><div id="training-week-settings" class="training-settings-grid"></div><p role="alert" id="settings-error"></p><div class="dialog-actions"><button type="submit" class="workspace-button primary">儲存設定</button></div></form>');
  const weekdays=['週一','週二','週三','週四','週五','週六','週日'];
  for(let i=0;i<7;i++){const label=node('label','',weekdays[i]);const select=node('select','');select.id='training-weekday-'+i;for(const [value,title] of Object.entries(TYPES)){const option=node('option','',title);option.value=value;select.append(option);}label.append(select);settings.querySelector('#training-week-settings').append(label);}
  const previews=node('section','stage-previews');previews.id='training-stage-previews';settings.querySelector('#stage-actions').after(previews);
  function stagePreviews() {
    const selected=Number(settings.querySelector('#training-stage-select').value),standing=settings.querySelector('#training-readiness').value==='supported';
    previews.replaceChildren(node('h3','','四階段菜單預覽'),node('p','workspace-note',settings.querySelector('#training-mode').value==='alternative'?'目前選擇低強度替代；一般菜單列在下方供比較，當日僅採坐姿減量或休息。':standing?'目前狀態適合支撐站姿：一般模式使用下方完整 A／B 菜單。':'目前採坐姿替代：保留全身推、拉、下肢與核心，站姿選項列在下方供比較。'));
    for(const stage of STAGES) {
      const detail=node('details','stage-preview');detail.dataset.stage=String(stage.id);detail.open=stage.id===selected;detail.setAttribute('data-selected',String(stage.id===selected));
      detail.append(node('summary','',`階段 ${stage.id} · ${stage.title} · 步行 ${walkRangeText(stage.id)}`),node('p','workspace-note',stage.description),node('p','workspace-note',`肌力約 ${stage.seatedMinutes} 分鐘 · A／B 每次做一份，組間休息 30–60 秒，可隨時減量。`));
      for(const [type,title] of [['strength_a','肌力 A · 下肢、推、拉、核心'],['strength_b','肌力 B · 臀腿與核心變化']]) {
        detail.append(node('h4','',title));const list=node('ul','');
        for(const move of exerciseMenu({type,stage:stage.id,supportedStanding:true})) {
          const replacements={chair:'knee',calf:'seated-calf',wall:'palm','wall-core':'brace'};
          const actual=exerciseMenu({type,stage:stage.id,supportedStanding:standing}).find(item=>item.id===(standing?move.id:replacements[move.id]||move.id));
          const alternative=actual&&actual.id!==move.id?' · 目前採用：'+actual.name+' '+doseText(actual):'';
          list.append(node('li','',`${move.name} · ${doseText(move)}${alternative}`));
        }detail.append(list);
      }
      detail.append(node('p','workspace-note','低強度替代：四個坐姿動作一組、5／每側 4／4／5 下，約 5 分鐘；身體不適時可直接休息。'));
      if(stage.id>=2)detail.append(node('p','workspace-note','支撐站姿只在目前功能與醫療評估適合時採用；不適合時自動選擇同類坐姿動作。'));
      previews.append(detail);
    }
  }
  settings.querySelector('#training-readiness').onchange=stagePreviews;settings.querySelector('#training-mode').onchange=stagePreviews;
  let settingsBase=null,settingsStart=false;
  function saveSettings(start=settingsStart) {
    try {
      const config=store.training();
      store.setTraining({stage:Number(settings.querySelector('#training-stage-select').value),paused:start?false:settings.querySelector('#training-paused').checked,supportedStanding:settings.querySelector('#training-readiness').value==='supported',trainingMode:settings.querySelector('#training-mode').value,week:weekdays.map((_,i)=>settings.querySelector('#training-weekday-'+i).value),...(start?{startedOn:config.startedOn||today(),stageSince:config.stageSince||today()}:{} )},{expected:settingsBase});
      settings.close();
    }catch(error){settings.querySelector('#settings-error').textContent=error.message;}
  }
  function settingsStage() {
    const config=store.training();settings.querySelector('#settings-stage').textContent=`目前階段 ${config.stage} · ${STAGES[config.stage-1].title}${config.startedOn?' · 本階段自 '+config.stageSince+' 起':' · 尚未開始'}`;
    const actions=settings.querySelector('#stage-actions');actions.replaceChildren();
    const label=node('label','','訓練階段');const select=node('select','');select.id='training-stage-select';
    for(const stage of STAGES){const option=node('option','',`階段 ${stage.id} · ${stage.title}`);option.value=String(stage.id);select.append(option);}select.value=String(config.stage);label.append(select);
    const pickerRow=node('div','stage-picker-row');pickerRow.append(label,button('回到階段 1',()=>{select.value='1';stagePreviews();}));actions.append(pickerRow,node('p','workspace-note','可隨時選擇任一階段；兩週節奏僅供參考。儲存後，今天及未來尚未開始、沒有動作紀錄的菜單會更新；已開始、已完成、症狀休息與歷史日期保留原菜單。'));
    select.onchange=stagePreviews;stagePreviews();
    if(!config.startedOn)actions.append(button('開始訓練',()=>{settingsStart=true;settings.querySelector('#settings-error').textContent='開始日期已加入草稿，按儲存設定後生效。';}));
  }
  const weekComparison=node('div','training-week-comparison');weekComparison.id='training-week-comparison';settings.querySelector('#training-week-settings').before(weekComparison);
  function compareWeek() {const comparedWeek=settingsBase.week;weekComparison.replaceChildren(node('p','workspace-note','套用只更新視窗草稿，按儲存設定後才生效；關閉或取消不會變更資料。尚未記錄日期使用 A／B 新安排。已儲存的單日安排、進行中與完成紀錄全部保留；可另行調整單日。'));for(let i=0;i<7;i++){const row=node('p','workspace-note');row.append(node('strong','',weekdays[i]+'：'),node('span','',TYPES[comparedWeek[i]]+' → '+TYPES[RECOMMENDED_WEEK[i]]));weekComparison.append(row);}}
  header.querySelector('#training-settings').onclick=()=>{const config=store.training();settingsBase=config;settingsStart=false;settings.querySelector('#training-paused').checked=config.paused;settings.querySelector('#training-readiness').value=config.supportedStanding?'supported':'seated';settings.querySelector('#training-mode').value=config.trainingMode||'general';config.week.forEach((type,i)=>settings.querySelector('#training-weekday-'+i).value=type);settings.querySelector('#settings-error').textContent='';settingsStage();compareWeek();settings.showModal();};
  const preset=button('套用建議週安排（A／B 與步行交錯）',()=>{RECOMMENDED_WEEK.forEach((type,i)=>settings.querySelector('#training-weekday-'+i).value=type);settings.querySelector('#settings-error').textContent='已套用到草稿，按儲存設定後生效；關閉不會變更。';});settings.querySelector('#training-week-settings').before(preset);
  settings.querySelector('form').onsubmit=event=>{event.preventDefault();saveSettings();};
  const schedule=dialog('<form id="exercise-schedule-form"><div class="dialog-heading"><h2>安排訓練</h2><button type="button" data-close>關閉</button></div><label>訓練日期<input id="exercise-schedule-date" type="date" required></label><label>訓練類型<select id="exercise-schedule-type"></select></label><label>預計分鐘（選填）<input id="exercise-schedule-minutes" type="number" min="1" max="60" placeholder="使用階段建議時間"></label><p class="workspace-note">這是單日安排。改到其他日期會保留原日期的完成紀錄；只有今天／未來且沒有開始或動作紀錄的草稿會移走，過去日期保留。請依耐受情況減量，休息日不用完成動作。</p><div id="exercise-schedule-preview"></div><label id="exercise-schedule-confirm-label" class="life-check" hidden><input id="exercise-schedule-confirm" type="checkbox"> 確認取代此日期安排：原菜單、勾選與結果保留，新安排從未完成開始。</label><p id="exercise-schedule-error" role="alert"></p><div class="dialog-actions"><button type="submit" class="workspace-button primary">儲存訓練安排</button></div></form>');
  for(const [value,title] of Object.entries(TYPES)){const option=node('option','',title);option.value=value;schedule.querySelector('select').append(option);}
  let editingDay=null,editingSource=null,schedulePreview=null;
  function updateSchedulePreview() {
    const target=schedule.querySelector('#exercise-schedule-date').value,type=schedule.querySelector('select').value,raw=schedule.querySelector('#exercise-schedule-minutes').value;
    const preview=schedule.querySelector('#exercise-schedule-preview');preview.replaceChildren();schedulePreview=null;schedule.querySelector('#exercise-schedule-confirm').checked=false;
    try {
      const current=store.exercise(target),next=store.previewSchedule(type,raw?Number(raw):null);
      schedulePreview={target,type,time:raw?Number(raw):null,current,config:store.training(),protected:scheduleNeedsConfirmation(current,target,today())};
      schedule.querySelector('#exercise-schedule-confirm-label').hidden=!schedulePreview.protected;
      if(target!==editingDay)preview.append(node('p','workspace-note',editingDay+(editingDay>=today()&&untouchedExercise(editingSource)?'：尚未開始的安排將移走。':'：原菜單與結果保持不變，新日期另行安排。')));
      preview.append(node('p','workspace-note',target+'：'+TYPES[current.type]+' · '+statusLabel(current)+' → '+TYPES[next.type]+(next.minutes?' · '+next.minutes+' 分鐘':'')+(schedulePreview.protected?'。確認後原紀錄可於「保留的原菜單與結果」查看。':'。尚未開始，可直接安排。')));
      for(const [title,record] of [['原菜單',current],['新安排',next]]){const detail=node('details','stage-preview');detail.append(node('summary','',title));for(const move of menuFor(record))detail.append(node('p','workspace-note',(record.actions?.[move.id]?'✓ ':'')+move.name+' · '+doseText(move)));preview.append(detail);}
    }catch(error){schedule.querySelector('#exercise-schedule-error').textContent=error.message;}
  }
  schedule.querySelector('select').onchange=()=>{const input=schedule.querySelector('#exercise-schedule-minutes');input.value='';input.max=schedule.querySelector('select').value==='walk'?'120':'60';updateSchedulePreview();};
  schedule.querySelector('#exercise-schedule-date').onchange=updateSchedulePreview;schedule.querySelector('#exercise-schedule-minutes').oninput=updateSchedulePreview;
  function openSchedule(requestedType) {editingDay=selectedDay;editingSource=store.exercise(selectedDay);const current=editingSource;schedule.querySelector('#exercise-schedule-date').value=selectedDay;schedule.querySelector('select').value=typeof requestedType==='string'?requestedType:current.type;schedule.querySelector('#exercise-schedule-minutes').value=typeof requestedType==='string'||current.timeSource==='stage'?'':current.minutes??'';schedule.querySelector('#exercise-schedule-minutes').max=current.type==='walk'?'120':'60';schedule.querySelector('#exercise-schedule-error').textContent='';updateSchedulePreview();schedule.showModal();}
  schedule.querySelector('form').onsubmit=event=>{event.preventDefault();try{
    if(!schedulePreview)throw new Error('請先查看有效的日期與安排。');
    const confirmed=schedule.querySelector('#exercise-schedule-confirm').checked;
    if(schedulePreview.protected&&!confirmed)throw new Error('請先確認取代安排；原菜單與結果會保留。');
    store.moveSchedule(editingDay,schedulePreview.target,schedulePreview.type,schedulePreview.time,{confirmed,expected:schedulePreview.current,expectedSource:editingSource,expectedConfig:schedulePreview.config});
    selectedDay=schedulePreview.target;date.value=selectedDay;schedule.close();render();
  }catch(error){schedule.querySelector('#exercise-schedule-error').textContent=error.message;}};
  const stageApply=dialog('<form id="apply-stage-form"><div class="dialog-heading"><h2>套用目前階段</h2><button type="button" data-close>取消</button></div><p id="apply-stage-description" class="workspace-note"></p><div id="apply-stage-comparison" class="stage-comparison"></div><label class="life-check" id="apply-stage-confirm-label"><input id="apply-stage-confirm" type="checkbox"> 我確認重新安排；原菜單、勾選與結果將保存，新菜單從未完成開始。</label><p id="apply-stage-error" role="alert"></p><div class="dialog-actions"><button type="submit" class="workspace-button primary">確認套用</button></div></form>');
  let applying=null;
  function openStageApply() {
    const current=store.exercise(selectedDay),config=store.training(),next=stageExercise(current,config);
    applying={day:selectedDay,current,targetStage:config.stage,expectedConfig:menuConfig(config),protected:!untouchedExercise(current)||selectedDay<today()};
    stageApply.querySelector('#apply-stage-confirm-label').hidden=!applying.protected;stageApply.querySelector('#apply-stage-confirm').checked=false;stageApply.querySelector('#apply-stage-error').textContent='';
    stageApply.querySelector('#apply-stage-description').textContent=`${selectedDay}：階段 ${current.stage} → ${config.stage}。保留訓練類型${current.mode==='alternative'?'與減量替代模式':''}，${next.timeSource==='stage'?'更新建議時間':next.timeSource==='custom'?'保留自訂時間':'保留舊版時間'}。${applying.protected?'目前的動作勾選與 '+statusLabel(current)+' 結果將另存保留；新菜單需重新完成，不增加 XP。':'更新菜單，不影響其他日期。'}`;
    const comparison=stageApply.querySelector('#apply-stage-comparison');comparison.replaceChildren();
    for(const [title,record] of [['原菜單',current],['新菜單',next]]){const section=node('div','');section.append(node('h3','',title),node('p','workspace-note',record.minutes?`預計 ${record.minutes} 分鐘`:'不設定時間'));const list=node('ul','');for(const move of menuFor(record))list.append(node('li','',move.name+' · '+doseText(move)));section.append(list);comparison.append(section);}
    stageApply.showModal();
  }
  stageApply.querySelector('form').onsubmit=event=>{event.preventDefault();try{if(applying.protected&&!stageApply.querySelector('#apply-stage-confirm').checked)throw new Error('請確認原紀錄保留、新菜單重新開始。');store.applyStage(applying.day,{confirmed:stageApply.querySelector('#apply-stage-confirm').checked,expected:applying.current,targetStage:applying.targetStage,expectedConfig:applying.expectedConfig});stageApply.close();render();}catch(error){stageApply.querySelector('#apply-stage-error').textContent=error.message;}};
  const adjustment=dialog('<form id="training-adjustment-form"><div class="dialog-heading"><h2 id="adjustment-title"></h2><button type="button" data-close>取消</button></div><p id="adjustment-description" class="workspace-note"></p><label id="walk-goal-label" hidden>當日步行目標（分鐘）<input id="walk-goal-minutes" type="number" min="1" max="120"></label><p id="walk-goal-range" class="workspace-note"></p><div id="adjustment-menu"></div><label id="adjustment-confirm-label" class="life-check"><input id="adjustment-confirm" type="checkbox"> 確認重新安排：原菜單、動作與結果保存，新安排從未完成開始。</label><p id="adjustment-error" role="alert"></p><div class="dialog-actions"><button type="submit" class="workspace-button primary">儲存調整</button></div></form>');
  let adjusting=null;
  function openAdjustment(kind) {
    const current=store.exercise(selectedDay);adjusting={day:selectedDay,kind,current,expectedConfig:menuConfig(store.training()),protected:!untouchedExercise(current)||selectedDay<today()};
    adjustment.querySelector('#adjustment-title').textContent=kind==='walk'?'調整當日步行目標':kind==='general'?'一般體能重建':'低強度替代';
    adjustment.querySelector('#walk-goal-label').hidden=kind!=='walk';adjustment.querySelector('#walk-goal-minutes').value=current.minutes??STAGES[current.stage-1].walk;
    adjustment.querySelector('#walk-goal-range').textContent=kind==='walk'?`階段 ${current.stage} 建議 ${walkRangeText(current.stage)}，可依耐受情況減量；這是參考範圍，不是最低達標門檻。`:'';
    adjustment.querySelector('#adjustment-confirm-label').hidden=!adjusting.protected;adjustment.querySelector('#adjustment-confirm').checked=false;adjustment.querySelector('#adjustment-error').textContent='';
    adjustment.querySelector('#adjustment-description').textContent=(kind==='walk'?'只修改這個日期的步行目標；切換階段也會保留日期時間。':'保留日期與訓練類型；模式可依今日狀況調整。明顯頭暈或不穩時請休息。')+(adjusting.protected?'已有紀錄將另存保留，確認後重新安排。':'尚未開始，可直接調整。');
    const preview=adjustment.querySelector('#adjustment-menu');preview.replaceChildren();if(kind!=='walk')for(const move of menuFor(modeExercise(current,store.training(),kind)))preview.append(node('p','workspace-note',move.name+' · '+doseText(move)));
    adjustment.showModal();
  }
  adjustment.querySelector('form').onsubmit=event=>{event.preventDefault();try{const options={confirmed:adjustment.querySelector('#adjustment-confirm').checked,expected:adjusting.current,expectedConfig:adjusting.expectedConfig};if(adjusting.kind==='walk')store.setWalkGoal(adjusting.day,Number(adjustment.querySelector('#walk-goal-minutes').value),options);else store.changeMode(adjusting.day,adjusting.kind,options);adjustment.close();render();}catch(error){adjustment.querySelector('#adjustment-error').textContent=error.message;}};
  const daySettings=dialog('<div id="training-day-settings"><div class="dialog-heading"><h2>單日訓練設定</h2><button type="button" data-close>關閉</button></div><p id="training-day-mode" class="workspace-note"></p><p class="workspace-note">只調整查看的日期；預設模式與支撐站姿條件請至訓練設定。已有紀錄的變更會先說明並要求確認。</p><div id="training-day-options" class="training-controls"></div></div>');
  function openDaySettings() {const current=store.exercise(selectedDay);daySettings.querySelector('#training-day-mode').textContent=selectedDay+' · '+(current.mode==='alternative'?'低強度替代菜單':'一般體能重建菜單');const options=daySettings.querySelector('#training-day-options');options.replaceChildren();for(const [kind,title] of [['general','一般體能重建'],['alternative','改用低強度替代']]){const choice=button(title,()=>{daySettings.close();openAdjustment(kind);});choice.disabled=(kind==='alternative'?current.mode==='alternative':current.mode!=='alternative')&&current.menuVersion===MENU_VERSION;options.append(choice);}daySettings.showModal();}
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
    weekGuide.replaceChildren();if(config.week.includes('seated'))weekGuide.append(node('span','','目前每週模板仍有舊版坐姿安排。'),button('比較新版 A／B 週安排',()=>header.querySelector('#training-settings').click(),'workspace-link'));
    const days=week.querySelector('#training-week');days.replaceChildren();
    weekly.days.forEach((day,i)=>{const b=button('',()=>{selectedDay=day.date;date.value=selectedDay;render();},'training-day');b.setAttribute('aria-pressed',String(day.date===selectedDay));b.append(node('strong','',weekdays[i]),node('time','',day.date.slice(5).replace('-','/')),node('span','',day.legacy?'舊打卡':TYPES[day.type]),node('small','',statusLabel(day)));days.append(b);});
    workout.querySelector('#training-date-title').textContent=selectedDay===today()?'今日訓練':selectedDay+' 訓練';
    const current=store.exercise(selectedDay),menu=menuFor(current),canCheck=!config.paused&&!['symptom_rest','not_scheduled'].includes(current.status);
    const toolbar=workout.querySelector('#training-toolbar');toolbar.replaceChildren(button('修改日期／類型',openSchedule),button('回到今天',()=>{selectedDay=today();date.value=selectedDay;render();}));
    if(hasTrainingMenu(current.type)) {
      toolbar.append(button('單日設定',openDaySettings));
      if(current.type==='walk'&&current.mode!=='alternative')toolbar.append(button('調整步行目標',()=>openAdjustment('walk')));
    }
    toolbar.append(button('症狀休息',()=>perform(()=>store.symptomRest(selectedDay))));
    workout.querySelector('#training-description').textContent=`${current.legacy?'舊運動打卡 · 沒有動作明細':TYPES[current.type]+(current.mode==='alternative'?'（低強度替代菜單）':hasTrainingMenu(current.type)?'（一般體能重建菜單）':'')+(current.minutes?' · 當日目標 '+current.minutes+' 分鐘':'')+(current.type==='walk'&&current.menuVersion>=3&&current.mode!=='alternative'?' · 建議 '+walkRangeText(current.stage):'')} · ${statusLabel(current)} · 階段 ${current.stage} 菜單`;
    mismatch.replaceChildren();
    if(current.stage!==config.stage || (current.menuVersion!==MENU_VERSION&&hasTrainingMenu(current.type))) {
      mismatch.append(node('p','workspace-note',`此日期保留階段 ${current.stage} 菜單，目前設定為階段 ${config.stage}${current.menuVersion!==MENU_VERSION?' · 保留原版動作劑量':''}`));
      if(hasTrainingMenu(current.type))mismatch.append(button('套用目前階段',openStageApply));
    }
    revisionList.replaceChildren();revisionHistory.hidden=!Object.keys(current.revisions||{}).length;
    for(const previous of Object.values(current.revisions||{})){const detail=node('details','stage-preview');detail.append(node('summary','',`階段 ${previous.stage} · ${statusLabel(previous)} · ${Object.values(previous.actions||{}).filter(Boolean).length} 個動作已勾選`));for(const move of menuFor(previous))detail.append(node('p','workspace-note',`${previous.actions?.[move.id]?'✓':'○'} ${move.name} · ${doseText(move)}`));revisionList.append(detail);}
    const actions=workout.querySelector('#training-actions'),focused=document.activeElement?.dataset.exerciseAction;actions.replaceChildren();
    if(!menu.length||['symptom_rest','not_scheduled'].includes(current.status))actions.append(node('p','training-empty',config.paused?'目前暫停訓練，休息不需要補做。':current.status==='symptom_rest'?'今天先恢復，不需要完成訓練。':current.status==='complete'?'舊打卡已完成；沒有回填動作紀錄。':current.type==='rest'?'恢復日，不需打卡或補做。':'今天沒有訓練安排，按需要調整即可。'));
    else for(const action of menu){const row=node('div','training-action');const label=node('label','');const cb=node('input','');cb.type='checkbox';cb.checked=!!current.actions[action.id];cb.disabled=!canCheck;cb.dataset.exerciseAction=action.id;cb.onchange=()=>perform(()=>store.toggleAction(selectedDay,action.id,cb.checked));const copy=node('span','');copy.append(node('strong','',action.name),node('small','',action.en));label.append(cb,copy);row.append(label,node('p','training-dose',(action.group?action.group+' · ':'')+doseText(action)),node('p','',action.instruction),node('p','workspace-note',action.caution));actions.append(row);}
    if(focused)actions.querySelector('[data-exercise-action="'+CSS.escape(focused)+'"]')?.focus({preventScroll:true});
    const controls=workout.querySelector('#training-controls');controls.replaceChildren();
    const finish=button('完成今日訓練',()=>perform(()=>store.finish(selectedDay)),'workspace-button primary');finish.id='finish-training';finish.disabled=!canCheck||!menu.length||menu.some(action=>!current.actions[action.id]);if(canCheck&&untouchedExercise(current)){const start=button('開始本次訓練',()=>perform(()=>store.startExercise(selectedDay)));controls.append(start);}
    controls.append(finish,button('設為恢復日',()=>openSchedule('rest')));
  }
  // Old sport/rest checkboxes now call the same model; hide the punitive streak display.
  const streak=document.getElementById('streak-days')?.parentElement;
  if(streak){streak.id='legacy-streak-display';streak.hidden=true;}
  return {render};
}
