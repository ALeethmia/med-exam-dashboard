import {test,expect} from '@playwright/test';
async function go(page,tab) {
 const group=['exercise','schedule'].includes(tab)?'calendar':tab;
 if(!await page.locator('#tab-btn-'+group).isVisible())await page.locator('#mobile-menu').click();
 await page.locator('#tab-btn-'+group).click();if(group!==tab)await page.locator('#tab-btn-'+tab).click();
}
async function arrange(page,type='seated',day) {
 await page.getByRole('button',{name:'修改日期／類型'}).click();
 await page.locator('#exercise-schedule-type').selectOption(type);
 if(day)await page.locator('#exercise-schedule-date').fill(day);
 await page.getByRole('button',{name:'儲存訓練安排'}).click();
}
async function completeMenu(page) {
 const moves=page.locator('#training-actions input');
 for(let i=0;i<await moves.count();i++)await moves.nth(i).check();
 await page.locator('#finish-training').click();
}
test.beforeEach(async({page})=>{
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.clock.install({time:new Date('2026-10-12T04:00:00Z')});
});
test('daily goals read the actual Planner date; leisure and time goals leave XP and courses alone',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await expect(page.locator('#life-study')).toContainText('0 / 0 任務');
 await page.getByRole('button',{name:'規劃今日任務',exact:true}).click();await page.locator('#task-custom').fill('閱讀生理');await page.locator('#task-minutes').fill('60');await page.locator('#planner-form button[type=submit]').click();
 await expect(page.locator('#life-study')).toContainText('0 / 1 任務 · 0%');await page.locator('#task-list input').first().check();await expect(page.locator('#life-study')).toContainText('1 / 1 任務 · 100%');
 await page.locator('#planner-date').fill('2026-10-13');await expect(page.locator('#task-count')).toHaveText('0 / 0 任務');await expect(page.locator('#life-study')).toContainText('1 / 1 任務');
 await page.locator('#life-study button').click();await page.locator('#study-goal-minutes').fill('360');await page.locator('#study-time-form button[type=submit]').click();await expect(page.locator('#life-study')).toContainText('時間目標 360 分鐘');
 await page.getByRole('button',{name:'安排休閒'}).click();await page.locator('#leisure-title').fill('玩電腦遊戲');await page.locator('#leisure-minutes').fill('30');await page.locator('#leisure-form button[type=submit]').click();await page.getByRole('checkbox',{name:'完成今日休閒'}).check();
 await expect(page.locator('#life-leisure')).toContainText('30 分鐘 · 已完成');await expect(page.locator('#xp-detail')).toContainText('20 XP');await expect(page.locator('#overall-percent')).toHaveText('0%');await expect(page.locator('#daily-game')).toBeChecked();
 await page.reload();await expect(page.locator('#life-study')).toContainText('360 分鐘');await expect(page.locator('#life-leisure')).toContainText('玩電腦遊戲');expect(errors).toEqual([]);expect(await page.evaluate(()=>window.learningDB)).toBe(null);
});
test('specific seated menu saves each action and final result, alternative and symptom rest mirror old habits',async({page})=>{
 await page.goto('/');await go(page,'exercise');await arrange(page);
 const menu=page.locator('#training-actions');await expect(menu.locator('input')).toHaveCount(4);
 await expect(menu).toContainText('坐姿踝關節活動');await expect(menu).toContainText('Seated ankle pumps');await expect(menu).toContainText('1 組 × 10 下');await expect(menu).toContainText('每側 8 下');await expect(menu).toContainText('不快速轉頭');
 await expect(page.locator('#finish-training')).toBeDisabled();await menu.locator('input').first().check();await page.reload();await expect(menu.locator('input').first()).toBeChecked();
 await completeMenu(page);await expect(page.locator('#training-description')).toContainText('正常完成');await expect(page.locator('#daily-sport')).toBeChecked();
 await go(page,'schedule');await page.locator('#daily-sport').uncheck();await go(page,'exercise');await expect(page.locator('#training-description')).toContainText('尚未完成');
 await page.getByRole('button',{name:'改用低強度替代'}).click();await completeMenu(page);await expect(page.locator('#training-description')).toContainText('低強度替代完成');await expect(page.locator('#daily-sport')).toBeChecked();
 await page.getByRole('button',{name:'症狀休息',exact:true}).click();await expect(page.locator('#training-description')).toContainText('症狀休息');await expect(page.locator('#training-actions')).toContainText('不需要完成訓練');await expect(page.locator('#daily-sport')).not.toBeChecked();await expect(page.locator('#finish-training')).toBeDisabled();
 await go(page,'home');await expect(page.locator('#life-exercise')).toContainText('症狀休息');await expect(page.locator('#xp-detail')).toContainText('0 XP');await page.reload();await expect(page.locator('#life-exercise')).toContainText('症狀休息');
});
test('stage picker allows immediate jumps and corrections while preserving saved menus',async({page})=>{
 await page.goto('/');await go(page,'exercise');await page.locator('#training-settings').click();await page.getByRole('button',{name:'開始訓練',exact:true}).click();
 await arrange(page,'seated');await page.locator('#training-actions input').first().check();
 await page.locator('#training-settings').click();await page.locator('#training-stage-select').selectOption('4');await page.locator('#training-settings-form button[type=submit]').click();await expect(page.locator('#training-stage')).toHaveText('階段 4 · 維持與鞏固');
 await expect(page.locator('#training-actions')).toContainText('1 組 × 10 下');await expect(page.locator('#training-actions input').first()).toBeChecked();
 await page.locator('#training-date').fill('2026-10-14');await expect(page.locator('#training-actions')).toContainText('2 組 × 12 下');
 await page.locator('#training-settings').click();await page.getByRole('button',{name:'回到階段 1'}).click();await page.locator('#training-settings-form button[type=submit]').click();await expect(page.locator('#training-stage')).toHaveText('階段 1 · 適應與穩定');await expect(page.locator('#training-actions')).toContainText('1 組 × 10 下');
 await page.locator('#training-settings').click();await page.locator('#training-stage-select').selectOption('3');await page.locator('#training-settings-form [data-close]').click();await expect(page.locator('#training-stage')).toHaveText('階段 1 · 適應與穩定');
 await page.clock.setSystemTime(new Date('2026-10-26T04:00:00Z'));await page.reload();await expect(page.locator('#training-stage')).toHaveText('階段 1 · 適應與穩定');
 await page.locator('#training-settings').click();await page.locator('#training-paused').check();await page.locator('#training-stage-select').selectOption('2');await page.locator('#training-settings-form button[type=submit]').click();await expect(page.locator('#training-stage')).toHaveText('階段 2 · 建立規律');await page.locator('#training-date').fill('2026-10-27');await expect(page.locator('#training-description')).toContainText('休息與恢復');await expect(page.locator('#finish-training')).toBeDisabled();
});
test('weekly templates, alternate dates, unscheduled and rest states are quick to change',async({page})=>{
 await page.goto('/');await go(page,'exercise');await page.locator('#training-settings').click();await page.getByRole('button',{name:'開始訓練'}).click();await page.locator('#training-settings').click();await page.locator('#training-weekday-1').selectOption('seated');await page.locator('#training-settings-form button[type=submit]').click();
 await page.locator('#training-week button').nth(1).click();await expect(page.locator('#training-actions input')).toHaveCount(4);await arrange(page,'walk','2026-10-14');await expect(page.locator('#training-date')).toHaveValue('2026-10-14');await page.locator('#training-date').fill('2026-10-13');await expect(page.locator('#training-description')).toContainText('未安排');
 await page.getByRole('button',{name:'設為恢復日'}).click();await expect(page.locator('#training-actions')).toContainText('不需打卡或補做');await expect(page.locator('#daily-sport')).not.toBeChecked();
});
test('legacy exercise and rest remain visible without invented actions or migration writes',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('med_exam_habits_2026-10-12',JSON.stringify({'daily-sport':true,'daily-game':true,'daily-exam':true,keep:'unchanged'}));});
 await page.goto('/');await expect(page.locator('#life-exercise')).toContainText('已完成（舊打卡）');await expect(page.locator('#life-leisure')).toContainText('休息（舊紀錄）');await go(page,'exercise');await expect(page.locator('#training-actions')).toContainText('沒有回填動作紀錄');await expect(page.locator('#training-actions input')).toHaveCount(0);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('med_exam_habits_2026-10-12')).keep)).toBe('unchanged');expect(await page.evaluate(()=>localStorage.getItem('med_exam_life_v1_local'))).toBeNull();
});
test('life goal date bindings follow Taiwan midnight without losing yesterday',async({page})=>{
 await page.clock.setSystemTime(new Date('2026-10-12T15:59:50Z'));await page.goto('/');await page.getByRole('button',{name:'安排休閒'}).click();await page.locator('#leisure-title').fill('閱讀');await page.locator('#leisure-complete').check();await page.locator('#leisure-form button[type=submit]').click();await page.clock.fastForward(31000);
 await expect(page.locator('#today-label')).toContainText('2026年10月13日');await expect(page.locator('#life-leisure')).toContainText('尚未安排');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('med_exam_life_v1_local')).days['2026-10-12'].questOS_v1.leisure.status)).toBe('complete');
});
test('mobile life controls and dialogs fit Light, Dark and System without blocked actions',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 for(const theme of ['light','dark','system']) {
  await page.locator('[data-appearance='+theme+']').click();if(theme==='system')await page.emulateMedia({colorScheme:'dark'});
  await expect(page.locator('html')).toHaveAttribute('data-theme',theme==='system'?'dark':theme);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await go(page,'exercise');await arrange(page);await expect(page.locator('#training-actions input')).toHaveCount(4);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#training-settings').click();const dialog=page.locator('#training-settings-form');await expect(dialog).toBeVisible();expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await dialog.locator('button[type=submit]').click();
  await page.getByRole('button',{name:'症狀休息',exact:true}).click();await expect(page.locator('#training-description')).toContainText('症狀休息');await go(page,'home');
 }
 await page.reload();await expect(page.locator('[data-appearance=system]')).toHaveAttribute('aria-pressed','true');
});

