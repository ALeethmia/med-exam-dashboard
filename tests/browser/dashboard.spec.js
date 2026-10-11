import {test,expect} from '@playwright/test';
async function navigate(page,tab) {
  const group=['physiology','anatomy','biochem','pharmacology'].includes(tab)?'subjects':['schedule','exercise','focus'].includes(tab)?'calendar':tab;
  const primary=page.locator('#tab-btn-'+group);
  if(!await primary.isVisible()) await page.locator('#mobile-menu').click();
  await primary.click();
  if(group!==tab) await page.locator('#tab-btn-'+tab).click();
}


test.beforeEach(async({page})=>{
  // No external scripts or production database requests are permitted in this suite.
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1' ? route.continue() : route.abort());
});
test('homepage tasks award XP once and retain original learning IDs on reload',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.locator('#task-list input')).toHaveCount(3);
  const id=await page.locator('#task-list input').first().getAttribute('data-task');
  await page.locator('#task-list input').first().check();await expect(page.locator('#xp-detail')).toContainText('20 XP');
  expect(await page.evaluate(()=>document.activeElement?.dataset.task)).toBe(id);
  await page.locator('#task-list input').first().uncheck();await page.locator('#task-list input').first().check();
  await expect(page.locator('#xp-detail')).toContainText('20 XP');
  await page.reload();await expect(page.locator('#xp-detail')).toContainText('20 XP');
  expect(await page.evaluate(id=>{const [path,key]=id.split('__');return window.readStudyStates()[path][key];},id)).toBe(true);
  expect(errors).toEqual([]);expect(await page.evaluate(()=>window.learningDB)).toBe(null);
});

test('Quest OS shell uses six destinations, equal columns and exact theme tokens',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');
  await expect(page.locator('#main-tabs-header-container button')).toHaveCount(6);
  await expect(page.locator('#tab-content-home #achievements')).toHaveCount(0);
  await expect(page.locator('#tab-content-home .focus-tool')).toHaveCount(0);
  const columns=await page.locator('.workspace-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').map(Number.parseFloat));
  expect(Math.abs(columns[0]-columns[1])).toBeLessThan(1);
  for(const [theme,expected] of [['light',['#F5F5F7','#FFFFFF','#1D1D1F','#86868B','#3478F6']],['dark',['#16171A','#222327','#F5F5F7','#989AA2','#6AA5FF']]]) {
    await page.locator('[data-appearance='+theme+']').click();
    const colors=await page.evaluate(()=>['--canvas','--surface','--ink','--muted','--accent'].map(name=>getComputedStyle(document.documentElement).getPropertyValue(name).trim()));
    expect(colors).toEqual(expected);
  }
  await navigate(page,'anatomy');await expect(page.locator('#page-title')).toHaveText('趙俊彥解剖學');
  await expect(page.locator('#workspace-crumb')).toHaveText('科目 / 解剖學');
});

