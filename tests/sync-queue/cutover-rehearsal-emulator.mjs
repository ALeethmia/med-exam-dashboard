import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emulatorClient,rehearseCutover,digest} from '../../scripts/emulator-cutover.mjs';
import {makeFrozenCourseRules} from '../../scripts/course-rules-candidate.mjs';
export async function verifyCutoverRehearsal({browser,base,origin,namespace,check}){
 const client=emulatorClient(origin,namespace),uid='fixture-A',root='users/'+uid;
 const seed=()=>({...JSON.parse(readFileSync(new URL('../fixtures/synthetic-restore.json',import.meta.url))),gamification:{v1:{awards:{synthetic:{xp:100}}}},users:{'fixture-B':{learningV3:{schema:3,generation:'other-course',era:2,clock:7},lifeControl:{schema:1,generation:'other-life',era:3},lifeV1:{'other-life':{habits:{keep:true}}}}},courseDefinitions:{synthetic:'untouched'}});
 const context=await browser.newContext();await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 const probe=await context.newPage();
 await probe.goto(base+'/cutover-probe.html');
 await probe.evaluate(({origin,namespace})=>{const db=firebase.initializeApp({projectId:namespace,databaseURL:'https://'+namespace+'.firebaseio.com'},'cutover-probe').database();db.useEmulator('127.0.0.1',Number(new URL(origin).port),{mockUserToken:{sub:'fixture-A',user_id:'fixture-A'}});window.probeDB=db;},{origin,namespace});
 try{
 await check('cutover: every injected stage failure re-confirms freeze, denies real SDK writes and preserves other UID/new commits',async()=>{
  for(const stage of ['freeze','snapshot','restore','initialized','active','smoke']){
   await client.put('',seed());const legacy=await client.read('');let failure;console.log('CUTOVER_FAULT_BEGIN '+stage);
   try{await rehearseCutover({origin,namespace,failAt:stage,smoke:async plan=>{await client.put(plan.emptyLifeNamespace+'/checklist/committed',true);}});}catch(e){failure=e;}
   assert(failure,'Expected injected '+stage);assert.equal(failure.message,'cutover/stopped-frozen');assert.equal(failure.freezeConfirmed,true);assert.equal(failure.stages.at(-1),stage);
   assert.deepEqual(await client.read('.settings/rules'),makeFrozenCourseRules(uid));assert.deepEqual(await client.read('users/fixture-B'),legacy.users['fixture-B']);assert.deepEqual(await client.read('courseDefinitions'),legacy.courseDefinitions);
   if(['freeze','snapshot','restore'].includes(stage))assert.deepEqual(await client.read(''),legacy);
   if(stage==='smoke')assert.equal(await client.read(failure.artifacts.plan.emptyLifeNamespace+'/checklist/committed'),true);
   const before=await client.read(''),control=await client.read(root+'/lifeControl');
   const denied=await probe.evaluate(async generation=>{const results=[];for(const path of ['habits/stale','users/fixture-A/lifeV1/'+generation+'/checklist/probe'])try{await Promise.race([probeDB.ref(path).set(true),new Promise((_,reject)=>setTimeout(()=>reject(Error('probe-timeout')),10000))]);results.push(false);}catch(e){results.push(String(e.code??e.message).toUpperCase()==='PERMISSION_DENIED');}return results;},control?.generation||'not-initialized');
   assert.deepEqual(denied,[true,true]);assert.deepEqual(await client.read(''),before);console.log('CUTOVER_FAULT_FROZEN '+stage);
  }
 });
 await check('cutover: final frozen snapshot restores separately, atomic initialization and active Rules support actual login/sync/offline reload',async()=>{
  await client.put('',seed());const legacy=await client.read('');const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const result=await rehearseCutover({origin,namespace,smoke:async plan=>{
   await page.goto(base);await page.waitForFunction(()=>window.updateWorkspace&&window.i3Runtime?.read().status==='ready');
   assert.equal(await page.evaluate(()=>authenticatedUser.uid),uid);assert.equal(await page.evaluate(()=>lifeSession.generation),plan.lifeFence.replacement.generation);assert.match(await page.locator('#xp-detail').textContent(),/歷史 0 XP/);
   await page.evaluate(()=>showStudyItem('physiology','fc_p_1_a'));await page.locator('[data-study-key="physiology__fc_p_1_a"] input[type=checkbox]').check();await page.waitForFunction(()=>!courseSync.inspect().pending.length);
   let doc=await client.read(root+'/learningV3');assert.equal(doc.clock,1);assert.equal(doc.courses.physiology.fc_p_1_a,true);const date=doc.firstCompletion.physiology__fc_p_1_a;assert(date.day);
   await page.evaluate(()=>firebase.database().goOffline());await page.waitForFunction(()=>document.querySelector('#sync-status').textContent.includes('離線'));await page.evaluate(()=>setStudyCompletion('videos','1',true));assert((await page.evaluate(()=>courseSync.inspect().pending)).length>0);
   await page.reload();await page.waitForFunction(()=>window.updateWorkspace&&window.i3Runtime?.read().status==='ready'&&!courseSync.inspect().pending.length);doc=await client.read(root+'/learningV3');assert.equal(doc.courses.videos[1],true);assert.deepEqual(doc.firstCompletion.physiology__fc_p_1_a,date);assert.equal(doc.clock,2);
   await page.evaluate(()=>lifeHabits.set('daily-game',true));const day=await page.evaluate(()=>studyDateKey());
   for(let i=0;i<100;i++){if(await client.read(plan.emptyLifeNamespace+'/habits/'+day+'/daily-game')===true)break;await new Promise(r=>setTimeout(r,100));}
   assert.equal(await client.read(plan.emptyLifeNamespace+'/habits/'+day+'/daily-game'),true);assert.deepEqual(errors,[]);await page.close();
  }});
  assert.equal(result.state,'active');assert.equal(result.productionExecutable,false);assert.equal(result.backup.sha256,digest(JSON.parse(result.backup.serialized)));assert.deepEqual(result.stages,['freeze','snapshot','restore','initialized','active','smoke']);assert.deepEqual(await client.read('users/fixture-B'),legacy.users['fixture-B']);assert.deepEqual(await client.read('courseDefinitions'),legacy.courseDefinitions);
 });
 }finally{await context.close();}
}
