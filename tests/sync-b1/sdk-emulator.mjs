// Research only. Never imported by the application; refuses non-loopback endpoints.
import assert from 'node:assert/strict';
import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
const origin=process.env.B1_EMULATOR_ORIGIN||'http://127.0.0.1:9199';
assert.equal(new URL(origin).hostname,'127.0.0.1');assert.equal(new URL(origin).protocol,'http:');
const ns='demo-becoming-sync-b1',sdk=process.env.FIREBASE_SDK_DIR;
assert(sdk,'Set FIREBASE_SDK_DIR to the existing Firebase 9.22.0 compat files.');
const endpoint=p=>origin+'/'+p+'.json?ns='+ns;
async function admin(path,body){const r=await fetch(endpoint(path),{method:'PUT',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify(body)});assert(r.ok,await r.text());}
const rules={rules:{'.read':"auth != null && auth.uid === 'fixture-owner'",'.write':"auth != null && auth.uid === 'fixture-owner'"}};
console.log('Starting synthetic Rules setup');await admin('.settings/rules',rules);
await admin('',{physiology:{fc_p_1_a:true},questOS:{v1:{courseFirstCompletion:{physiology__fc_p_1_a:{day:'2026-01-01',_version:'historical'}}}},gamification:{v1:{awards:{old:{xp:20,day:'2026-01-01'}}}}});
console.log('Synthetic database seeded');
const browser=await chromium.launch({executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,args:['--no-sandbox']});
const page=await browser.newPage(),external=[];const results=[],observations=[];
await page.route('**/*',r=>{const u=new URL(r.request().url());return u.hostname==='127.0.0.1'?r.continue():(external.push(u.hostname),r.abort());});
try{
 await page.goto(origin+'/.json?ns='+ns,{waitUntil:'domcontentloaded',timeout:10000});console.log('Local browser origin ready');
 await page.setContent('<title>B1 SDK Emulator research</title>');
 for(const name of ['firebase-app-compat.js','firebase-database-compat.js'])await page.addScriptTag({content:readFileSync(sdk+'/'+name,'utf8')});
 await page.evaluate(({port,ns})=>{
  if(firebase.SDK_VERSION!=='9.22.0')throw Error('Expected actual production SDK 9.22.0');
  firebase.initializeApp({projectId:ns,databaseURL:'https://'+ns+'.firebaseio.com'});
  window.db=firebase.database();db.useEmulator('127.0.0.1',port,{mockUserToken:{sub:'fixture-owner',user_id:'fixture-owner'}});
  window.logs=[];firebase.database.enableLogging(line=>logs.push(line));
 },{port:Number(new URL(origin).port),ns});
 console.log('SDK initialized');
 const check=async(name,fn)=>{await fn();results.push({name,passed:true});console.log('PASS '+name);};
 await page.evaluate(async()=>{window.ref=db.ref('physiology/fc_p_1_a');ref.on('value',()=>{});await Promise.race([ref.once('value'),new Promise((_,reject)=>setTimeout(()=>reject(Error('Initial SDK read timeout')),12000))]);});
 await check('matching true is confirmed only after successful server transaction completion',async()=>{
  const r=await page.evaluate(async()=>{const r=await ref.transaction(v=>v,undefined,false);return {committed:r.committed,value:r.snapshot.val()};});assert.deepEqual(r,{committed:true,value:true});
 });
 await page.evaluate(()=>db.goOffline());
 await admin('physiology/fc_p_1_a',false);
 await check('once can return cached true while server is false',async()=>assert.equal(await page.evaluate(async()=>(await ref.once('value')).val()),true));
 await check('SDK get may also use an active-query cache',async()=>assert.equal(await page.evaluate(async()=>(await ref.get()).val()),true));
 await check('an updater returning undefined aborts locally without a server confirmation',async()=>{
  const r=await page.evaluate(async()=>{const r=await ref.transaction(()=>undefined,undefined,false);return r.committed;});assert.equal(r,false);
 });
 await page.evaluate(()=>{window.finished=false;window.probe=ref.transaction(v=>v,undefined,false).then(r=>{finished=true;return {committed:r.committed,value:r.snapshot.val()};});});
 await check('no-op transaction has no success acknowledgement while disconnected',async()=>{await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>finished),false);});
 await check('reconnect retries stale hash; no-op result is server false, never the cached true',async()=>{
  const r=await page.evaluate(async()=>{db.goOnline();return await probe;});assert.deepEqual(r,{committed:true,value:false});
  const s=await (await fetch(endpoint('physiology/fc_p_1_a'),{headers:{Authorization:'Bearer owner'}})).json();assert.equal(s,false);
 });
 await check('no-op still sends a write protocol request; unchanged leaf emits no value change in this scenario',async()=>{
  const r=await page.evaluate(async()=>{let events=0;const cb=()=>events++;ref.on('value',cb);await new Promise(r=>setTimeout(r,50));events=0;logs.length=0;const result=await ref.transaction(v=>v,undefined,false);await new Promise(r=>setTimeout(r,50));ref.off('value',cb);return {events,committed:result.committed,put:logs.some(s=>s.includes('"a":"p"'))};});
  assert.deepEqual(r,{events:0,committed:true,put:true});
 });
 await admin('.settings/rules',{rules:{'.read':true,'.write':false}});
 await check('read-only permissions allow a read but deny the no-op write transaction',async()=>{
  const r=await page.evaluate(async()=>{try{await ref.transaction(v=>v,undefined,false);return 'unexpected-success';}catch(e){return String(e.code||e.message||e);}});assert.match(r,/permission.denied/i);
 });
 await admin('.settings/rules',rules);
 await check('synthetic owner-only rules reject another UID',async()=>{
  const r=await page.evaluate(async({port,ns})=>{const app=firebase.initializeApp({projectId:ns,databaseURL:'https://'+ns+'.firebaseio.com'},'foreign');const foreign=app.database();foreign.useEmulator('127.0.0.1',port,{mockUserToken:{sub:'fixture-B',user_id:'fixture-B'}});try{await foreign.ref('physiology/fc_p_1_a').once('value');return 'unexpected-success';}catch(e){return String(e.code||e.message||e);}finally{foreign.goOffline();}},{port:Number(new URL(origin).port),ns});assert.match(r,/permission.denied/i);
 });
 await check('concurrent set/update can cancel or order a transaction; cannot assume independent operations',async()=>{
  const r=await page.evaluate(async()=>{db.goOffline();let outcome;const pending=ref.transaction(v=>v,undefined,false).then(r=>{outcome=r.committed?'committed':'aborted';},e=>{outcome=String(e.code||e.message||e);});const writing=db.ref().update({'physiology/fc_p_1_a':true});db.goOnline();await Promise.all([pending,writing]);return outcome;});
  assert(['set','aborted','committed'].includes(r),String(r));observations.push({scenario:'transaction overlaps SDK root update',outcome:r});
 });
 await check('historical date and XP stay unchanged by leaf probes',async()=>{
  const get=async p=>(await (await fetch(endpoint(p),{headers:{Authorization:'Bearer owner'}})).json());
  assert.deepEqual(await get('questOS/v1/courseFirstCompletion/physiology__fc_p_1_a'),{day:'2026-01-01',_version:'historical'});assert.deepEqual(await get('gamification/v1/awards/old'),{xp:20,day:'2026-01-01'});
 });
 await check('REST ETag read is server-backed and conditional writes reject a stale baseline',async()=>{
  const headers={Authorization:'Bearer owner','X-Firebase-ETag':'true'};
  const r=await fetch(endpoint('physiology/fc_p_1_a'),{headers});assert.equal(await r.json(),true);const etag=r.headers.get('etag');assert(etag);
  await admin('physiology/fc_p_1_a',false);
  const stale=await fetch(endpoint('physiology/fc_p_1_a'),{method:'PUT',headers:{Authorization:'Bearer owner','If-Match':etag},body:'true'});assert.equal(stale.status,412);
 });
 assert.deepEqual(external,[]);
 const report={sdk:'9.22.0 compat',environment:'RTDB Emulator 4.11.2; synthetic owner auth/rules, not Production Rules',results,observations,externalRequests:0,production:false,limitations:['No Cloud Functions trigger/billing proof','No real Firebase Rules export','No browser multi-tab scheduler simulation','No production auto-resolution implementation']};
 if(process.env.B1_REPORT)writeFileSync(process.env.B1_REPORT,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await page.evaluate(()=>db.goOffline()).catch(()=>{});await browser.close();}