test('mock Firebase persists training offline through reload and reconnect without touching XP or study data',async({page})=>{
 await page.route('**/owner-config.js',route=>route.fulfill({contentType:'application/javascript',body:"export const OWNER_UID='test-owner';"}));
 await page.addInitScript(()=>{
  Object.defineProperty(window,'workspaceLocalOnly',{get:()=>false,set:()=>{}});
  const recordKey='test_life_backend',seed={habits:{'2026-10-12':{'daily-exam':true,keep:'old'},'2026-10-01':{'daily-sport':true,'daily-game':true}},physiology:{fc_p_1_a:true},gamification:{v1:{awards:{physiology__fc_p_1_a:{xp:20,day:'2026-10-01'}}}}};
  const records=JSON.parse(localStorage.getItem(recordKey)||JSON.stringify(seed));let online=localStorage.getItem('test_life_offline')!=='true';const listeners=[],writes=[];
  const save=()=>localStorage.setItem(recordKey,JSON.stringify(records));
  const get=path=>path?path.split('/').reduce((v,k)=>v?.[k],records)??null:records;
  const put=(path,value)=>{const keys=path.split('/'),last=keys.pop();let target=records;for(const key of keys)target=target[key]||={};target[last]=value;save();};
  const snap=path=>({val:()=>path==='.info/connected'?online:structuredClone(get(path))});
  const notify=()=>listeners.filter(l=>l.path!=='.info/connected').forEach(l=>setTimeout(()=>{if(online)l.callback(snap(l.path));},0));
  const db={ref:(path='')=>({
   on(event,callback){listeners.push({path,callback});setTimeout(()=>{if(online||path==='.info/connected')callback(snap(path));},0);},
   async once(){if(!online)throw {code:'NETWORK_ERROR'};return snap(path);},
   async transaction(updater){if(!online)throw {code:'NETWORK_ERROR'};const value=updater(structuredClone(get(path)));if(value!==undefined){put(path,value);writes.push(path);notify();}return {committed:value!==undefined,snapshot:snap(path)};},
   async update(patch){if(!online)throw {code:'NETWORK_ERROR'};for(const [key,value] of Object.entries(patch))put(path?path+'/'+key:key,value);notify();}
  })};
  window.firebase={apps:[],initializeApp(){this.apps.push({});},auth:()=>({onAuthStateChanged:callback=>setTimeout(()=>callback({uid:'test-owner'}),0)}),database:()=>db};
  window.mockLife={records,writes,setOnline(value){online=value;localStorage.setItem('test_life_offline',String(!value));listeners.filter(l=>l.path==='.info/connected').forEach(l=>l.callback(snap(l.path)));if(value){notify();window.dispatchEvent(new Event('online'));}}};
 });
 await page.goto('/');await expect(page.locator('#life-title')).toBeVisible();await expect(page.locator('#xp-detail')).toContainText('20 XP');
 await go(page,'exercise');await page.locator('#training-settings').click();await page.getByRole('button',{name:'開始訓練'}).click();
 await expect.poll(()=>page.evaluate(()=>window.mockLife.records.questOS?.v1?.training?.stage)).toBe(1);
 await page.evaluate(()=>window.mockLife.setOnline(false));await arrange(page);await completeMenu(page);await expect(page.locator('#training-feedback')).toContainText('同步失敗');
 await page.reload();await expect(page.locator('#training-description')).toContainText('正常完成');await expect(page.locator('#daily-sport')).toBeChecked();
 await page.evaluate(()=>window.mockLife.setOnline(true));await expect.poll(()=>page.evaluate(()=>window.mockLife.records.habits['2026-10-12'].questOS_v1?.exercise?.status)).toBe('complete');await expect(page.locator('#life-sync')).toBeEmpty();
 const result=await page.evaluate(()=>window.mockLife.records);expect(result.habits['2026-10-12']['daily-sport']).toBe(true);expect(result.habits['2026-10-12']['daily-exam']).toBe(true);expect(result.habits['2026-10-12'].keep).toBe('old');expect(result.habits['2026-10-01']).toEqual({'daily-sport':true,'daily-game':true});expect(result.physiology).toEqual({fc_p_1_a:true});expect(result.gamification.v1.awards.physiology__fc_p_1_a.xp).toBe(20);await expect(page.locator('#xp-detail')).toContainText('20 XP');
});

