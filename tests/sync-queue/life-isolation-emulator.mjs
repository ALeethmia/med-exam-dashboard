import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LIFE_PATHS} from '../../src/study/life-isolation.js';
export async function verifyLifeIsolation({page,context,base,read,admin,check,load,domain}){
 const old='fixture-life-1',next='fixture-life-2',prefix=g=>'users/fixture-A/lifeV1/'+g;
 const course=await read(domain),other=await read('users/fixture-B'),xp=await read('gamification');
 const day=await page.evaluate(()=>studyDateKey());
 const until=async(path,predicate)=>{for(let i=0;i<150;i++){const value=await read(path);if(predicate(value))return value;await new Promise(r=>setTimeout(r,100));}assert.fail('No server confirmation for '+path);};
 async function addTask(target,title){await target.evaluate(title=>{switchTab('home');[...document.querySelectorAll('button')].find(e=>e.textContent==='規劃今日任務').click();document.querySelector('#task-custom').value=title;document.querySelector('#planner-form').requestSubmit();},title);}
 await check('life: actual habit and training UI persist only to the bound UID/generation',async()=>{
  await page.evaluate(()=>lifeHabits.set('daily-game',true));await until(prefix(old)+'/habits/'+day,v=>v?.['daily-game']===true);
  await page.evaluate(()=>{switchTab('exercise');document.querySelector('#training-settings').click();document.querySelector('#training-mode').value='alternative';document.querySelector('#training-settings-form').requestSubmit();});
  await until(prefix(old)+'/training',v=>v?.trainingMode==='alternative');
 });
 await check('life: actual capacity settings and Planner task UI save without minting XP',async()=>{
  await page.evaluate(()=>{switchTab('plan');document.querySelector('#study-capacity-settings').click();document.querySelector('#adaptive-exam-date').value='2027-01-20';document.querySelector('#adaptive-settings-form').requestSubmit();});
  await until(prefix(old)+'/adaptiveStudy/settings',v=>v?.examDate==='2027-01-20');await addTask(page,'generation-one-task');
  const tasks=await until(prefix(old)+'/planner/tasks',v=>Object.values(v||{}).some(t=>t.title==='generation-one-task'));assert(Object.values(tasks).every(t=>!t.award));
 });
 await check('life: time-task Store, real calendar form and checklist handler use their new buckets',async()=>{
  await page.evaluate(async()=>{const {createTimeTasks}=await import('/time-tasks.js');window.lifeTimeFixture=createTimeTasks({db:learningDB,localOnly:false,day:studyDateKey(),onChange(){}});lifeTimeFixture.set('morning',true);});
  await until(prefix(old)+'/timeTasks/'+day+'/morning',v=>v?.complete===true&&!v.awarded);
  await page.evaluate(day=>{openEventModal(day);document.querySelector('#modal-event-input').value='generation-one-event';saveCustomEvent();closeEventModal();},day);
  await until(prefix(old)+'/custom_events/'+day,v=>JSON.stringify(v).includes('generation-one-event'));
  await page.evaluate(()=>{switchTab('plan');document.querySelector('#checklist-container input[type=checkbox]').click();});
  await until(prefix(old)+'/checklist',v=>v&&Object.keys(v).length>0);
  assert.deepEqual(await read('gamification'),xp);assert.deepEqual(await read(domain),course);
 });
 await check('life: duplicate same-UID Auth notification does not retire the live generation',async()=>{
  await page.evaluate(async()=>lifeAuthFixture({uid:'fixture-A',displayName:'Synthetic Emulator'}));assert.equal(await page.evaluate(()=>lifeSession.valid()),true);assert.equal(await page.evaluate(()=>i3Runtime.read().status),'ready');
 });
 await check('life: ordinary clients cannot edit/delete control, escape UID, or replace namespace ancestors',async()=>{
  const before=await read('');const results=await page.evaluate(async({old,next})=>{
   const origin=new URL(firebase.database().ref().toString());if(origin.hostname!=='127.0.0.1')throw Error('loopback only');
   const app=firebase.initializeApp({...firebase.app().options},'life-attacker'),db=app.database();db.useEmulator('127.0.0.1',Number(origin.port),{mockUserToken:{sub:'fixture-A',user_id:'fixture-A'}});const out=[];
   for(const path of ['users/fixture-A/lifeControl','users/fixture-A/lifeControl/generation','users/fixture-A/lifeV1','users/fixture-A/lifeV1/'+old,'users/fixture-B/lifeV1/'+old+'/habits/x'])try{await db.ref(path).set(path.endsWith('generation')?next:{generation:next,schema:1,era:1});out.push(false);}catch(e){out.push(String(e.code??e.message).toUpperCase()==='PERMISSION_DENIED');}
   for(const path of ['users/fixture-B/lifeControl','users/fixture-B/lifeV1/'+old])try{await db.ref(path).once('value');out.push(false);}catch(e){out.push(String(e.code??e.message).toUpperCase()==='PERMISSION_DENIED');}await app.delete();return out;
  },{old,next});assert(results.every(v=>v===true),JSON.stringify(results));assert.deepEqual(await read(''),before);
 });
 let retained;
 await check('life: offline pending for all seven groups is durably saved in generation one',async()=>{
  await page.evaluate(()=>firebase.database().goOffline());await page.waitForFunction(()=>document.querySelector('#sync-status').textContent.includes('離線'));
  await addTask(page,'must-not-resurrect');
  await page.evaluate(day=>{
   lifeHabits.set('daily-game',false);lifeTimeFixture.set('morning',false);
   switchTab('exercise');document.querySelector('#training-settings').click();document.querySelector('#training-mode').value='general';document.querySelector('#training-settings-form').requestSubmit();
   switchTab('plan');document.querySelector('#study-capacity-settings').click();document.querySelector('#adaptive-exam-date').value='2027-02-01';document.querySelector('#adaptive-settings-form').requestSubmit();
   openEventModal(day);document.querySelector('#modal-event-input').value='must-not-resurrect-event';saveCustomEvent();closeEventModal();
   document.querySelector('#checklist-container input[type=checkbox]').click();
  },day);
  retained=await page.evaluate(()=>Object.fromEntries(Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).filter(k=>k.includes('life_v1:fixture-life-1:')).map(k=>[k,localStorage.getItem(k)])));
  assert(JSON.stringify(retained).includes('must-not-resurrect'));for(const key of ['daily_planner','life_v1','adaptive_study','time_tasks','pending_writes'])assert(Object.keys(retained).some(k=>k.includes('med_exam_'+key)));
 });
 let fresh;
 await check('life: synthetic reset and fresh tab ignore old pending/cache; new progress keeps working',async()=>{
  await admin('users/fixture-A/lifeControl',{schema:1,generation:next,era:1});
  fresh=await context.newPage();await fresh.goto(base);await fresh.waitForFunction(()=>window.updateWorkspace&&i3Runtime.read().status==='ready');
  assert.equal(await fresh.evaluate(()=>lifeSession.generation),next);assert.equal(await fresh.evaluate(()=>learningStorage.getItem('med_exam_pending_writes_v1')),null);
  assert.equal(await read(prefix(next)),null);assert.equal(await fresh.evaluate(()=>readCalendarEvents()[studyDateKey()]?.some(e=>e.text==='must-not-resurrect-event')||false),false);
  await addTask(fresh,'generation-two-task');await until(prefix(next)+'/planner/tasks',v=>Object.values(v||{}).some(t=>t.title==='generation-two-task'));
  assert(!JSON.stringify(await read(prefix(next))).includes('must-not-resurrect'));assert.deepEqual(await read(domain),course);
 });
 await check('life: offline old tab reconnect/reload cannot rebind stale operations into the new generation',async()=>{
  await page.evaluate(()=>firebase.database().goOnline());await page.waitForFunction(()=>window.lifeSession?.generation==='fixture-life-2'&&i3Runtime.read().status==='ready');
  assert(!JSON.stringify(await read(prefix(next))).includes('must-not-resurrect'));
  const keys=await page.evaluate(()=>Object.keys(localStorage));for(const key of Object.keys(retained))assert(keys.includes(key),'Old pending must be retained, not silently erased');
 });
 await check('life: old generation set/update/transaction and mixed batches are rejected atomically',async()=>{
  const before=await read('');const results=await fresh.evaluate(async({old,next,buckets})=>{
   const db=firebase.database(),out=[];for(const bucket of buckets)for(const kind of ['set','transaction'])try{const ref=db.ref('users/fixture-A/lifeV1/'+old+'/'+bucket+'/stale');await (kind==='set'?ref.set({stale:true}):ref.transaction(()=>({stale:true})));out.push(false);}catch(e){out.push(String(e.code??e.message).toUpperCase()==='PERMISSION_DENIED');}
   try{await db.ref().update({['users/fixture-A/lifeV1/'+old+'/habits/stale']:true,['users/fixture-A/lifeV1/'+next+'/habits/partial']:true});out.push(false);}catch(e){out.push(String(e.code??e.message).toUpperCase()==='PERMISSION_DENIED');}return out;
  },{old,next,buckets:Object.values(LIFE_PATHS)});assert.equal(results.length,15);assert(results.every(v=>v===true),JSON.stringify(results));assert.deepEqual(await read(''),before);
 });
 await check('life: relogin with only historical local data still starts in the server generation',async()=>{
  const relog=await page.context().browser().newContext();await relog.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  try{await relog.addInitScript(entries=>{for(const [key,value] of Object.entries(entries))localStorage.setItem(key,value);},retained);const p=await relog.newPage();await p.goto(base);await p.waitForFunction(()=>window.updateWorkspace&&i3Runtime.read().status==='ready');assert.equal(await p.evaluate(()=>lifeSession.generation),next);assert(!await p.locator('#task-list').textContent().then(s=>s.includes('must-not-resurrect')));}finally{await relog.close();}
 });
 await check('life: quota failure is not saved, stops further writes, and reload restores only durable state',async()=>{
  const before=await read(prefix(next));await fresh.evaluate(()=>{window.originalLifeSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.includes('life_v1:fixture-life-2:med_exam_daily_planner'))throw new DOMException('Synthetic quota','QuotaExceededError');return originalLifeSet.call(this,key,value);};});
  await addTask(fresh,'quota-must-not-save');assert.equal(await fresh.evaluate(()=>i3Runtime.read().status),'error');assert.equal(await fresh.evaluate(()=>lifeSession.valid()),false);assert.deepEqual(await read(prefix(next)),before);
  await fresh.evaluate(()=>Storage.prototype.setItem=originalLifeSet);await fresh.reload();await fresh.waitForFunction(()=>window.updateWorkspace&&i3Runtime.read().status==='ready');assert(!JSON.stringify(await read(prefix(next))).includes('quota-must-not-save'));
 });
 await check('life: every new bucket remains usable after reset, with no XP or other UID/course changes',async()=>{
  const values={['habits/'+day]:{'daily-exam':true},'questOS/v1/training/paused':false,'questOS/v1/adaptiveStudy/settings/examDate':'2027-01-16',['gamification/v2/timeTasks/'+day+'/morning']:{complete:true,hours:2},'gamification/v3/planner/tasks/post-reset-proof':{title:'post-reset-proof',date:day,complete:false,deleted:false,order:1,createdAt:1},['custom_events/'+day]:[{id:'post-reset-proof',text:'new event',color:'emerald'}],'checklist/1':true};
  for(const [path,value] of Object.entries(values)){
   await fresh.evaluate(async({path,value})=>learningDB.ref(path).set(value),{path,value});
   const logical=Object.keys(LIFE_PATHS).find(key=>path===key||path.startsWith(key+'/'));
   assert.deepEqual(await read(prefix(next)+'/'+LIFE_PATHS[logical]+path.slice(logical.length)),value);
  }
  assert.deepEqual(await read('gamification'),xp);assert.deepEqual(await read(domain),course);assert.deepEqual(await read('users/fixture-B'),other);
 });
 await check('life: delayed control startup recovers a readiness timeout without a manual retry',async()=>{
  const p=await context.newPage();
  const source=readFileSync(new URL('../../src/study/life-isolation.js',import.meta.url),'utf8');
  await p.route('**/src/study/life-isolation.js',route=>route.fulfill({contentType:'text/javascript',body:source.replace("  ref.on('value',receive,error=>retire(error));","  window.i3Runtime.lifecycle.fail('read/timeout');ref.on('value',receive,error=>retire(error));")}));
  await p.goto(base);await p.waitForFunction(()=>window.updateWorkspace&&i3Runtime.read().status==='ready');assert.equal(await p.evaluate(()=>lifeSession.generation),next);await p.close();
 });
 await fresh.close();await load();
}
