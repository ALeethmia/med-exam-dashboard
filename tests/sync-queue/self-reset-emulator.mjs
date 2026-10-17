import assert from 'node:assert/strict';
import {createSelfResetPlan} from '../../src/study/reset-plan.js';
import {makeCourseRules,makeFrozenCourseRules} from '../../scripts/course-rules-candidate.mjs';
export async function verifySelfReset({browser,base,origin,namespace,read,admin,check}){
 const uid='fixture-A',root='users/'+uid;
 const token=(overrides={})=>[{alg:'none',typ:'JWT'},{iss:'https://securetoken.google.com/'+namespace,aud:namespace,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,sub:uid,user_id:uid,email:'fixture@example.test',email_verified:true,auth_time:Math.floor(Date.now()/1000),firebase:{sign_in_provider:'google.com',identities:{}},...overrides}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.')+'.';
 const request=async(p,body,claims={})=>fetch(origin+'/'+p+'.json?ns='+namespace+'&auth='+token(claims),{method:body?'PATCH':'GET',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const seed=async()=>{
  await admin('',{users:{[uid]:{selfResetContract:{version:1},learningV3:{schema:3,generation:'before-course',era:3,clock:0},lifeControl:{schema:1,generation:'before-life',era:6},lifeV1:{'before-life':{habits:{'2026-10-01':{'daily-game':true}},planner:{tasks:{old:{id:'old',title:'old',date:'2026-10-01',complete:true}}},adaptiveStudy:{settings:{examDate:'2027-01-01',_version:'12345678-1234-4123-8123-123456789abc'}},training:{stage:2}}}},'fixture-B':{keep:true}},courseDefinitions:{keep:true},gamification:{v1:{awards:{historical:{xp:200,day:'2026-10-01'}}}}});
  await admin('.settings/rules',makeCourseRules(uid));
 };
 await seed();
 await check('self reset Rules: recent verified owner reads normally; unverified/stale/foreign/partial/mixed/ancestor requests leave whole tree unchanged',async()=>{
  assert.equal((await request(root+'/learningV3')).status,200);
  const course=await read(root+'/learningV3'),life=await read(root+'/lifeControl');
  const plan=await createSelfResetPlan({uid,course,life});const before=await read('');
  const invalids=[{body:plan.atomicUpdate,claims:{email_verified:false}},{body:plan.atomicUpdate,claims:{auth_time:Math.floor(Date.now()/1000)-600}},{body:plan.atomicUpdate,claims:{sub:'fixture-B',user_id:'fixture-B'}},
   ...['learningV3','lifeControl','resetReceipts/'+plan.id].map(path=>({body:{[root+'/'+path]:plan.atomicUpdate[root+'/'+path]}})),
   {body:{...plan.atomicUpdate,'users/fixture-B/keep':false}},{body:{...plan.atomicUpdate,'physiology/legacy':true}},
   {body:{[root]:{learningV3:plan.atomicUpdate[root+'/learningV3'],lifeControl:plan.atomicUpdate[root+'/lifeControl'],resetReceipts:{[plan.id]:plan.receipt}}}}];
  for(const item of invalids){const result=await request('',item.body,item.claims);assert(!result.ok,'invalid reset allowed: '+JSON.stringify(item));assert.deepEqual(await read(''),before);}
 });
 await check('first activation Rules: absent pair initializes atomically, replay/partial initialization/metadata alteration are rejected',async()=>{
  await admin(root+'/learningV3',null);await admin(root+'/lifeControl',null);
  const plan=await createSelfResetPlan({uid,course:null,life:null,allowInitialize:true});const before=await read('');
  const partial=await request('',{[root+'/lifeControl']:plan.atomicUpdate[root+'/lifeControl']});assert(!partial.ok);assert.deepEqual(await read(''),before);
  const result=await request('',plan.atomicUpdate);assert.equal(result.status,200,await result.text());assert.equal((await read(root+'/learningV3')).era,0);assert.equal((await read(root+'/lifeControl')).era,0);
  const replay=await request('',plan.atomicUpdate);assert(!replay.ok);assert(!(await request('',{[root+'/selfResetContract/version']:2})).ok);
  const course=await read(root+'/learningV3'),life=await read(root+'/lifeControl');
  const plans=await Promise.all([createSelfResetPlan({uid,course,life}),createSelfResetPlan({uid,course,life})]);
  const race=await Promise.all(plans.map(plan=>request('',plan.atomicUpdate)));assert.equal(race.filter(response=>response.ok).length,1,'one stale-baseline reset wins');
  assert.equal((await read(root+'/learningV3')).era,1);assert.equal((await read(root+'/lifeControl')).era,1);
  await seed();
 });
 const context=await browser.newContext(),page=await context.newPage(),old=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));let patchCount=0,loseACK=false;
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname===namespace+'.firebaseio.com'&&url.pathname.endsWith('.json')){
   const target=new URL(origin+url.pathname);target.search=url.search;target.searchParams.set('ns',namespace);
   if(route.request().method()==='PATCH')patchCount++;
   const response=await route.fetch({url:target.href,maxRetries:0});
   if(loseACK&&route.request().method()==='PATCH'){loseACK=false;return route.abort('failed');}
   return route.fulfill({response});
  }
  return url.hostname==='127.0.0.1'?route.continue():route.abort();
 });
 const load=async p=>{await p.goto(base);await p.waitForFunction(()=>window.updateWorkspace&&i3Runtime.read().status==='ready');};
 const drain=async p=>p.waitForFunction(()=>!courseSync.inspect().pending.length);
 const reset=async p=>{
  await p.evaluate(()=>switchTab('settings'));await p.locator('#open-self-reset').click();
  assert.equal(await p.locator('#confirm-self-reset').isDisabled(),true);
  await p.locator('#reset-scope').check();await p.locator('#reset-account').fill('wrong@example.test');assert.equal(await p.locator('#confirm-self-reset').isDisabled(),true);
  await p.locator('#reset-account').fill('fixture@example.test');p.once('dialog',dialog=>dialog.accept());await p.locator('#confirm-self-reset').click();
 };
 try{
 await check('self reset settings UI: double confirmation, real one-PATCH reset, zero courses/dates/life/XP/kingdom; settings/Auth/catalog/other UID preserved',async()=>{
  await load(page);await load(old);await page.evaluate(()=>setStudyCompletion('videos','1',true));await drain(page);
  await old.evaluate(()=>{firebase.database().goOffline();setStudyCompletion('videos','2',true);lifeHabits.set('daily-game',true);});
  await page.evaluate(()=>{localStorage.setItem('becoming_uid_v1:fixture-B:med_exam_videos_cloud','other');});
  const other=await read('users/fixture-B'),definitions=await read('courseDefinitions');
  await reset(page);await page.waitForFunction(()=>window.updateWorkspace&&i3Runtime.read().status==='ready'&&lifeSession.generation.startsWith('life_'));
  assert.equal(patchCount,1);const course=await read(root+'/learningV3');assert.equal(course.era,4);assert.equal(course.clock,0);assert.equal(course.courses,undefined);assert.equal(course.firstCompletion,undefined);
  const control=await read(root+'/lifeControl');assert.equal(control.era,7);assert.equal(await read(root+'/lifeV1/before-life'),null);
  assert.equal((await read(root+'/lifeV1/'+control.generation+'/adaptiveStudy/settings')).examDate,'2027-01-01');assert.equal((await read(root+'/lifeV1/'+control.generation+'/training')).stage,2);
  assert.match(await page.locator('#xp-detail').textContent(),/歷史 0 XP/);assert.equal(await page.locator('#lord-realm-meter').getAttribute('value'),'0');assert.match(await page.locator('#lord-xp-level').textContent(),/Lv\. 1/);
  assert.equal(await page.evaluate(()=>authenticatedUser.uid),uid);assert.equal(await page.evaluate(()=>localStorage.getItem('becoming_uid_v1:fixture-B:med_exam_videos_cloud')),'other');
  assert.deepEqual(await read('users/fixture-B'),other);assert.deepEqual(await read('courseDefinitions'),definitions);
  assert.equal(await page.evaluate(()=>Object.values(readStudyStates()).flatMap(v=>Object.values(v)).some(Boolean)),false);
 });
 await check('self reset fences: offline old tab/device, old generation direct writes, receipt replay cannot restore progress; normal fresh sync still works',async()=>{
  const before=await read(root+'/learningV3');
  await old.evaluate(()=>firebase.database().goOnline());await old.waitForFunction(()=>window.lifeSession?.generation.startsWith('life_')&&i3Runtime.read().status==='ready');
  await drain(old);assert.deepEqual(await read(root+'/learningV3'),before);
  for(const body of [{[root+'/lifeV1/before-life/habits/old']:true},{[root+'/learningV3']:{schema:3,generation:'before-course',era:3,clock:99}},{[root+'/resetReceipts/'+before.generation]:null},{[root+'/lifeControl']:{schema:1,generation:'before-life',era:6}}])assert(!(await request('',body)).ok);
  await page.evaluate(()=>setStudyCompletion('videos','3',true));await drain(page);assert.equal((await read(root+'/learningV3')).courses.videos['3'],true);
  await load(page);await drain(page);assert.equal((await read(root+'/learningV3')).clock,1);
 });
 await old.close();
 await check('self reset lost ACK: evidence survives reload, only read reconciliation runs, PATCH is never repeated',async()=>{
  loseACK=true;await reset(page);await page.waitForFunction(()=>document.querySelector('#self-reset-dialog [role=status]')?.textContent.includes('結果不明'));
  assert.equal(patchCount,2);const doc=await read(root+'/learningV3');assert.equal(doc.era,5);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem([...Array(localStorage.length)].map((_,i)=>localStorage.key(i)).find(k=>k.includes('reset_evidence_v1:')&&JSON.parse(localStorage.getItem(k)).phase==='unknown'))).phase),'unknown');
  await load(page);await drain(page);assert.equal(patchCount,2);assert.equal((await read(root+'/learningV3')).era,5);assert.equal(await page.locator('#lord-realm-meter').getAttribute('value'),'0');
 });
 await check('self reset server rejection: no partial change, evidence retained, reload blocks writers and offers read-only checking',async()=>{
  await admin('.settings/rules',makeFrozenCourseRules(uid));const before=await read('');await reset(page);
  await page.waitForFunction(()=>document.querySelector('#self-reset-dialog [role=status]')?.textContent.includes('結果不明'));assert.equal(patchCount,3);assert.deepEqual(await read(''),before);
  await page.reload();await page.getByRole('heading',{name:'重置結果待確認'}).waitFor();assert.equal(await page.evaluate(()=>!!window.courseSync),false);assert.equal(patchCount,3);
  assert.deepEqual(errors,[]);
 });
 await check('first activation UI: verified login plus two confirmations establishes blank fences; existing account cannot be initialized again',async()=>{
  await seed();await admin(root+'/learningV3',null);await admin(root+'/lifeControl',null);await admin(root+'/lifeV1',null);
  await page.evaluate(()=>localStorage.clear());await page.goto(base+'/first-start.html');await page.locator('#first-form').waitFor();
  assert.equal(await page.locator('#first-form [type=submit]').isDisabled(),true);
  await page.locator('#first-scope').check();await page.locator('#first-email').fill('fixture@example.test');page.once('dialog',dialog=>dialog.accept());await page.locator('#first-form [type=submit]').click();
  await page.waitForFunction(()=>window.updateWorkspace&&i3Runtime.read().status==='ready');assert.equal((await read(root+'/learningV3')).era,0);assert.equal(await page.locator('#lord-realm-meter').getAttribute('value'),'0');
  const before=await read(''),count=patchCount;
  await page.goto(base+'/first-start.html');await page.locator('#first-form').waitFor();await page.locator('#first-scope').check();await page.locator('#first-email').fill('fixture@example.test');page.once('dialog',dialog=>dialog.accept());await page.locator('#first-form [type=submit]').click();await page.waitForFunction(()=>document.querySelector('#first-status').textContent.includes('未完成'));
  assert.equal(patchCount,count);assert.deepEqual(await read(''),before);assert.deepEqual(errors,[]);
 });
 }finally{await context.close();}
}