test('empty saved menu follows selected phase and all four phase previews show concrete progression',async({page})=>{
 await page.goto('/');await go(page,'exercise');await arrange(page,'seated');
 await page.locator('#training-settings').click();const previews=page.locator('#training-stage-previews');await expect(previews.locator('details')).toHaveCount(4);
 await expect(previews).toContainText('步行 5 分鐘');await expect(previews).toContainText('步行 8 分鐘');await expect(previews).toContainText('步行 10 分鐘');await expect(previews).toContainText('步行 12 分鐘');
 await page.locator('#training-stage-select').selectOption('2');await expect(previews.locator('[data-stage="2"]')).toHaveAttribute('open','');await expect(previews.locator('[data-stage="2"]')).toContainText('坐姿抬膝');await expect(previews.locator('[data-stage="2"]')).toContainText('1 組 × 12 下');
 await page.locator('#training-stage-select').selectOption('4');await expect(previews.locator('[data-stage="4"]')).toContainText('2 組 × 12 下');await page.locator('#training-settings-form button[type=submit]').click();
 await expect(page.locator('#training-description')).toContainText('階段 4 菜單');await expect(page.locator('#training-actions input')).toHaveCount(5);await expect(page.locator('#training-actions')).toContainText('坐姿抬膝');await expect(page.locator('#training-actions')).toContainText('2 組 × 12 下');await expect(page.locator('#training-stage-mismatch')).toBeEmpty();
 await page.reload();await expect(page.locator('#training-description')).toContainText('階段 4 菜單');
});
test('retained phase has a clear explanation and explicit replacement preserves original checks and doses',async({page})=>{
 await page.goto('/');await go(page,'exercise');await arrange(page,'seated');await page.locator('#training-actions input').first().check();
 await page.locator('#training-settings').click();await page.locator('#training-stage-select').selectOption('4');await page.locator('#training-settings-form button[type=submit]').click();
 await expect(page.locator('#training-stage-mismatch')).toContainText('此日期保留階段 1 菜單，目前設定為階段 4');await expect(page.locator('#training-actions input').first()).toBeChecked();
 await page.getByRole('button',{name:'套用目前階段',exact:true}).click();await expect(page.locator('#apply-stage-comparison')).toContainText('原菜單');await expect(page.locator('#apply-stage-comparison')).toContainText('新菜單');await expect(page.locator('#apply-stage-comparison')).toContainText('2 組 × 12 下');
 await page.locator('#apply-stage-form button[type=submit]').click();await expect(page.locator('#apply-stage-error')).toContainText('請確認');await expect(page.locator('#training-actions input').first()).toBeChecked();
 await page.locator('#apply-stage-confirm').check();await page.locator('#apply-stage-form button[type=submit]').click();await expect(page.locator('#training-description')).toContainText('階段 4 菜單');await expect(page.locator('#training-actions input').first()).not.toBeChecked();
 await page.locator('#training-revisions > summary').click();await page.locator('#training-revisions details > summary').click();await expect(page.locator('#training-revisions')).toContainText('階段 1');await expect(page.locator('#training-revisions')).toContainText('✓ 坐姿踝關節活動 · 1 組 × 10 下');await page.reload();await expect(page.locator('#training-revisions')).toBeVisible();
});
test('explicit start without action checks locks the menu; cancelling application keeps all data',async({page})=>{
 await page.goto('/');await go(page,'exercise');await arrange(page);await page.getByRole('button',{name:'開始本次訓練'}).click();await page.locator('#training-settings').click();await page.locator('#training-stage-select').selectOption('3');await page.locator('#training-settings-form button[type=submit]').click();
 await expect(page.locator('#training-description')).toContainText('階段 1 菜單');await page.getByRole('button',{name:'套用目前階段',exact:true}).click();await page.locator('#apply-stage-form [data-close]').click();await expect(page.locator('#training-description')).toContainText('階段 1 菜單');await expect(page.locator('#training-actions input')).toHaveCount(4);
});
test('mobile phase preview and replacement confirmation fit without overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');await go(page,'exercise');await arrange(page);await page.locator('#training-actions input').first().check();await page.locator('#training-settings').click();await page.locator('#training-stage-select').selectOption('4');
 const settings=page.locator('#training-settings-form');expect(await settings.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await settings.locator('button[type=submit]').click();await page.getByRole('button',{name:'套用目前階段',exact:true}).click();const dialog=page.locator('#apply-stage-form');expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await page.locator('#apply-stage-confirm').check();await dialog.locator('button[type=submit]').click();await expect(page.locator('#training-description')).toContainText('階段 4 菜單');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