test('homepage week progress and calendar summary read existing learning records',async({page})=>{
  await page.clock.install({time:new Date('2026-10-11T04:00:00Z')});
  await page.goto('/');await expect(page.locator('#current-week')).toHaveText('第 2 週');
  await expect(page.locator('#current-week-percent')).toHaveText('0%');
  await page.locator('#task-list input').first().check();
  await expect(page.locator('#current-week-percent')).toHaveText('6%');
  await navigate(page,'calendar');await page.evaluate(()=>openEventModal('2026-10-12'));
  await page.locator('#modal-event-input').fill('複習腎臟生理');await page.getByRole('button',{name:'新增標註'}).click();
  await page.evaluate(()=>closeEventModal());await navigate(page,'home');
  await expect(page.locator('#upcoming-list')).toContainText('複習腎臟生理');
  await expect(page.locator('#upcoming-list .upcoming-row').first()).toContainText('10/12');
});
test('all subjects keep search, filters, item checks and batch operations',async({page})=>{
  await page.goto('/');await expect(page.locator('#task-list input')).toHaveCount(3);
  await navigate(page,'anatomy');await expect(page.locator('.anatomy-lec-card')).toHaveCount(30);
  await page.locator('#video-search-input').fill('頭顱');expect(await page.locator('.anatomy-lec-card').count()).toBeGreaterThan(0);
  await page.locator('#video-search-input').fill('no-match-123');await expect(page.locator('.anatomy-lec-card')).toHaveCount(0);
  await page.locator('#video-search-input').fill('');await page.locator('.anatomy-lec-card input').first().check();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('med_exam_videos_cloud'))['1'])).toBe(true);
  await page.locator('.course-batch button:visible').filter({hasText:/^全選$/}).first().click();expect(await page.evaluate(()=>Object.values(window.readStudyStates().videos).filter(Boolean).length)).toBe(2);
  await navigate(page,'biochem');await expect(page.locator('#biochem-units-container > details')).toHaveCount(8);
  await page.locator('#biochem-search-input').fill('no-match-123');await expect(page.locator('#biochem-units-container input')).toHaveCount(0);
  await page.locator('#biochem-search-input').fill('');await page.locator('#biochem-units-container input').first().check();
  expect(await page.evaluate(()=>window.readStudyStates().biochem['1'])).toBe(true);
  await navigate(page,'physiology');await expect(page.locator('#physio-chapters-container input')).toHaveCount(39);
  await page.locator('#physio-search-input').fill('no-match-123');await expect(page.locator('#physio-chapters-container input')).toHaveCount(0);
  await page.locator('#physio-search-input').fill('');await page.locator('#physio-chapters-container input').first().check();
  await navigate(page,'pharmacology');await expect(page.locator('.pharm-lec-card')).toHaveCount(38);
  await page.locator('#pharm-search-input').fill('no-match-123');await expect(page.locator('.pharm-lec-card')).toHaveCount(0);
  await page.locator('#pharm-search-input').fill('');await page.locator('.pharm-lec-card input').first().check();
  await page.locator('.course-batch button:visible').filter({hasText:/^全選$/}).first().click();expect(await page.evaluate(()=>Object.values(window.readStudyStates().pharmacology).filter(Boolean).length)).toBe(2);
});
test('appearance remembers preference and follows system changes',async({page})=>{
  await page.emulateMedia({colorScheme:'dark'});await page.goto('/');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.locator('[data-appearance=light]').click();await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.locator('[data-appearance=system]').click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveAttribute('data-theme','light');
});
test('separate pages retain calendar, routines, exercise and focus timer',async({page})=>{
  await page.goto('/');await expect(page.locator('#task-list input')).toHaveCount(3);
  await expect(page.locator('#calendar-grid')).not.toBeVisible();
  await navigate(page,'calendar');await expect(page.locator('#calendar-grid')).toBeVisible();
  await page.evaluate(()=>openEventModal('2026-10-11'));
  await page.locator('#modal-event-input').fill('<img src=x onerror="window.injected=true">');
  await page.getByRole('button',{name:'新增標註'}).click();await expect(page.locator('#modal-events-list')).toContainText('<img');
  expect(await page.evaluate(()=>window.injected)).toBeUndefined();await page.evaluate(()=>closeEventModal());
  await navigate(page,'schedule');await expect(page.locator('#daily-sport')).toBeVisible();await page.locator('#daily-sport').check();
  await navigate(page,'exercise');await expect(page.locator('#sport-phase-1')).toBeVisible();
  await navigate(page,'plan');await expect(page.locator('#checklist-container input')).toHaveCount(16);await page.locator('#w-1').check();
  await navigate(page,'stats');await expect(page.locator('#progress-trend-card')).toBeVisible();
  await expect(page.locator('.recharts-wrapper')).toBeVisible();
  await navigate(page,'focus');await page.locator('#pomo-toggle-btn').click();await expect(page.locator('#pomo-toggle-text')).toContainText('暫停');
});
test('mobile navigation has no document overflow in either appearance',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.locator('#task-list input')).toHaveCount(3);
  for(const theme of ['light','dark']) {
    await page.locator('[data-appearance='+theme+']').click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await navigate(page,'pharmacology');await expect(page.locator('.pharm-lec-card').first()).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await navigate(page,'home');
  }
});

