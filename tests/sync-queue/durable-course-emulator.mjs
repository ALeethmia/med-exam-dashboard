// Standalone synthetic integration. Starts its OWN ephemeral loopback emulator; no remote URL option.
import assert from 'node:assert/strict';
import {verifyCourseRules,createRulesAttacker} from './course-rules-attacks.mjs';
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
let server,browser;const all=setTimeout(()=>{child.kill('SIGKILL');process.exitCode=1;},360000);
try{
 await new Promise((resolve,reject)=>{let log='';const timeout=setTimeout(()=>reject(Error('Emulator startup timeout')),20000);const data=b=>{log+=b;if(log.includes('Listening at 127.0.0.1:'+port)){clearTimeout(timeout);resolve();}};child.stdout.on('data',data);child.stderr.on('data',data);child.once('error',reject);child.once('exit',()=>reject(Error('Emulator exited')));});
 const endpoint=p=>origin+'/'+p+'.json?ns='+ns;
 await new Promise((resolve,reject)=>{let n=0;const tryRead=()=>fetch(endpoint('')).then(()=>resolve(),()=>{if(++n>100)reject(Error('Emulator HTTP not ready'));else setTimeout(tryRead,100);});tryRead();});
 async function admin(p,value){const r=await fetch(endpoint(p),{method:'PUT',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify(value)});assert(r.ok);}
 async function read(p){const r=await fetch(endpoint(p),{headers:{Authorization:'Bearer owner'}});assert(r.ok);return r.json();}
 await admin('.settings/rules',JSON.parse(readFileSync(new URL('../fixtures/course-rules.json',import.meta.url))));
 const initial={schema:3,generation:'initial-v3',era:0,clock:0,courses:{},versions:{},firstCompletion:{}};
 const domain='users/fixture-A/learningV3';
 const history={gamification:{v1:{awards:{historical:{xp:20,day:'2026-10-01'}}}},physiology:{legacy:true},users:{'fixture-A':{},'fixture-B':{learningV3:{...initial,generation:'other-UID'}}}};await admin('',history);const otherUIDBefore=await read('users/fixture-B');
 const root=new URL('../../',import.meta.url);
 server=createServer((req,res)=>{
  const file=new URL(req.url,'http://127.0.0.1').pathname;
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.svg')?'image/svg+xml':'text/html');
  if(file==='/firebase-config.js')return res.end('window.examFirebaseConfig='+JSON.stringify({projectId:ns,databaseURL:'https://'+ns+'.firebaseio.com'})+';');
  if(file==='/owner-config.js')return res.end("export const OWNER_UID='fixture-A';");
  if(file==='/fixture-app.js'||file==='/fixture-db.js')return res.end(readFileSync(sdk+(file==='/fixture-app.js'?'/firebase-app-compat.js':'/firebase-database-compat.js')));
  if(file==='/fixture-auth.js')return res.end(`Object.defineProperty(window,'workspaceLocalOnly',{get:()=>false,set(){}});const original=firebase.database.bind(firebase);let instance;firebase.database=()=>{if(!instance){instance=original();instance.useEmulator('127.0.0.1',${port},{mockUserToken:{sub:'fixture-A',user_id:'fixture-A'}});}return instance;};let notify;const auth=()=>({onAuthStateChanged(fn){notify=fn;queueMicrotask(()=>fn({uid:'fixture-A',displayName:'Synthetic Emulator'}));},async signOut(){notify(null);}});auth.GoogleAuthProvider=class{};firebase.auth=auth;`);
  try{
   if(file==='/'||file==='/index.html')return res.end(readFileSync(new URL('index.html',root),'utf8').replace('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js','/fixture-app.js').replace('https://www.gstatic.com/firebasejs/9.22.0/firebase-database-compat.js','/fixture-db.js').replace('https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js','/fixture-auth.js'));
   if(!/^\/(src|styles|public)\//.test(file)&&!/^\/[a-z][a-z0-9-]*\.js$/.test(file))throw Error('invalid path');
   const path=new URL('.'+file,root);if(!path.href.startsWith(root.href))throw Error('invalid path');return res.end(readFileSync(path));
  }catch{res.statusCode=404;res.end();}
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,args:['--no-sandbox']});
 const context=await browser.newContext(),page=await context.newPage();let external=0;const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='127.0.0.1')return route.continue();external++;return route.abort();});
 const base='http://127.0.0.1:'+server.address().port;
 async function load(){await page.goto(base);await page.waitForFunction(()=>window.updateWorkspace&&window.i3Runtime.read().status==='ready');}
 async function drain(){try{await page.waitForFunction(()=>!window.courseSync.inspect().pending.length,null,{timeout:15000});}catch(error){console.log('DRAIN',JSON.stringify(await page.evaluate(()=>({sync:courseSync.inspect(),runtime:i3Runtime.read()}))));console.log('DOC',JSON.stringify(await read(domain)));throw error;}}
 let count=0;async function check(name,fn){const start=Date.now();await fn();count++;console.log('PASS '+name+' ('+(Date.now()-start)+'ms)');}
 await load();await createRulesAttacker(page);
 await check('Rules reject forged initialization and malformed containers before the first legitimate operation',async()=>{
  const before=await read('');
  for(const invalid of [{...initial,generation:'forged-initial'},{...initial,era:1},{...initial,courses:true},{...initial,courses:{videos:true}},{...initial,courses:{biochem:'injected'}},{...initial,versions:true},{...initial,firstCompletion:true}])assert.equal(await page.evaluate(async({domain,invalid})=>{try{await window.rulesAttackDatabase.ref(domain).set(invalid);return false;}catch(e){return e.code==='PERMISSION_DENIED';}},{domain,invalid}),true);
  assert.equal(await read(domain),null);assert.deepEqual(await read(''),before);
 });
 await check('actual Becoming checkbox, first date and chapter operation use one atomic per-UID document',async()=>{
  await page.evaluate(()=>showStudyItem('physiology','fc_p_1_a'));await page.locator('[data-study-key="physiology__fc_p_1_a"] input[type=checkbox]').check();await drain();
  let doc=await read(domain);assert.equal(doc.courses.physiology.fc_p_1_a,true);assert(doc.firstCompletion.physiology__fc_p_1_a.day);const before=doc.clock;
  await page.evaluate(()=>toggleAllChapter('甲',true));await drain();doc=await read(domain);assert.equal(doc.clock,before+1);assert.equal(doc.courses.physiology.fc_p_1_c,true);assert.deepEqual(await read('physiology'),history.physiology);
 });
 await check('offline UI save and reconnect automatically close pending without a review decision',async()=>{
  await page.evaluate(()=>firebase.database().goOffline());await page.waitForFunction(()=>document.querySelector('#sync-status').textContent.includes('離線'));
  await page.evaluate(()=>{setStudyCompletion('biochem','1',true);courseDates.set('biochem__1','2026-10-01');});assert((await page.evaluate(()=>courseSync.inspect().pending)).length>0);await page.evaluate(()=>firebase.database().goOnline());await drain();assert.equal((await read(domain)).courses.biochem[1],true);assert.equal((await read(domain)).firstCompletion.biochem__1.day,'2026-10-01');
 });
 await check('offline completion and date edit survive reload and reconnect without a false review',async()=>{
  const clock=(await read(domain)).clock;await page.evaluate(()=>firebase.database().goOffline());await page.waitForFunction(()=>document.querySelector('#sync-status').textContent.includes('離線'));
  await page.evaluate(()=>{setStudyCompletion('videos','7',true);courseDates.set('videos__7','2026-10-02');});await load();await drain();const doc=await read(domain);assert.equal(doc.clock,clock+2);assert.equal(doc.courses.videos[7],true);assert.equal(doc.firstCompletion.videos__7.day,'2026-10-02');
 });
 await check('acknowledgement lost after server commit and tab refresh cannot duplicate the mutation/date',async()=>{
  const clock=(await read(domain)).clock;await page.evaluate(()=>{const raw=firebase.database(),root='users/fixture-A/learningV3';let first=true;courseSync.attach({ref(path){const ref=raw.ref(path);return path===root?{on:(...a)=>ref.on(...a),off:(...a)=>ref.off(...a),transaction:(...a)=>ref.transaction(...a).then(result=>{if(first){first=false;throw Error('synthetic lost acknowledgement');}return result;})}:ref;}});setStudyCompletion('videos','1',true);});
  await page.evaluate(()=>courseSync.pump());const before=await read(domain);assert.equal(before.clock,clock+1);await load();await drain();const after=await read(domain);assert.equal(after.clock,before.clock);assert.deepEqual(after.firstCompletion.videos__1,before.firstCompletion.videos__1);
 });
 await check('single live Becoming tab retries a never-resolving acknowledgement and confirms with the server',async()=>{
  const clock=(await read(domain)).clock;await page.evaluate(()=>{const raw=firebase.database();let first=true;courseSync.attach({ref(path){const ref=raw.ref(path);return {...ref,on:(...a)=>ref.on(...a),off:(...a)=>ref.off(...a),transaction:(...a)=>ref.transaction(...a).then(result=>{if(first){first=false;return new Promise(()=>{});}return result;})};}});setStudyCompletion('videos','5',true);});
  await drain();assert.equal((await read(domain)).clock,clock+1);assert.equal((await read(domain)).courses.videos[5],true);await page.evaluate(()=>courseSync.attach(firebase.database()));
 });
 await check('delayed committed SDK proof survives claim handoff and cannot erase newer ABA operations',async()=>{
  const clock=(await read(domain)).clock;await page.evaluate(()=>{const raw=firebase.database();let calls=0;courseSync.attach({ref(path){const ref=raw.ref(path);return {on:(...a)=>ref.on(...a),off:(...a)=>ref.off(...a),transaction:(...a)=>{const n=++calls;return ref.transaction(...a).then(async result=>{if(n===1)await new Promise(r=>setTimeout(r,4000));if(n===2)return new Promise(()=>{});return result;});}};}});setStudyCompletion('videos','6',true);});
  await drain();assert.equal((await read(domain)).clock,clock+1);await page.evaluate(()=>{setStudyCompletion('videos','6',false);setStudyCompletion('videos','6',true);});await drain();assert.equal((await read(domain)).clock,clock+3);assert.equal((await read(domain)).courses.videos[6],true);await page.evaluate(()=>courseSync.attach(firebase.database()));
 });
 await check('manual date edit, removal tombstone and recheck share the same atomic writer',async()=>{
  await page.evaluate(()=>courseDates.set('videos__1','2026-10-01'));await drain();assert.equal((await read(domain)).firstCompletion.videos__1.day,'2026-10-01');
  await page.evaluate(()=>courseDates.set('videos__1',null));await drain();await page.evaluate(()=>setStudyCompletion('videos','1',false));await drain();await page.evaluate(()=>setStudyCompletion('videos','1',true));await drain();assert.equal((await read(domain)).firstCompletion.videos__1.day??null,null);
 });
 await verifyCourseRules({page,read,admin,domain,initial,check});
 await check('two actual Becoming tabs without Web Locks preserve independent groups and ABA identities',async()=>{
  const other=await context.newPage();await other.addInitScript(()=>Object.defineProperty(navigator,'locks',{value:undefined}));await other.goto(base);await other.waitForFunction(()=>window.updateWorkspace&&i3Runtime.read().status==='ready');
  await page.evaluate(()=>setStudyCompletion('videos','2',true));await other.evaluate(()=>setStudyCompletion('videos','3',true));await drain();try{await other.waitForFunction(()=>!courseSync.inspect().pending.length);}catch(error){console.log('MULTITAB',JSON.stringify(await other.evaluate(()=>courseSync.inspect())));console.log('SERVER',JSON.stringify(await read(domain)));throw error;}
  await other.evaluate(()=>{setStudyCompletion('videos','3',false);setStudyCompletion('videos','3',true);});await other.waitForFunction(()=>!courseSync.inspect().pending.length);assert.equal((await read(domain)).courses.videos[2],true);assert.equal((await read(domain)).courses.videos[3],true);await other.close();
 });
 await check('retirement rules reject legacy writer batches, old date writes and cross-UID access',async()=>{
  const rejected=await page.evaluate(async()=>{const raw=firebase.database(),results=[];for(const fn of [()=>raw.ref('physiology/old').set(true),()=>raw.ref().update({'videos/old':true,'habits/unsafe':true}),()=>raw.ref('questOS/v1/courseFirstCompletion/old').set({day:'2026-01-01',_version:'old'}),()=>raw.ref('users/fixture-B/learningV3').set({schema:3,era:0,generation:'other-UID',clock:1})])try{await fn();results.push(false);}catch{results.push(true);}return results;});assert.deepEqual(rejected,[true,true,true,true]);assert.equal(await read('habits/unsafe'),null);assert.deepEqual(await read('users/fixture-B'),otherUIDBefore);
 });
 await check('ordinary client cannot rotate/delete the reset generation',async()=>{
  assert.equal(await page.evaluate(async()=>{try{await firebase.database().ref('users/fixture-A/learningV3').update({era:1,generation:'illegal'});return false;}catch{return true;}}),true);
  assert.equal(await page.evaluate(async()=>{try{await firebase.database().ref('users/fixture-A/learningV3').remove();return false;}catch{return true;}}),true);
 });
 await check('synthetic reset fences a delayed pre-reset request and fresh progress works after reload',async()=>{
  const old=await page.evaluate(()=>{const engine=courseSync;firebase.database().goOffline();setStudyCompletion('videos','4',true);return engine.inspect().pending.at(-1);});
  const before=await read(domain);await admin(domain,{...initial,era:before.era+1,generation:'synthetic-reset-generation'});
  // Synthetic UID only: reset local account caches, preserve other UID data and the Auth identity.
  await page.evaluate(()=>{courseSync.close();const storage=learningStorage;for(let i=storage.length-1;i>=0;i--)storage.removeItem(storage.key(i));firebase.database().goOnline();});await load();
  await page.evaluate(async row=>{const {applyCourseRequest}=await import('/src/study/course-contract.js');await firebase.database().ref('users/fixture-A/learningV3').transaction(current=>applyCourseRequest(current,row),undefined,false);},old);assert.equal((await read(domain)).clock,0);
  await page.evaluate(()=>setStudyCompletion('videos','1',true));await drain();await load();await drain();assert.equal((await read(domain)).clock,1);assert.deepEqual(await read('users/fixture-B'),otherUIDBefore);
 });
 await check('history/XP stay unchanged; no external requests, receipt growth, gate or console exception',async()=>{
  assert.deepEqual(await read('gamification'),history.gamification);const current=await read(domain);assert.equal(current.gate,undefined);assert.equal(current.receipts,undefined);assert.equal(external,0);assert.deepEqual(errors,[]);
 });
 console.log('Durable course Emulator checks passed: '+count+' (real product UI + SDK 9.22.0 + Emulator 4.11.2; synthetic identities/rules only).');
}finally{clearTimeout(all);await browser?.close();if(server)await new Promise(r=>server.close(r));child.kill('SIGTERM');}
