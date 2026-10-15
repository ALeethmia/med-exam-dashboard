// Standalone synthetic integration. Starts its OWN ephemeral loopback emulator; no remote URL option.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {createServer as tcpServer} from 'node:net';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const jar=process.env.B2B1_EMULATOR_JAR,sdk=process.env.FIREBASE_SDK_DIR;
const hashes={'firebase-app-compat.js':'2d038b9f99cdc28119b4e5c2a4ed86d561fc36c051e515ef35176b1cabe780c1','firebase-database-compat.js':'1fdd331f8fd0448f9d7ce97573cb828a83aad7a7bb2c4da0e75fdb9563eef129'};
assert(jar&&sdk,'Set B2B1_EMULATOR_JAR (4.11.2) and FIREBASE_SDK_DIR (9.22.0).');
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
assert.equal(hash(jar),'b70d99344caf17c98b6f910fa8f6edf32a7c016cb1035e8915f70d38901eb97f');
for(const [file,value] of Object.entries(hashes))assert.equal(hash(sdk+'/'+file),value);
const probe=tcpServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const child=spawn('java',['-Xmx256m','-jar',jar,'--host','127.0.0.1','--port',String(port)],{stdio:['ignore','pipe','pipe']});
const ns='demo-becoming-durable-courses',origin='http://127.0.0.1:'+port;
let server,browser;const all=setTimeout(()=>{child.kill('SIGKILL');process.exitCode=1;},90000);
try{
 await new Promise((resolve,reject)=>{let log='';const timeout=setTimeout(()=>reject(Error('Emulator startup timeout')),20000);const data=b=>{log+=b;if(log.includes('Listening at 127.0.0.1:'+port)){clearTimeout(timeout);resolve();}};child.stdout.on('data',data);child.stderr.on('data',data);child.once('error',reject);child.once('exit',()=>reject(Error('Emulator exited')));});
 const endpoint=p=>origin+'/'+p+'.json?ns='+ns;
 await new Promise((resolve,reject)=>{let n=0;const tryRead=()=>fetch(endpoint('')).then(()=>resolve(),()=>{if(++n>100)reject(Error('Emulator HTTP not ready'));else setTimeout(tryRead,100);});tryRead();});
 async function admin(p,value){const r=await fetch(endpoint(p),{method:'PUT',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify(value)});assert(r.ok);}
 async function read(p){const r=await fetch(endpoint(p),{headers:{Authorization:'Bearer owner'}});assert(r.ok);return r.json();}
 await admin('.settings/rules',{rules:{'.read':"auth != null && auth.uid === 'fixture-A'",'.write':"auth != null && auth.uid === 'fixture-A'"}});
 const history={questOS:{v1:{courseFirstCompletion:{old:{day:'2026-01-01',_version:'historical'}}}},gamification:{v1:{awards:{old:{xp:20}}}}};await admin('',history);
 server=createServer((req,res)=>{const file=new URL(req.url,'http://127.0.0.1').pathname;if(file==='/'){res.setHeader('Content-Type','text/html');return res.end('<title>B2-B.1 Emulator only</title>');}if(!['/src/study/course-sync.js','/account-storage.js'].includes(file)){res.statusCode=404;return res.end();}res.setHeader('Content-Type','text/javascript');res.end(readFileSync(new URL('../..'+file,import.meta.url)));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,args:['--no-sandbox']});
 const context=await browser.newContext(),page=await context.newPage();let external=0;
 await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname==='127.0.0.1')return r.continue();external++;return r.abort();});
 await page.goto('http://127.0.0.1:'+server.address().port);
 for(const file of Object.keys(hashes))await page.addScriptTag({content:readFileSync(sdk+'/'+file,'utf8')});
 await page.evaluate(async({ns,port})=>{
  firebase.initializeApp({projectId:ns,databaseURL:'https://'+ns+'.firebaseio.com'});
  window.db=firebase.database();db.useEmulator('127.0.0.1',port,{mockUserToken:{sub:'fixture-A',user_id:'fixture-A'}});
  const {createAccountStorage}=await import('/account-storage.js');
  const {createCourseSync}=await import('/src/study/course-sync.js');
  window.account=createAccountStorage(localStorage);account.bind('fixture-A');window.storage=account.view();window.online=true;window.calls=0;window.dates={};
  const original=db.ref.bind(db);window.sdk={ref(path=''){const ref=path?original(path):original();return {on:(...a)=>ref.on(...a),off:(...a)=>ref.off(...a),transaction:(...a)=>ref.transaction(...a),update:patch=>{calls++;return ref.update(patch);}};}};
  window.start=()=>window.engine=createCourseSync({storage,uid:'fixture-A',valid:()=>account.read().bound,ready:()=>online,locks:navigator.locks,prepareDates:changes=>Object.fromEntries(Object.entries(changes).filter(([,v])=>v).map(([p])=>[p,'2026-10-15'])),acceptDates:input=>{for(const [path,day] of Object.entries(input))dates[path]??=day;return true;}});
  start();engine.attach(sdk);
 },{ns,port});
 async function wait(test){try{await page.waitForFunction(test,null,{timeout:15000});}catch(error){console.log('Diagnostic',await page.evaluate(()=>engine.inspect()));throw error;}}
 async function check(name,fn){await fn();console.log('PASS '+name);}
 await check('real SDK reserves then acknowledges one atomic chapter update',async()=>{
  await page.evaluate(()=>engine.enqueue({'videos/1':true,'videos/2':true}));await wait(()=>engine.inspect().pending.length===0&&calls===1);
  assert.equal((await read('videos'))[1],true);assert.equal((await read('videos'))[2],true);
 });
 await check('offline local batch remains queued; reconnect drains without review',async()=>{
  await page.evaluate(async()=>{online=false;db.goOffline();engine.enqueue({'physiology/fc_p_1_a':true,'physiology/fc_p_1_c':true});await engine.pump();});assert.equal(await page.evaluate(()=>calls),1);
  await page.evaluate(()=>{db.goOnline();online=true;return engine.pump();});await wait(()=>engine.inspect().pending.length===0&&calls===2);
  assert.deepEqual(await read('physiology'),{fc_p_1_a:true,fc_p_1_c:true});
 });
 await check('true-false-true and same-value save keep distinct generations without extra no-op writes',async()=>{
  await page.evaluate(async()=>{engine.enqueue({'videos/1':false},{baseline:{'videos/1':true}});engine.enqueue({'videos/1':true});await engine.pump();});await wait(()=>engine.inspect().pending.length===0&&calls===4);
  const noop=await page.evaluate(()=>engine.enqueue({'videos/1':true},{baseline:{'videos/1':true}}));assert.equal(noop.noop,true);assert.equal(await read('videos/1'),true);
 });
 await check('SDK commit with local settlement failure recovers after reinitialization from exact server receipt',async()=>{
  await page.evaluate(async()=>{window.remove=Storage.prototype.removeItem;Storage.prototype.removeItem=function(k){if(k.includes('med_exam_course_write_v2:'))throw Error('synthetic disk');return remove.call(this,k);};engine.enqueue({'biochem/1':true});await engine.pump();});assert.equal(await read('biochem/1'),true);
  await page.evaluate(async()=>{engine.close();Storage.prototype.removeItem=remove;start();engine.attach(sdk);await engine.pump();});await wait(()=>engine.inspect().pending.length===0);assert.equal(await page.evaluate(()=>calls),5);
 });
 await check('stale device cannot silently overwrite a newer revision, including same Boolean ABA',async()=>{
  // A queued request retains the base revision from before the other device's change.
  await page.evaluate(()=>{online=false;engine.enqueue({'videos/1':false},{baseline:{'videos/1':true}});});
  const root=await read('');root.videos[1]=true;root.questOS.v1.courseSyncV2.versions.videos__1='synthetic-other-device-ABA';await admin('',root);
  await page.evaluate(()=>{online=true;return engine.pump();});await wait(()=>engine.inspect().pending.some(r=>r.phase==='review'));assert.equal(await read('videos/1'),true);assert.equal(await page.evaluate(()=>calls),5);
  await page.evaluate(async()=>{await engine.resolve('videos/1',false);await engine.pump();});await wait(()=>engine.inspect().pending.length===0);
 });
 await check('actual write permission refusal is preserved and never automatically resent',async()=>{
  // Deny only course writes so reservation can finish but the one group update is rejected.
  await admin('.settings/rules',{rules:{'.read':true,'.write':false,questOS:{'.write':true},videos:{'.write':false}}});
  // Root reservation also requires root permission; deny it and verify no course call follows.
  await page.evaluate(()=>engine.enqueue({'videos/denied':true}));await wait(()=>engine.inspect().unknown);const calls=await page.evaluate(()=>window.calls);for(let i=0;i<3;i++)await page.evaluate(()=>engine.pump());assert.equal(await page.evaluate(()=>window.calls),calls);assert.equal(await read('videos/denied'),null);
 });
 await check('history and XP untouched; no non-loopback browser requests',async()=>{
  assert.deepEqual(await read('gamification'),history.gamification);assert.deepEqual(await read('questOS/v1/courseFirstCompletion'),history.questOS.v1.courseFirstCompletion);assert.equal(external,0);
 });
 console.log('Durable course Emulator checks passed: 7 (SDK 9.22.0 / Emulator 4.11.2 / Chromium; synthetic UID only).');
}finally{clearTimeout(all);await browser?.close();if(server)await new Promise(r=>server.close(r));child.kill('SIGTERM');}
