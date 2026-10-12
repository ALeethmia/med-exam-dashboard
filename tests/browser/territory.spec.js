import {test,expect} from '@playwright/test';
async function go(page){await page.waitForFunction(()=>typeof window.updateWorkspace==='function');await page.evaluate(()=>window.switchTab('kingdom'));}
async function seed(page){await page.addInitScript(()=>{if(localStorage.getItem('realmSeeded'))return;localStorage.setItem('realmSeeded','yes');const ids=['fc_p_1_a','fc_p_1_b','fc_p_1_c','fc_p_1_d','fc_p_1_e','fc_p_1_f'];localStorage.setItem('med_exam_physio_cloud',JSON.stringify(Object.fromEntries(ids.map(id=>[id,true]))));localStorage.setItem('med_exam_course_dates_v1_local',JSON.stringify({records:{physiology__fc_p_1_a:{day:'2026-10-10',_version:'a'},physiology__fc_p_1_b:{day:null,_version:'b'}},pending:{}}));localStorage.setItem('med_exam_habits_2026-10-09',JSON.stringify({'daily-sport':true}));localStorage.setItem('med_exam_life_v1_local',JSON.stringify({days:{'2026-10-10':{questOS_v1:{exercise:{type:'strength_a',status:'complete'}}},'2026-10-11':{questOS_v1:{exercise:{type:'seated',status:'alternative'},leisure:{title:'放鬆閱讀',status:'complete'}}},'2026-10-12':{questOS_v1:{exercise:{type:'walk',status:'symptom_rest'}}},'2026-10-13':{questOS_v1:{exercise:{type:'walk',status:'complete'}}}},training:{stage:4,week:Array(7).fill('strength_a')},pending:{}}));localStorage.setItem('med_exam_gamification_v1',JSON.stringify({awards:{physiology__fc_p_1_b:{xp:20,day:'2026-10-12'},orphan:{xp:20,day:'2026-10-12'}},days:{}}));});}
const stored=page=>page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>!['med_exam_active_tab','med_exam_active_subject'].includes(key))));
test.beforeEach(async({page})=>{await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.clock.install({time:new Date('2026-10-12T04:00:00Z')});});
for(const width of [390,1440])test('territory stages and keyboard details explain real evidence without storage writes at '+width+'px',async({page})=>{
 await page.setViewportSize({width,height:900});await seed(page);await page.goto('/');await go(page);const before=await stored(page);
 await expect(page.locator('#building-academy .building-stage')).toHaveText('II · 符文書庫');await expect(page.locator('#building-barracks .building-stage')).toHaveText('II · 木造訓練場');await expect(page.locator('#building-keep .building-stage')).toHaveText('II · 燈火據點');
 const summary=page.locator('#building-academy > summary');await summary.focus();await summary.press('Enter');await expect(page.locator('#building-academy')).toHaveAttribute('open','');await expect(page.locator('#building-academy .building-next')).toContainText('尚差 17 單元');await expect(page.locator('#building-academy .building-source')).toContainText('不以四捨五入');
 await page.locator('#building-barracks > summary').click();await expect(page.locator('#building-barracks')).toHaveAttribute('open','');await expect(page.locator('#building-academy')).not.toHaveAttribute('open','');await expect(page.locator('#building-barracks .building-source')).toContainText('含 1 次舊');await expect(page.locator('#building-barracks .building-next')).toContainText('尚差 5 次');
 await page.locator('#building-keep > summary').click();await expect(page.locator('#building-keep .building-next')).toContainText('目前 3 / 8 天，尚差 5 天');await expect(page.locator('#realm-activity')).toContainText('2026-10-10');await expect(page.locator('#realm-activity')).toContainText('日期未記錄');await expect(page.locator('#realm-activity')).not.toContainText('2026-10-13');
 const events=await page.locator('#realm-activity [data-event-id]').evaluateAll(es=>es.map(e=>e.dataset.eventId));expect(new Set(events).size).toBe(events.length);expect(await stored(page)).toEqual(before);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const order=await page.locator('#tab-content-kingdom > *').evaluateAll(es=>es.map(e=>e.id||e.className));expect(order.indexOf('realm-activity')).toBeLessThan(order.indexOf('kingdom-chronicles'));expect(order.indexOf('kingdom-chronicles')).toBeLessThan(order.findIndex(v=>v.includes('kingdom-reality')));
});
test('empty territory does not infer past exercise from the configured future plan',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('med_exam_life_v1_local',JSON.stringify({days:{},training:{startedOn:'2026-01-01',stage:4,week:Array(7).fill('strength_a')},pending:{}})));await page.goto('/');await go(page);await expect(page.locator('#building-barracks .building-metric')).toContainText('下限 0 次');await expect(page.locator('#realm-activity')).toContainText('尚無可驗證');await expect(page.locator('#building-keep .building-stage')).toHaveText('I · 邊境營地');
});
test('cancelled courses lower current buildings while explicit first dates remain history and old XP is unchanged',async({page})=>{
 await seed(page);await page.goto('/');await go(page);const before=await page.evaluate(()=>localStorage.getItem('med_exam_gamification_v1'));await page.evaluate(()=>window.setStudyCompletion('physiology','fc_p_1_a',false));await expect(page.locator('#building-academy .building-stage')).toHaveText('I · 研究營地');await expect(page.locator('#building-keep .building-stage')).toHaveText('II · 燈火據點');await page.locator('#building-academy > summary').click();await expect(page.locator('#building-academy [data-event-group=dated] .building-events')).toContainText('目前未勾選完成');expect(await page.evaluate(()=>localStorage.getItem('med_exam_gamification_v1'))).toBe(before);await page.evaluate(()=>window.courseDates.set('physiology__fc_p_1_a',null));await expect(page.locator('#realm-activity [data-event-id="course:physiology__fc_p_1_a"]')).toHaveCount(0);await page.reload();await go(page);await expect(page.locator('#building-academy .building-stage')).toHaveText('I · 研究營地');
});