test('midnight in Taipei refreshes daily tasks and habit date bindings',async({page})=>{
  await page.clock.install({time:new Date('2026-10-11T15:59:50Z')});
  await page.goto('/');await expect(page.locator('#today-label')).toContainText('2026年10月11日');
  await page.locator('#task-list input').first().check();
  await page.clock.fastForward(31000);
  await expect(page.locator('#today-label')).toContainText('2026年10月12日');
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
  await navigate(page,'anatomy');await page.locator('.anatomy-lec-card input').nth(1).check();
  await expect.poll(()=>page.evaluate(()=>window.mockDatabase.records.videos['2'])).toBe(true);
  const result=await page.evaluate(()=>window.mockDatabase);
  expect(result.records.videos['1']).toBe(true);expect(result.records.videos.unrelated).toBe(true);expect(result.records.biochem['8']).toBe(true);
  expect(result.records.legacy).toEqual({keep:'unchanged'});
  expect(Object.keys(result.records.gamification.v1.awards)).toHaveLength(1);
  expect(result.writes.filter(w=>w.kind==='transaction').every(w=>w.path.startsWith('gamification/v1/'))).toBe(true);
  expect(result.writes.filter(w=>w.kind==='update').every(w=>Object.keys(w.patch).every(key=>key.includes('/')))).toBe(true);
});

test('subject groups preserve expansion, focus and learning records through rerenders',async({page})=>{
  await page.clock.install({time:new Date('2026-10-11T04:00:00Z')});await page.goto('/');await navigate(page,'physiology');
  await expect(page.locator('#physio-chapters-container > details')).toHaveCount(7);
  const closed=page.locator('[data-group="physiology__甲"]');
  await closed.locator(':scope > summary').click();await expect(closed).not.toHaveAttribute('open','');
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('med_exam_subject_expansion_v1'))['physiology__甲'])).toBe(false);
  const weekTwo=page.locator('[data-group="physiology__戊"]');await expect(weekTwo).toHaveAttribute('open','');
  const checkbox=weekTwo.locator('input').first();const id=await checkbox.getAttribute('id');
  await checkbox.check();await expect(checkbox).toBeFocused();
  const meter=await page.locator('#physio-progress-bar').boundingBox();expect(meter.height).toBe(6);expect(meter.width).toBeGreaterThan(0);
  await expect(closed).not.toHaveAttribute('open','');
  const note=weekTwo.locator('.course-item-notes').first();await note.locator('summary').click();
  await expect(note).toHaveAttribute('open','');await expect(checkbox).toBeChecked();
  await checkbox.uncheck();await expect(note).toHaveAttribute('open','');
  await page.reload();await expect(closed).not.toHaveAttribute('open','');await expect(note).toHaveAttribute('open','');
  expect(await page.evaluate(id=>window.readStudyStates().physiology[id],id)).toBe(false);
  await page.locator('#physio-search-input').fill('Nernst');
  expect(await page.locator('#physio-chapters-container > details').count()).toBeGreaterThan(0);
  expect(await page.locator('#physio-chapters-container > details:not([open])').count()).toBe(0);
  await page.locator('#physio-search-input').fill('');await expect(closed).not.toHaveAttribute('open','');
  await page.locator('#physio-filter-chips [data-filter=W1]').click();
  await expect(page.locator('#physio-chapters-container > details')).toHaveCount(4);
});

test('today task view clears stale filters and focuses the exact course without completing it',async({page})=>{
  await page.clock.install({time:new Date('2026-10-11T04:00:00Z')});await page.goto('/');
  const key=await page.locator('#task-list input').first().getAttribute('data-task');
  await navigate(page,'physiology');await page.locator('#physio-filter-chips [data-filter=W1]').click();
  await page.locator('#physio-search-input').fill('no-match');await navigate(page,'home');
  await page.locator('#task-list .task-open').first().click();
  const row=page.locator('[data-study-key="'+key+'"]');await expect(row).toBeVisible();
  await expect(row.locator('input')).toBeFocused();await expect(row.locator('input')).not.toBeChecked();
  await expect(page.locator('#physio-search-input')).toHaveValue('');
  await expect(page.locator('#xp-detail')).toContainText('0 XP');
});

test('four subject pages share readable mobile lists in both appearances',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  for(const theme of ['light','dark']) {
    await page.locator('[data-appearance='+theme+']').click();
    for(const tab of ['physiology','anatomy','biochem','pharmacology']) {
      await navigate(page,tab);const course=page.locator('#tab-content-'+tab);
      await expect(course.locator('.course-overview')).toBeVisible();
      await expect(course.locator('.course-group').first()).toBeVisible();
      expect(await course.locator('.course-row .title-text').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
  }
});
