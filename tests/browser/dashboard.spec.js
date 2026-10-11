import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
  // No external scripts or production database requests are permitted in this suite.
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1' ? route.continue() : route.abort());
});
test('homepage tasks award XP once and retain original learning IDs on reload',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.locator('#task-list input')).toHaveCount(3);
  const id=await page.locator('#task-list input').first().getAttribute('data-task');
  await page.locator('#task-list input').first().check();await expect(page.locator('#xp-detail')).toContainText('20 XP');
  await page.locator('#task-list input').first().uncheck();await page.locator('#task-list input').first().check();
  await expect(page.locator('#xp-detail')).toContainText('20 XP');
  await page.reload();await expect(page.locator('#xp-detail')).toContainText('20 XP');
  expect(await page.evaluate(id=>{const [path,key]=id.split('__');return window.readStudyStates()[path][key];},id)).toBe(true);
  expect(errors).toEqual([]);expect(await page.evaluate(()=>window.learningDB)).toBe(null);
});
test('all subjects keep search, filters, item checks and batch operations',async({page})=>{
  await page.goto('/');await expect(page.locator('#task-list input')).toHaveCount(3);
  await page.locator('#tab-btn-anatomy').click();await expect(page.locator('.anatomy-lec-card')).toHaveCount(30);
  await page.locator('#video-search-input').fill('頭顱');expect(await page.locator('.anatomy-lec-card').count()).toBeGreaterThan(0);
  await page.locator('#video-search-input').fill('no-match-123');await expect(page.locator('.anatomy-lec-card')).toHaveCount(0);
  await page.locator('#video-search-input').fill('');await page.locator('.anatomy-lec-card input').first().check();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('med_exam_videos_cloud'))['1'])).toBe(true);
  await page.getByRole('button',{name:'全選',exact:true}).first().click();expect(await page.evaluate(()=>Object.values(window.readStudyStates().videos).filter(Boolean).length)).toBe(2);
  await page.locator('#tab-btn-biochem').click();await expect(page.locator('#biochem-units-container > div')).toHaveCount(8);
  await page.locator('#biochem-search-input').fill('no-match-123');await expect(page.locator('#biochem-units-container input')).toHaveCount(0);
  await page.locator('#biochem-search-input').fill('');await page.locator('#biochem-units-container input').first().check();
  expect(await page.evaluate(()=>window.readStudyStates().biochem['1'])).toBe(true);
  await page.locator('#tab-btn-physiology').click();await expect(page.locator('#physio-chapters-container input')).toHaveCount(39);
  await page.locator('#physio-search-input').fill('no-match-123');await expect(page.locator('#physio-chapters-container input')).toHaveCount(0);
  await page.locator('#physio-search-input').fill('');await page.locator('#physio-chapters-container input').first().check();
  await page.locator('#tab-btn-pharmacology').click();await expect(page.locator('.pharm-lec-card')).toHaveCount(38);
  await page.locator('#pharm-search-input').fill('no-match-123');await expect(page.locator('.pharm-lec-card')).toHaveCount(0);
  await page.locator('#pharm-search-input').fill('');await page.locator('.pharm-lec-card input').first().check();
  await page.getByRole('button',{name:'全選',exact:true}).first().click();expect(await page.evaluate(()=>Object.values(window.readStudyStates().pharmacology).filter(Boolean).length)).toBe(2);
});
test('appearance remembers preference and follows system changes',async({page})=>{
  await page.emulateMedia({colorScheme:'dark'});await page.goto('/');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.locator('#appearance').selectOption('light');await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.locator('#appearance').selectOption('system');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveAttribute('data-theme','light');
});
test('separate pages retain calendar, routines, exercise and focus timer',async({page})=>{
  await page.goto('/');await expect(page.locator('#task-list input')).toHaveCount(3);
  await expect(page.locator('#calendar-grid')).not.toBeVisible();
  await page.locator('#tab-btn-calendar').click();await expect(page.locator('#calendar-grid')).toBeVisible();
  await page.evaluate(()=>openEventModal('2026-10-11'));
  await page.locator('#modal-event-input').fill('<img src=x onerror="window.injected=true">');
  await page.getByRole('button',{name:'新增標註'}).click();await expect(page.locator('#modal-events-list')).toContainText('<img');
  expect(await page.evaluate(()=>window.injected)).toBeUndefined();await page.evaluate(()=>closeEventModal());
  await page.locator('#tab-btn-schedule').click();await expect(page.locator('#daily-sport')).toBeVisible();await page.locator('#daily-sport').check();
  await page.locator('#tab-btn-exercise').click();await expect(page.locator('#sport-phase-1')).toBeVisible();
  await page.locator('#tab-btn-plan').click();await expect(page.locator('#checklist-container input')).toHaveCount(16);await page.locator('#w-1').check();
  await page.locator('#tab-btn-stats').click();await expect(page.locator('#progress-trend-card')).toBeVisible();
  await expect(page.locator('.recharts-wrapper')).toBeVisible();
  await page.locator('#tab-btn-home').click();await page.locator('.focus-tool summary').click();await page.locator('#pomo-toggle-btn').click();await expect(page.locator('#pomo-toggle-text')).toContainText('暫停');
});
test('mobile navigation has no document overflow in either appearance',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.locator('#task-list input')).toHaveCount(3);
  for(const theme of ['light','dark']) {
    await page.locator('#appearance').selectOption(theme);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.locator('#tab-btn-pharmacology').click();await expect(page.locator('.pharm-lec-card').first()).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.locator('#tab-btn-home').click();
  }
});

