import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createBlankAccountPlan,RESET_CLOUD_PATHS} from '../../src/study/reset-plan.js';
import {makeFrozenCourseRules} from '../../scripts/course-rules-candidate.mjs';
export async function verifyBlankAccount({browser,base,read,admin,adminUpdate,check}){
 const uid='fixture-A',root='users/'+uid,domain=root+'/learningV3';
 const before=await read(''),other=await read('users/fixture-B');
 const staticData={courseDefinitions:{keep:'synthetic'},questDefinitions:{keep:true}};
 await admin('courseDefinitions',staticData.courseDefinitions);await admin('questOS/v1/courseDefinitions',staticData.questDefinitions);
 // Synthetic legacy XP proves blank start must also retire the shared read source.
 await admin('gamification/v1/awards',{legacy:{xp:200,day:'2026-10-01'}});
 await admin('gamification/v1/days',{'2026-10-01':{xp:200}});
 await admin('.settings/rules',makeFrozenCourseRules(uid));
 const frozen=await read('');
 const plan=await createBlankAccountPlan({verifiedUID:uid,ownerUID:uid,cloudSnapshot:frozen,localSnapshot:{},reviewedLegacyPaths:RESET_CLOUD_PATHS,courseGeneration:'blank-course-proof',lifeGeneration:'blank-life-proof'});
 const context=await browser.newContext(),page=await context.newPage(),errors=[];let external=0;
 page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',route=>{if(new URL(route.request().url()).hostname==='127.0.0.1')return route.continue();external++;return route.abort();});
 async function load(){await page.goto(base);await page.waitForFunction(()=>window.updateWorkspace&&i3Runtime.read().status==='ready');}
 async function drain(){await page.waitForFunction(()=>!courseSync.inspect().pending.length);}
 const until=async(path,predicate)=>{for(let i=0;i<100;i++){const value=await read(path);if(predicate(value))return value;await new Promise(r=>setTimeout(r,100));}assert.fail('Server proof missing: '+path);};
 try{
 await check('blank start: freeze, atomic synthetic initialization and active Rules preserve other UID/static data',async()=>{
  assert.equal(plan.executable,false);
  await adminUpdate(plan.atomicUpdate);
  const doc=await read(domain);assert.deepEqual(doc,{schema:3,generation:'blank-course-proof',era:plan.atomicUpdate[domain].era,clock:0});
  assert.deepEqual(await read(root+'/lifeControl'),{schema:1,generation:'blank-life-proof',era:plan.atomicUpdate[root+'/lifeControl'].era});assert.equal(await read(root+'/lifeV1/blank-life-proof'),null);
  assert.deepEqual(await read('users/fixture-B'),other);assert.deepEqual(await read('courseDefinitions'),staticData.courseDefinitions);assert.deepEqual(await read('questOS/v1/courseDefinitions'),staticData.questDefinitions);
  // Real owner SDK is also denied while frozen; no writes are inferred from cache.
  await load();assert.equal(await page.evaluate(async()=>{try{await firebase.database().ref('users/fixture-A/lifeV1/blank-life-proof/habits/probe').set(true);return false;}catch{return true;}}),true);
  await admin('.settings/rules',JSON.parse(readFileSync(new URL('../fixtures/course-rules.json',import.meta.url))));await load();
 });
 await check('blank start: Auth UID, catalog, initial XP/kingdom, actual course/date/task/habit and reload work from zero',async()=>{
  assert.equal(await page.evaluate(()=>authenticatedUser.uid),uid);assert.equal(await page.evaluate(()=>lifeSession.generation),'blank-life-proof');
  assert.match(await page.locator('#xp-detail').textContent(),/歷史 0 XP/);assert.match(await page.locator('#lord-xp-level').textContent(),/Lv\. 1/);assert.equal(await page.locator('#lord-realm-meter').getAttribute('value'),'0');
  assert.equal(await page.evaluate(()=>Object.values(readStudyStates()).flatMap(v=>Object.values(v)).filter(v=>v===true).length),0);
  await page.evaluate(()=>showStudyItem('physiology','fc_p_1_a'));await page.locator('[data-study-key="physiology__fc_p_1_a"] input[type=checkbox]').check();await drain();
  assert(Number(await page.locator('#lord-realm-meter').getAttribute('value'))>0);
  const first=(await read(domain)).firstCompletion.physiology__fc_p_1_a;assert(first?.day);assert.equal((await read(domain)).courses.physiology.fc_p_1_a,true);
  await page.evaluate(()=>courseDates.set('physiology__fc_p_1_a','2026-10-01'));await drain();assert.equal((await read(domain)).firstCompletion.physiology__fc_p_1_a.day,'2026-10-01');
  await page.evaluate(()=>{switchTab('home');[...document.querySelectorAll('button')].find(e=>e.textContent==='規劃今日任務').click();document.querySelector('#task-custom').value='fresh-zero-task';document.querySelector('#planner-form').requestSubmit();lifeHabits.set('daily-game',true);});
  await until(root+'/lifeV1/blank-life-proof/planner/tasks',v=>Object.values(v||{}).some(t=>t.title==='fresh-zero-task'));
  await page.locator('#task-list .planner-task').filter({hasText:'fresh-zero-task'}).locator('input[type=checkbox]').check();
  await until(root+'/lifeV1/blank-life-proof/planner/tasks',v=>Object.values(v||{}).some(t=>t.title==='fresh-zero-task'&&t.complete===true));
  const day=await page.evaluate(()=>studyDateKey());await until(root+'/lifeV1/blank-life-proof/habits/'+day,v=>v?.['daily-game']===true);
  await page.evaluate(()=>{setStudyCompletion('physiology','fc_p_1_a',false);setStudyCompletion('physiology','fc_p_1_a',true);});await drain();
  const stable=await read(domain);await load();await drain();assert.deepEqual(await read(domain),stable);assert.match(await page.locator('#xp-detail').textContent(),/歷史 0 XP/);
  assert.equal(await read('gamification/v1/awards'),null);assert.equal(await read('gamification/v1/days'),null);assert.equal((await read(domain)).firstCompletion.physiology__fc_p_1_a.day,'2026-10-01');
  assert.deepEqual(await read('users/fixture-B'),other);assert.deepEqual(await read('courseDefinitions'),staticData.courseDefinitions);assert.deepEqual(await read('questOS/v1/courseDefinitions'),staticData.questDefinitions);assert.equal(external,0);assert.deepEqual(errors,[]);
  const {realmGrowth}=await import('../../src/kingdom/realm-growth.js');const initial=realmGrowth({courses:{done:0,total:115},training:0,activityDays:0}),grown=realmGrowth({courses:{done:1,total:115},training:0,activityDays:0});assert.equal(initial.level,1);assert(grown.academy>initial.academy);assert(grown.progress>initial.progress);
 });
 }finally{await context.close();}
 // Fixture only. No production URL, credentials, Auth mutation, or apply API exists in the plan helper.
 assert(before); 
}
