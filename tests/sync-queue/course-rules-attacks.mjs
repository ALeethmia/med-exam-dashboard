// Exercised against the same loopback SDK/Rules as the actual Becoming flows.
import assert from 'node:assert/strict';
import {courses,makeCourseRules,makeFrozenCourseRules} from '../../scripts/course-rules-candidate.mjs';
import {randomUUID} from 'node:crypto';
export async function createRulesAttacker(page){
 await page.evaluate(()=>{
  const origin=new URL(firebase.database().ref().toString());if(origin.hostname!=='127.0.0.1')throw Error('loopback only');
  const app=firebase.initializeApp({...firebase.app().options},'rules-attacker');
  window.rulesAttackDatabase=app.database();window.rulesAttackDatabase.useEmulator('127.0.0.1',Number(origin.port),{mockUserToken:{sub:'fixture-A',user_id:'fixture-A'}});
 });
}
export async function verifyCourseRules({page,read,admin,domain,initial,check}){
 await createRulesAttacker(page);
 const date='2026-10-03',id=randomUUID(),key='videos__1';
 const current=await read(domain),clock=current.clock;
 const attacks=[
  ['Boolean child without version',domain+'/courses/videos/1','set',!current.courses.videos[1]],
  ['root document Boolean overwrite without version',domain,'set',{...current,courses:{...current.courses,videos:{...current.courses.videos,1:!current.courses.videos[1]}},clock:clock+1}],
  ['Boolean plus clock without version',domain,'update',{'courses/videos/1':!current.courses.videos[1],clock:clock+1}],
  ['version child without Boolean',domain+'/versions/'+key,'set',id],
  ['version plus clock without Boolean',domain,'update',{['versions/'+key]:id,clock:clock+1}],
  ['orphan version disguised by another valid Boolean transition',domain,'update',{'versions/videos__3':id,'courses/videos/2':true,'versions/videos__2':id,clock:clock+1}],
  ['version edit with an unrelated UUID witness',domain,'update',{['versions/'+key]:id,'courses/videos/2':true,'versions/videos__2':randomUUID(),clock:clock+1}],
  ['version substitution coupled only to a date',domain,'update',{['versions/'+key]:id,['firstCompletion/'+key]:{day:date,_version:id},clock:clock+1}],
  ['Boolean and version without clock',domain,'update',{'courses/videos/1':!current.courses.videos[1],['versions/'+key]:id}],
  ['Boolean with unchanged old version and clock',domain,'update',{'courses/videos/1':!current.courses.videos[1],['versions/'+key]:current.versions[key],clock:clock+1}],
  ['invalid version identifier',domain,'update',{'courses/videos/1':!current.courses.videos[1],['versions/'+key]:'forged',clock:clock+1}],
  ['delete course Boolean',domain+'/courses/videos/1','set',null],
  ['delete version tombstone',domain+'/versions/'+key,'set',null],
  ['delete date record tombstone',domain+'/firstCompletion/'+key,'set',null],
  ['date version child without clock',domain+'/firstCompletion/'+key+'/_version','set',id],
  ['edit date child without fresh version',domain+'/firstCompletion/'+key+'/day','set',date],
  ['date edit with reused version and incremented clock',domain,'update',{['firstCompletion/'+key+'/day']:date,clock:clock+1}],
  ['delete date child without fresh version',domain+'/firstCompletion/biochem__1/day','set',null],
  ['unknown course ID and companion version',domain,'update',{'courses/videos/unknown':true,'versions/videos__unknown':id,clock:clock+1}],
  ['unknown date ID',domain+'/firstCompletion/unknown','set',{day:date,_version:id}],
  ['Boolean type confusion',domain+'/courses/videos/1','set',1],
  ['clear all course/version tombstones',domain,'update',{courses:null,versions:null,clock:clock+1}],
  ['extra canonical field',domain+'/unexpected','set',true],
  ['extra date field',domain+'/firstCompletion/'+key+'/unexpected','set',true],
  ['invalid day format',domain,'update',{['firstCompletion/'+key]:{day:'tomorrow',_version:id},clock:clock+1}],
  ['fractional clock',domain+'/clock','set',clock+0.5],
  ['clock jump',domain+'/clock','set',clock+2],
  ['clock reversal',domain+'/clock','set',clock-1],
  ['generation child edit',domain+'/generation','set','forged-generation'],
  ['generation and era rotation',domain,'update',{generation:'forged-generation',era:current.era+1,clock:0}],
  ['era deletion',domain+'/era','set',null],
  ['document deletion',domain,'set',null],
  ['user ancestor replacement','users/fixture-A','set',{learningV3:{...initial,generation:'forged-generation'}}],
  ['root replacement','','set',{users:{'fixture-A':{learningV3:current}}}],
  ...['videos/1','biochem/1','physiology/fc_p_1_a','pharmacology/1','questOS/v1/courseFirstCompletion/videos__1','questOS/v1/courseSyncV2/gate','gamification/v1/days/security-proof','gamification/v1/awards/security-proof'].map(p=>['retired '+p,p,'set',true]),
  ['ancestor questOS replacement','questOS','set',{v1:{courseFirstCompletion:{old:{day:date}}}}],
  ['mixed root multi-update','','update',{'videos/1':true,'habits/must-not-write':true}],
  ['encoded retired multi-update','','update',{'questOS/v1/courseFirstCompletion/videos__1':{day:date},'gamification/v1/awards/must-not-write':{xp:20}}],
  ['cross-UID write','users/fixture-B/learningV3/courses/videos/1','set',true]
 ];
 for(const [name,path,method,value] of attacks){
  await check('Rules DENY '+name,async()=>{
   const before=await read('');
   const result=await page.evaluate(async({path,method,value})=>{try{await (path?window.rulesAttackDatabase.ref(path):window.rulesAttackDatabase.ref())[method](value);return {code:'ALLOWED'};}catch(e){return {code:e.code,message:e.message};}},{path,method,value});
   assert.equal(result.code,'PERMISSION_DENIED',name+': '+JSON.stringify(result));assert.deepEqual(await read(''),before,'Rejected write must be atomic and leave ALL data unchanged');
  });
 }
 await check('Rules deny unauthenticated/other UID root, canonical and leaf reads/writes',async()=>{
  const before=await read('');
  const results=await page.evaluate(async({domain})=>{
   const existing=window.rulesAttackDatabase,host=existing.ref().toString();
   const origin=new URL(host),port=Number(origin.port),out=[];
   // Emulator host here is learned from the fixture SDK instance; no remote URL is accepted.
   if(origin.hostname!=='127.0.0.1')throw Error('loopback only');
   for(const uid of [null,'fixture-B']){
    const app=firebase.initializeApp({...firebase.app().options},'rules-'+(uid||'anonymous'));
    const db=app.database();db.useEmulator('127.0.0.1',port,uid?{mockUserToken:{sub:uid,user_id:uid}}:undefined);
    for(const path of ['',domain,domain+'/courses/videos/1','habits','gamification/v1/awards']){
     for(const method of ['read','write'])try{const ref=path?db.ref(path):db.ref();if(method==='read')await ref.once('value');else await ref.set(true);out.push(false);}catch(e){out.push(e.code==='PERMISSION_DENIED');}
    }
    await app.delete();
   }
   // Owner also cannot read another UID, an ancestor collection, or legacy data.
   for(const path of ['users/fixture-B/learningV3','users','videos','questOS/v1/courseFirstCompletion'])try{await existing.ref(path).once('value');out.push(false);}catch(e){out.push(e.code==='PERMISSION_DENIED');}
   return out;
  },{domain});assert.equal(results.length,24);assert(results.every(Boolean));assert.deepEqual(await read(''),before);
 });
 await check('Rules allow a valid child multi-update only when the complete merged contract is valid',async()=>{
  const before=await read(domain),id=randomUUID();
  await page.evaluate(async({domain,id,clock})=>window.rulesAttackDatabase.ref(domain).update({'courses/videos/1':false,'versions/videos__1':id,clock:clock+1}),{domain,id,clock:before.clock});
  const after=await read(domain);assert.equal(after.courses.videos[1],false);assert.equal(after.versions.videos__1,id);assert.equal(after.clock,before.clock+1);
 });
 await check('Rules permit unchanged SDK transaction retry without incrementing clock',async()=>{
  const before=await read(domain);
  await page.evaluate(async domain=>window.rulesAttackDatabase.ref(domain).transaction(value=>value,undefined,false),domain);
  assert.deepEqual(await read(domain),before);
 });
 await check('actual Becoming writer saves all 115 members atomically and confirms pending',async()=>{
  const before=await read(domain),changes=Object.fromEntries(courses.map(c=>[c.path+'/'+c.id,false]));
  const id=await page.evaluate(changes=>courseSync.enqueue(changes).id,changes);
  await page.waitForFunction(()=>!courseSync.inspect().pending.length,null,{timeout:15000});
  const after=await read(domain);for(const c of courses){assert.equal(after.courses[c.path][c.id],false);assert.equal(after.versions[c.key],id);}assert.equal(after.clock,before.clock+1);
 });
 await check('maintenance Rules deny canonical and every shared writer while retaining owner reads',async()=>{
  const before=await read('');await admin('.settings/rules',makeFrozenCourseRules('fixture-A'));
  try{
   const result=await page.evaluate(async domain=>{
    const db=window.rulesAttackDatabase,denied=[];
    const doc=(await db.ref(domain).once('value')).val(),id=crypto.randomUUID();
    const legal={...doc,courses:{...doc.courses,videos:{...doc.courses.videos,1:!doc.courses.videos[1]}},versions:{...doc.versions,videos__1:id},clock:doc.clock+1};
    for(const path of [domain,'habits/blocked','gamification/v2/timeTasks/blocked','gamification/v3/planner/tasks/blocked','questOS/v1/training/blocked','questOS/v1/adaptiveStudy/settings/blocked','custom_events/blocked','checklist/blocked'])try{await db.ref(path).set(path===domain?legal:true);denied.push(false);}catch(e){denied.push(e.code==='PERMISSION_DENIED');}
    const value=(await db.ref(domain).once('value')).val();return {denied,clock:value.clock};
   },domain);
   assert.equal(result.denied.length,8);assert(result.denied.every(Boolean));assert.equal(result.clock,(await read(domain)).clock);assert.deepEqual(await read(''),before);
  }finally{await admin('.settings/rules',makeCourseRules('fixture-A'));}
 });
 await check('shared legacy life/time-task/planner writers remain allowed for owner: full-reset blocker is real',async()=>{
  const before=await read('');
  const paths=['habits/security-proof','gamification/v2/timeTasks/security-proof','gamification/v3/planner/tasks/security-proof','questOS/v1/training/security-proof','questOS/v1/adaptiveStudy/settings/security-proof','custom_events/security-proof','checklist/security-proof'];
  await page.evaluate(async paths=>{for(const path of paths)await window.rulesAttackDatabase.ref(path).set({oldWriter:true});},paths);
  for(const path of paths)assert.deepEqual(await read(path),{oldWriter:true});
  // Only synthetic test data, restore the fixture so XP/history invariance checks remain meaningful.
  await admin('',before);
 });
}