test('midnight in Taipei refreshes daily tasks and habit date bindings',async({page})=>{
  await page.clock.install({time:new Date('2026-10-11T15:59:50Z')});
  await page.goto('/');await expect(page.locator('#today-label')).toContainText('2026 / 10 / 11');
  await page.locator('#task-list input').first().check();
  await page.clock.fastForward(31000);
  await expect(page.locator('#today-label')).toContainText('2026 / 10 / 12');
  await expect(page.locator('#xp-detail')).toContainText('20 XP');
});

test('mock Firebase keeps unrelated records and confines XP to its namespace',async({page})=>{
  await page.addInitScript(()=>{
    Object.defineProperty(window,'workspaceLocalOnly',{get:()=>false,set:()=>{}});
    const records={videos:{1:true,unrelated:true}, biochem:{8:true}, '.info':{connected:true}, legacy:{keep:'unchanged'}};
    const callbacks=new Map(), writes=[];
    const get=path=>path ? path.split('/').reduce((v,key)=>v?.[key],records) ?? null : records;
    const put=(path,value)=>{
      const keys=path.split('/');const last=keys.pop();let target=records;
      for(const key of keys) target=target[key] ||= {};
      if(value===null) delete target[last];else target[last]=value;
    };
    const notify=()=>{for(const [path,callback] of callbacks) setTimeout(()=>callback({val:()=>structuredClone(get(path))}),0);};
    const db={ref:(path='')=>({
      on:(event,callback)=>{callbacks.set(path,callback);setTimeout(()=>callback({val:()=>structuredClone(get(path))}),0);},
      update:async patch=>{writes.push({kind:'update',path,patch});for(const [key,value] of Object.entries(patch))put(path?path+'/'+key:key,value);notify();},
      transaction:async updater=>{const value=updater(structuredClone(get(path)));writes.push({kind:'transaction',path});if(value!==undefined)put(path,value);notify();return {snapshot:{val:()=>structuredClone(get(path))}};}
    })};
    window.firebase={initializeApp(){},database:()=>db};
    window.mockDatabase={records,writes};
  });
  await page.goto('/');await expect(page.locator('#task-list input')).toHaveCount(3);
  await page.locator('#task-list input').first().check();await expect(page.locator('#xp-detail')).toContainText('20 XP');
  await expect.poll(()=>page.evaluate(()=>Object.keys(window.mockDatabase.records.gamification?.v1?.awards || {}).length)).toBe(1);
  await page.locator('#task-list input').first().uncheck();await page.locator('#task-list input').first().check();
  await page.locator('#tab-btn-anatomy').click();await page.locator('.anatomy-lec-card input').nth(1).check();
  await expect.poll(()=>page.evaluate(()=>window.mockDatabase.records.videos['2'])).toBe(true);
  const result=await page.evaluate(()=>window.mockDatabase);
  expect(result.records.videos['1']).toBe(true);expect(result.records.videos.unrelated).toBe(true);expect(result.records.biochem['8']).toBe(true);
  expect(result.records.legacy).toEqual({keep:'unchanged'});
  expect(Object.keys(result.records.gamification.v1.awards)).toHaveLength(1);
  expect(result.writes.filter(w=>w.kind==='transaction').every(w=>w.path.startsWith('gamification/v1/'))).toBe(true);
  expect(result.writes.filter(w=>w.kind==='update').every(w=>Object.keys(w.patch).every(key=>key.includes('/')))).toBe(true);
});
