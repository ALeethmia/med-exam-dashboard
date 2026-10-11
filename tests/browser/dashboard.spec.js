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
test('time goals award XP once per day and never change course completion',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.locator('#task-list input')).toHaveCount(3);
  const id=await page.locator('#task-list input').first().getAttribute('data-task');
  await page.locator('#task-list input').first().check();await expect(page.locator('#xp-detail')).toContainText('20 XP');
  expect(await page.evaluate(()=>document.activeElement?.dataset.task)).toBe(id);
  await page.locator('#task-list input').first().uncheck();await page.locator('#task-list input').first().check();
  await expect(page.locator('#xp-detail')).toContainText('20 XP');
  await page.reload();await expect(page.locator('#xp-detail')).toContainText('20 XP');
  expect(await page.evaluate(()=>window.readStudyStates().physiology)).toEqual({});
  await expect(page.locator('#task-count')).toHaveText('2 / 5 小時');
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
  await expect(page.locator('#current-week-percent')).toHaveText('0%');
  await page.evaluate(()=>window.setStudyCompletion('physiology','fc_p_5_a',true));
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
    window.firebase={apps:[],initializeApp(){this.apps.push({});},auth:()=>({onAuthStateChanged:callback=>setTimeout(()=>callback({uid:'test-owner',email:'owner@example.test'}),0)}),database:()=>db};
    window.mockDatabase={records,writes};
  });
  await page.goto('/');await expect(page.locator('#task-list input')).toHaveCount(3);
  await page.locator('#task-list input').first().check();await expect(page.locator('#xp-detail')).toContainText('20 XP');
  await expect.poll(()=>page.evaluate(()=>Object.values(window.mockDatabase.records.gamification?.v2?.timeTasks || {}).flatMap(day=>Object.values(day)).filter(t=>t.awarded).length)).toBe(1);
  await page.locator('#task-list input').first().uncheck();await page.locator('#task-list input').first().check();
  await navigate(page,'anatomy');await page.locator('.anatomy-lec-card input').nth(1).check();
  await expect.poll(()=>page.evaluate(()=>window.mockDatabase.records.videos['2'])).toBe(true);
  const result=await page.evaluate(()=>window.mockDatabase);
  expect(result.records.videos['1']).toBe(true);expect(result.records.videos.unrelated).toBe(true);expect(result.records.biochem['8']).toBe(true);
  expect(result.records.legacy).toEqual({keep:'unchanged'});
  expect(Object.values(result.records.gamification.v2.timeTasks).flatMap(day=>Object.values(day)).filter(t=>t.awarded)).toHaveLength(1);
  expect(result.writes.filter(w=>w.kind==='transaction').every(w=>w.path.startsWith('gamification/v1/')||w.path.startsWith('gamification/v2/timeTasks/'))).toBe(true);
  expect(result.writes.filter(w=>w.kind==='update').every(w=>Object.keys(w.patch).every(key=>key.includes('/')))).toBe(true);
});

test('book navigation remembers selected chapters without changing learning records',async({page})=>{
  await page.goto('/');await navigate(page,'physiology');
  await expect(page.locator('#physio-chapters-container > details')).toHaveCount(7);
  const book=page.locator('#physio-chapters-container-index');
  await expect(book.locator('button')).toHaveCount(7);
  await book.locator('[data-chapter="戊"]').click();
  const chapter=page.locator('[data-group="physiology__戊"]');
  await expect(chapter).toBeVisible();await expect(page.locator('[data-group="physiology__甲"]')).not.toBeVisible();
  const checkbox=chapter.locator('input').first();const id=await checkbox.getAttribute('id');
  await checkbox.check();await expect(checkbox).toBeFocused();
  const meter=await page.locator('#physio-progress-bar').boundingBox();expect(meter.height).toBe(4);expect(meter.width).toBeGreaterThan(0);
  await checkbox.uncheck();
  await page.reload();await expect(chapter).toBeVisible();
  expect(await page.evaluate(id=>window.readStudyStates().physiology[id],id)).toBe(false);
  await page.locator('#physio-search-input').fill('Nernst');
  await expect(page.locator('[data-group="physiology__甲"]')).toBeVisible();
  await page.locator('#physio-search-input').fill('');await expect(chapter).toBeVisible();
  await page.locator('#tab-content-physiology .course-plan-filter > summary').click();
  await page.locator('#physio-filter-chips [data-filter=W1]').click();
  await expect(page.locator('#physio-chapters-container > details')).toHaveCount(4);
});

