import {test,expect} from '@playwright/test';
async function go(page){await page.waitForFunction(()=>typeof window.updateWorkspace==='function');await page.evaluate(()=>window.switchTab('kingdom'));}
async function seed(page){await page.addInitScript(()=>{if(localStorage.getItem('realmSeeded'))return;localStorage.setItem('realmSeeded','yes');const ids=['fc_p_1_a','fc_p_1_b','fc_p_1_c','fc_p_1_d','fc_p_1_e','fc_p_1_f'];localStorage.setItem('med_exam_physio_cloud',JSON.stringify(Object.fromEntries(ids.map(id=>[id,true]))));localStorage.setItem('med_exam_course_dates_v1_local',JSON.stringify({records:{physiology__fc_p_1_a:{day:'2026-10-10',_version:'a'},physiology__fc_p_1_b:{day:null,_version:'b'}},pending:{}}));localStorage.setItem('med_exam_habits_2026-10-09',JSON.stringify({'daily-sport':true}));localStorage.setItem('med_exam_life_v1_local',JSON.stringify({days:{'2026-10-10':{questOS_v1:{exercise:{type:'strength_a',status:'complete'}}},'2026-10-11':{questOS_v1:{exercise:{type:'seated',status:'alternative'},leisure:{title:'放鬆閱讀',status:'complete'}}},'2026-10-12':{questOS_v1:{exercise:{type:'walk',status:'symptom_rest'}}},'2026-10-13':{questOS_v1:{exercise:{type:'walk',status:'complete'}}}},training:{stage:4,week:Array(7).fill('strength_a')},pending:{}}));localStorage.setItem('med_exam_gamification_v1',JSON.stringify({awards:{physiology__fc_p_1_b:{xp:20,day:'2026-10-12'},orphan:{xp:20,day:'2026-10-12'}},days:{}}));});}
const stored=page=>page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>!['med_exam_active_tab','med_exam_active_subject'].includes(key))));
async function openBasis(page,id){const detail=page.locator('#building-'+id);if(!await detail.evaluate(el=>el.open))await detail.locator(':scope > summary').click();await detail.locator('.building-basis > summary').click();return detail;}
async function seedCourses(page,count,activity=0){
 await page.goto('/');await page.waitForFunction(()=>typeof window.updateWorkspace==='function');
 await page.evaluate(async({count,activity})=>{
  const {flattenSubjects}=await import('/study-core.js');const units=flattenSubjects(window.studyData).slice(0,count),keys={physiology:'med_exam_physio_cloud',videos:'med_exam_videos_cloud',biochem:'med_exam_biochem_cloud',pharmacology:'med_exam_pharm_cloud'};
  for(const [path,key] of Object.entries(keys))localStorage.setItem(key,JSON.stringify(Object.fromEntries(units.filter(u=>u.path===path).map(u=>[u.id,true]))));
  localStorage.setItem('med_exam_life_v1_local',JSON.stringify({days:Object.fromEntries(Array.from({length:activity},(_,i)=>['2026-09-'+String(i+1).padStart(2,'0'),{questOS_v1:{exercise:{type:'walk',status:'complete'}}}])),training:{},pending:{}}));
 },{count,activity});await page.reload();await go(page);
}
test.beforeEach(async({page})=>{await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.clock.install({time:new Date('2026-10-12T04:00:00Z')});});
for(const width of [390,1440])test('territory stages and keyboard details explain real evidence without storage writes at '+width+'px',async({page})=>{
 await page.setViewportSize({width,height:900});await seed(page);await page.goto('/');await go(page);const before=await stored(page);
 for(const [id,current,next] of [['academy','符文書庫','奧術學院'],['barracks','木造訓練場','皇家兵營'],['keep','燈火據點','石築要塞']]){
  await expect(page.locator('#building-'+id+' .building-stage')).toHaveText(current);
  await expect(page.locator('#building-'+id+' .building-next-target')).toHaveText('下一階段 · '+next);
  await expect(page.locator('#building-'+id+' summary [role=progressbar]')).toBeVisible();
 }
 const summary=page.locator('#building-academy > summary');await summary.focus();await summary.press('Enter');await expect(page.locator('#building-academy')).toHaveAttribute('open','');
 await expect(page.locator('#building-academy .building-progress-label')).toHaveText('再完成 17 堂課程即可升級');await expect(page.locator('#building-academy .building-source')).not.toBeVisible();
 await page.locator('#building-barracks > summary').click();await expect(page.locator('#building-barracks')).toHaveAttribute('open','');await expect(page.locator('#building-academy')).toHaveAttribute('open','');
 await openBasis(page,'barracks');await expect(page.locator('#building-barracks .building-source')).toContainText('包含 1 次舊');await expect(page.locator('#building-barracks .building-progress-label')).toHaveText('再完成 5 次訓練即可升級');
 await page.locator('#building-keep > summary').click();await expect(page.locator('#building-keep .building-progress-label')).toHaveText('再完成 5 個活動日即可升級');
 await page.locator('#realm-activity > summary').click();await expect(page.locator('#realm-activity')).toContainText('2026-10-10');await expect(page.locator('#realm-activity')).toContainText('日期未記錄');await expect(page.locator('#realm-activity')).not.toContainText('2026-10-13');
 const events=await page.locator('#realm-activity [data-event-id]').evaluateAll(es=>es.map(e=>e.dataset.eventId));expect(new Set(events).size).toBe(events.length);expect(await stored(page)).toEqual(before);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const order=await page.locator('#tab-content-kingdom > *').evaluateAll(es=>es.map(e=>e.id||e.className));expect(order.findIndex(v=>v.includes('character-story'))).toBe(0);expect(order.findIndex(v=>v.includes('kingdom-territory'))).toBeLessThan(order.indexOf('realm-activity'));expect(order.indexOf('realm-activity')).toBeLessThan(order.findIndex(v=>v.includes('kingdom-reality')));
});
test('empty territory does not infer past exercise from the configured future plan',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('med_exam_life_v1_local',JSON.stringify({days:{},training:{startedOn:'2026-01-01',stage:4,week:Array(7).fill('strength_a')},pending:{}})));await page.goto('/');await go(page);
 await expect(page.locator('#building-barracks .building-metric')).toHaveText('累積有效訓練 0 次');await expect(page.locator('#building-barracks .building-number')).toHaveText('0 / 3');
 await page.locator('#building-barracks > summary').click();await expect(page.locator('#building-barracks .building-events')).toHaveText('尚無成果，從下一次現實中的行動開始。');
 await expect(page.locator('#building-keep .building-stage')).toHaveText('邊境營地');
});
test('cancelled courses lower current buildings while explicit first dates remain history and old XP is unchanged',async({page})=>{
 await seed(page);await page.goto('/');await go(page);const before=await page.evaluate(()=>localStorage.getItem('med_exam_gamification_v1'));await page.evaluate(()=>window.setStudyCompletion('physiology','fc_p_1_a',false));
 await expect(page.locator('#building-academy .building-stage')).toHaveText('研究營地');await expect(page.locator('#building-keep .building-stage')).toHaveText('燈火據點');await page.locator('#building-academy > summary').click();
 await expect(page.locator('#building-academy .building-events')).toContainText('曾完成，目前已取消勾選');expect(await page.evaluate(()=>localStorage.getItem('med_exam_gamification_v1'))).toBe(before);
 await page.evaluate(()=>window.courseDates.set('physiology__fc_p_1_a',null));await expect(page.locator('#realm-activity [data-event-id="course:physiology__fc_p_1_a"]')).toHaveCount(0);await page.reload();await go(page);await expect(page.locator('#building-academy .building-stage')).toHaveText('研究營地');
});
for(const width of [390,1440])test('keep keeps both route calculations optional and recent results unique at '+width+'px',async({page})=>{
 await page.setViewportSize({width,height:900});await seed(page);await page.goto('/');await go(page);await page.locator('#building-keep > summary').click();const before=await stored(page);
 await expect(page.locator('#building-keep summary [role=progressbar]')).toHaveAttribute('aria-valuenow','37');
 await expect(page.locator('#building-keep .keep-route-overview [data-path=study]')).toHaveText('學習路線 · 課程 6 / 23 單元');
 await expect(page.locator('#building-keep .keep-route-overview [data-path=cross]')).toHaveText('跨領域路線 · 課程 6 / 6 單元 · 活動日 3 / 8 天');
 await expect(page.locator('#building-keep .building-next')).not.toBeVisible();await openBasis(page,'keep');
 const current=page.locator('#building-keep .keep-current-paths'),next=page.locator('#building-keep .building-next');
 for(const path of ['study','cross'])await expect(current.locator('[data-path='+path+'] h6')).toContainText('已達標');
 await expect(next.locator('[data-path=study]')).toContainText('目前 6 / 23 單元，尚差 17 單元');await expect(next.locator('[data-path=cross]')).toContainText('目前 6 / 6 單元，尚差 0 單元');await expect(next.locator('[data-path=cross]')).toContainText('目前 3 / 8 天，尚差 5 天');
 await expect(page.locator('#building-keep .building-events [data-event-id]')).toHaveCount(3);await expect(page.locator('#building-keep .building-events [data-event-id^="milestone:"]')).toHaveCount(0);
 await page.locator('#realm-activity > summary').click();const events=await page.locator('#realm-activity .realm-event').evaluateAll(es=>es.map(el=>({id:el.dataset.eventId,date:el.querySelector('small').textContent})));
 expect(events.filter(e=>e.date!=='日期未記錄')).toHaveLength(5);expect(events.filter(e=>e.date==='日期未記錄')).toHaveLength(5);expect(events.filter(e=>e.id.startsWith('milestone:'))).toHaveLength(0);expect(new Set(events.map(e=>e.id)).size).toBe(events.length);
 expect(events.findIndex(e=>e.date==='日期未記錄')).toBe(5);expect(events.slice(0,5).map(e=>e.date)).toEqual(['2026-10-11','2026-10-11','2026-10-10','2026-10-10','2026-10-09']);
 expect(await stored(page)).toEqual(before);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
for(const [label,count,activity,name,matched] of [['study only',23,0,'石築要塞',['study']],['cross only',6,8,'石築要塞',['cross']],['highest study only',98,0,'學者之城',['study']],['highest cross only',58,30,'學者之城',['cross']]])test('keep '+label+' shows only the genuinely attained route',async({page})=>{
 await seedCourses(page,count,activity);const before=await stored(page);await expect(page.locator('#building-keep .building-stage')).toHaveText(name);await openBasis(page,'keep');
 for(const path of ['study','cross'])await expect(page.locator('#building-keep .keep-current-paths [data-path='+path+'] h6')).toContainText(matched.includes(path)?'已達標':'尚未達標');
 if(name==='學者之城'){await expect(page.locator('#building-keep .building-next [data-path]')).toHaveCount(0);await expect(page.locator('#building-keep .building-next-target')).toHaveText('已達最高階段');await expect(page.locator('#building-keep .building-progress-label')).not.toContainText('再完成');}
 expect(await stored(page)).toEqual(before);
});
test('undated achievements are labelled and follow dated history without current milestones',async({page})=>{
 await seedCourses(page,6);const before=await stored(page);await page.locator('#building-academy > summary').click();await expect(page.locator('#building-academy .building-events [data-event-id]')).toHaveCount(3);await expect(page.locator('#building-academy .building-events small')).toHaveText(['日期未記錄','日期未記錄','日期未記錄']);
 await page.locator('#realm-activity > summary').click();await expect(page.locator('#realm-activity [data-event-id]')).toHaveCount(6);await expect(page.locator('#realm-activity [data-event-id^="milestone:"]')).toHaveCount(0);expect(await stored(page)).toEqual(before);
});
for(const width of [390,1440])test('four of 115 courses shows six-unit next target with two remaining and three-layer UX at '+width+'px',async({page})=>{
 await page.setViewportSize({width,height:900});const errors=[];page.on('pageerror',e=>errors.push(e.message));await seedCourses(page,4);
 await page.evaluate(()=>{window.courseDates.set('physiology__fc_p_1_a','2026-10-10');window.courseDates.set('physiology__fc_p_1_b','2026-10-11');});await go(page);const before=await stored(page);
 const academy=page.locator('#building-academy');await expect(academy.locator('.building-stage')).toHaveText('研究營地');await expect(academy.locator('.building-next-target')).toHaveText('下一階段 · 符文書庫');await expect(academy.locator('.building-number')).toHaveText('4 / 6');await expect(academy.locator('.building-progress-label')).toHaveText('再完成 2 堂課程即可升級');await expect(academy.locator('.building-metric')).toHaveText('總進度 4 / 115 單元');
 for(const id of ['academy','barracks','keep']){
  const card=page.locator('#building-'+id);await expect(card).not.toHaveAttribute('open','');await expect(card.locator('.building-stage')).toBeVisible();await expect(card.locator('.building-next-target')).toBeVisible();await expect(card.locator('.building-basis')).not.toHaveAttribute('open','');
  const primary=await card.locator(':scope > summary').innerText();expect(primary).not.toMatch(/%|subjectStats|Firebase|為什麼|羅馬|資料來源/);
 }
 await expect(page.locator('#building-keep .building-progress-label')).toHaveText('再完成 2 堂課程即可升級');
 await academy.locator(':scope > summary').focus();await academy.locator(':scope > summary').press('Enter');await expect(academy.locator('.building-events [data-event-id]')).toHaveCount(3);await expect(academy.locator('.building-events small')).toHaveText(['2026-10-11','2026-10-10','日期未記錄']);
 const ids=await academy.locator('.building-events [data-event-id]').evaluateAll(es=>es.map(e=>e.dataset.eventId));expect(new Set(ids).size).toBe(3);expect(ids.every(id=>!id.startsWith('milestone:'))).toBe(true);
 await expect(academy.locator('.building-source')).not.toBeVisible();await expect(academy.locator('.building-next')).not.toBeVisible();await expect(academy.locator('.building-growth')).toBeVisible();
 expect(await stored(page)).toEqual(before);expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('.kingdom-territory').screenshot({path:'test-results/territory-redesign-'+width+'.png'});
 await academy.locator('.building-basis > summary').focus();await academy.locator('.building-basis > summary').press('Enter');await expect(academy.locator('.building-next')).toContainText('完成 6 單元');await expect(page.locator('#kingdom-buildings')).not.toContainText('subjectStats');await expect(page.locator('#kingdom-buildings')).not.toContainText('habits/');
 await academy.locator('.building-navigation').click();await expect(page.locator('#page-title')).toHaveText('First Choice 生理學');
});
test('keep nearest construction condition still requires both parts of the cross-domain route',async({page})=>{
 await seedCourses(page,6,6);await expect(page.locator('#building-keep .building-progress-label')).toHaveText('再完成 2 個活動日即可升級');
 await page.evaluate(()=>window.setStudyCompletion('physiology','fc_p_1_a',false));await expect(page.locator('#building-keep .building-progress-label')).toHaveText('再完成 1 堂課程與 2 個活動日即可升級');await expect(page.locator('#building-keep .building-number')).toHaveText('6 / 8');
});
test('highest academy and barracks stop promising a next upgrade',async({page})=>{
 await seedCourses(page,98,30);
 for(const id of ['academy','barracks']){await expect(page.locator('#building-'+id+' .building-next-target')).toHaveText('已達最高階段');await expect(page.locator('#building-'+id+' .building-progress-label')).toHaveText('最高階段已達成，繼續累積你的成果。');}
});