async function seedCourses(page,count,activity=0){
 await page.goto('/');await page.waitForFunction(()=>typeof window.updateWorkspace==='function');
 await page.evaluate(async({count,activity})=>{
  const {flattenSubjects}=await import('/study-core.js');const units=flattenSubjects(window.studyData).slice(0,count),keys={physiology:'med_exam_physio_cloud',videos:'med_exam_videos_cloud',biochem:'med_exam_biochem_cloud',pharmacology:'med_exam_pharm_cloud'};
  for(const [path,key] of Object.entries(keys))localStorage.setItem(key,JSON.stringify(Object.fromEntries(units.filter(u=>u.path===path).map(u=>[u.id,true]))));
  localStorage.setItem('med_exam_life_v1_local',JSON.stringify({days:Object.fromEntries(Array.from({length:activity},(_,i)=>['2026-09-'+String(i+1).padStart(2,'0'),{questOS_v1:{exercise:{type:'walk',status:'complete'}}}])),training:{},pending:{}}));
 },{count,activity});await page.reload();await go(page);await page.locator('#building-keep > summary').focus();await page.locator('#building-keep > summary').press('Enter');
}
for(const width of [390,1440])test('keep independently explains both paths and dated groups without record writes at '+width+'px',async({page})=>{
 await page.setViewportSize({width,height:900});await seed(page);await page.goto('/');await go(page);await page.locator('#building-keep > summary').click();const before=await stored(page);
 await expect(page.locator('#building-keep summary [role=progressbar]')).toHaveCount(0);
 const current=page.locator('#building-keep .keep-current-paths'),next=page.locator('#building-keep .building-next');
 await expect(page.locator('#building-keep .building-reason')).toContainText('純學習路徑、跨領域路徑');
 await expect(current.locator('[data-path=study] h6')).toContainText('已達標');await expect(current.locator('[data-path=cross] h6')).toContainText('已達標');
 await expect(next.locator('[data-path=study]')).toContainText('目前 6 / 23 單元，尚差 17 單元');await expect(next.locator('[data-path=study] [role=progressbar]')).toHaveAttribute('aria-valuenow','26');
 await expect(next.locator('[data-path=cross]')).toContainText('目前 6 / 6 單元，尚差 0 單元');await expect(next.locator('[data-path=cross]')).toContainText('目前 3 / 8 天，尚差 5 天');await expect(next.locator('[data-path=cross] [role=progressbar]')).toHaveAttribute('aria-valuenow','37');
 await expect(page.locator('#realm-dated [data-event-id]')).toHaveCount(5);await expect(page.locator('#realm-dated')).not.toContainText('日期未記錄');await expect(page.locator('#realm-dated [data-event-id^="milestone:"]')).toHaveCount(0);
 await expect(page.locator('#realm-undated [data-event-id]')).toHaveCount(5);await expect(page.locator('#realm-undated')).toContainText('不能判定何時完成');await expect(page.locator('#realm-undated [data-event-id="course:physiology__fc_p_1_b"]')).toHaveCount(1);
 await expect(page.locator('#realm-milestones [data-event-id]')).toHaveCount(3);await expect(page.locator('#realm-milestones')).toContainText('無歷史解鎖日期');
 expect(await stored(page)).toEqual(before);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/territory-review-'+width+'.png',fullPage:true});
});
for(const [label,count,activity,stage,matched] of [['study only',23,0,'III',['study']],['cross only',6,8,'III',['cross']],['highest study only',98,0,'V',['study']],['highest cross only',58,30,'V',['cross']]])test('keep '+label+' shows only the genuinely attained route',async({page})=>{
 await seedCourses(page,count,activity);const before=await stored(page);await expect(page.locator('#building-keep .building-stage')).toContainText(stage+' ·');
 for(const path of ['study','cross'])await expect(page.locator('#building-keep .keep-current-paths [data-path='+path+'] h6')).toContainText(matched.includes(path)?'已達標':'尚未達標');
 if(stage==='V')await expect(page.locator('#building-keep .building-next [data-path]')).toHaveCount(0);
 expect(await stored(page)).toEqual(before);
});
test('undated achievements never fill the recent list when all course dates are missing',async({page})=>{
 await seedCourses(page,6);const before=await stored(page);await expect(page.locator('#realm-dated [data-event-id]')).toHaveCount(0);await expect(page.locator('#realm-dated')).toContainText('尚無可驗證的有日期成果');await expect(page.locator('#realm-undated [data-event-id]')).toHaveCount(6);await expect(page.locator('#realm-milestones [data-event-id]')).toHaveCount(2);expect(await stored(page)).toEqual(before);
});