test('four subject pages share readable mobile lists in both appearances',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  for(const theme of ['light','dark']) {
    await page.locator('[data-appearance='+theme+']').click();
    for(const tab of ['physiology','anatomy','biochem','pharmacology']) {
      await navigate(page,tab);const course=page.locator('#tab-content-'+tab);
      await expect(course.locator('.course-overview')).toBeVisible();
      await expect(course.locator('.course-group').first()).toBeVisible();
      expect(await course.locator('.course-row:visible .title-text').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
  }
});

test('FC table of contents follows the photographed book and separates study week controls',async({page})=>{
  await page.goto('/');await navigate(page,'physiology');
  const actual=await page.evaluate(()=>window.studyData.physio.map(c=>({title:c.title,sections:c.sections.map(s=>[s.code,s.title,s.page,s.id])})));
  expect(actual.map(c=>c.title)).toEqual(['甲、細胞生理','乙、神經生理','丙、心血管生理','丁、呼吸生理','戊、腎臟生理','己、腸胃生理','庚、內分泌生理']);
  expect(actual.map(c=>c.sections.map(s=>s[2]))).toEqual([[3,4,9,12,20,32],[41,45,67,95],[128,141,152,166,172,172],[178,193,199,208,208,210],[216,228,240,248,256],[261,267,274,292],[300,311,323,331,337,346,359,367]]);
  expect(actual.map(c=>c.sections.map(s=>s[0]).join(''))).toEqual(['ABCDEF','ABCD','ABCDEF','ABCDEF','ABCDE','ABCD','ABCDEFGH']);
  await expect(page.locator('#physio-filter-chips [data-filter="甲"]')).toHaveCount(0);
  await expect(page.locator('#physio-filter-chips')).not.toBeVisible();
  await expect(page.locator('[data-group="physiology__甲"] .course-group-heading')).not.toContainText('週');
  const book=page.locator('#physio-chapters-container-index');
  expect(await book.locator('button .course-index-title').allTextContents()).toEqual(actual.map(c=>c.title));
  for(const c of actual){
    await book.locator('[data-chapter="'+c.title[0]+'"]').click();
    const group=page.locator('[data-group="physiology__'+c.title[0]+'"]');
    await expect(group).toBeVisible();
    expect(await group.locator('.title-text').allTextContents()).toEqual(c.sections.map(s=>s[0]+'. '+s[1]));
  }
});

test('mobile chapter picker restores the book position and leaves completion records untouched',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await navigate(page,'physiology');
  const select=page.locator('#physio-chapters-container-index select');
  await expect(select).toBeVisible();await select.selectOption('庚');
  await expect(page.locator('[data-group="physiology__庚"]')).toBeVisible();
  await expect(page.locator('[data-group="physiology__甲"]')).not.toBeVisible();
  await expect(page.locator('[data-group="physiology__庚"] input')).toHaveCount(8);
  expect(await page.evaluate(()=>window.readStudyStates().physiology)).toEqual({});
  await page.reload();await expect(select).toHaveValue('庚');
  await expect(page.locator('[data-group="physiology__庚"]')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('calendar stays compact and routines read like a timetable on desktop and mobile',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');await navigate(page,'calendar');
  const month=await page.locator('.calendar-card').boundingBox(),dates=await page.locator('.calendar-dates-card').boundingBox();
  expect(month.width).toBeLessThanOrEqual(640);expect(Math.abs(month.y-dates.y)).toBeLessThan(1);expect(dates.x).toBeGreaterThan(month.x+month.width);
  await page.locator('#calendar-grid button').first().focus();await page.keyboard.press('Enter');
  await expect(page.locator('#event-modal')).toBeVisible();await page.evaluate(()=>closeEventModal());
  await navigate(page,'schedule');await page.locator('#sched-btn-weekday').click();
  expect(await page.locator('#sched-content-weekday .schedule-activity').allTextContents()).toEqual(['運動','早餐・淋浴','主科讀書','午餐・午休','題目練習','錯題訂正','晚餐・休息','副科讀書','自由時間']);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await navigate(page,'calendar');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const mobileMonth=await page.locator('.calendar-card').boundingBox(),mobileDates=await page.locator('.calendar-dates-card').boundingBox();expect(mobileDates.y).toBeGreaterThan(mobileMonth.y+mobileMonth.height);
});

test('Google login gates database access and exposes UID without clearing progress', async ({page}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'workspaceLocalOnly', {get: () => false, set() {}});
    if (!sessionStorage.getItem('auth-test-seeded')) {
      localStorage.setItem('med_exam_videos_cloud', '{"1":true}');
      sessionStorage.setItem('auth-test-seeded', 'yes');
    }
    const state = window.authTest = {reads: 0, signIns: 0};
    let notify;
    const auth = {
      onAuthStateChanged(callback) { notify = callback; setTimeout(() => callback(null), 0); },
      async signInWithPopup() {
        state.signIns++;
        if (state.signIns === 1) throw {code: 'auth/unauthorized-domain'};
        notify({uid: 'owner-uid', email: 'owner@example.test'});
      },
      async signOut() { notify(null); }
    };
    const authFactory = () => auth;
    authFactory.GoogleAuthProvider = class {};
    window.firebase = {apps: [], initializeApp() {this.apps.push({});}, auth: authFactory,
      database() { state.reads++; return {ref: (path) => ({
        on(event, callback) { setTimeout(() => callback({val: () => path === '.info/connected' ? false : path === 'videos' ? {1: true} : null}), 0); }
      })}; }
    };
  });
  await page.goto('/');
  await expect(page.locator('#google-sign-in')).toBeEnabled();
  expect(await page.evaluate(() => window.authTest.reads)).toBe(0);
  expect(await page.evaluate(() => window.studyData)).toBeUndefined();
  await page.locator('#google-sign-in').click();
  await expect(page.locator('#auth-status')).toContainText('此網址尚未授權');
  expect(await page.evaluate(() => window.authTest.reads)).toBe(0);
  await page.locator('#google-sign-in').click();
  await expect(page.locator('#task-list input')).toHaveCount(3);
  expect(await page.evaluate(() => window.authTest.reads)).toBe(1);
  await page.locator('#account-button').click();
  await expect(page.locator('#account-uid')).toHaveValue('owner-uid');
  await expect(page.locator('#account-email')).toHaveText('owner@example.test');
  expect(await page.evaluate(() => localStorage.getItem('med_exam_videos_cloud'))).toBe('{"1":true}');
  await page.locator('#sign-out').click();
  await expect(page.locator('#google-sign-in')).toBeEnabled();
  expect(await page.evaluate(() => window.authTest.reads)).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('med_exam_videos_cloud'))).toBe('{"1":true}');
});

test('missing authentication SDK blocks cloud database initialization', async ({page}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'workspaceLocalOnly', {get: () => false, set() {}});
    window.firebase = {database() { throw new Error('Database must not start'); }};
  });
  await page.goto('/');
  await expect(page.locator('#auth-status')).toContainText('登入服務未載入');
  await expect(page.locator('#google-sign-in')).toBeDisabled();
  expect(await page.evaluate(() => window.studyData)).toBeUndefined();
});
