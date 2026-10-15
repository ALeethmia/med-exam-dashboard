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
const ns='demo-becoming-b2b1',origin='http://127.0.0.1:'+port;
let server,browser;const all=setTimeout(()=>{child.kill('SIGKILL');process.exitCode=1;},90000);
try{
 await new Promise((resolve,reject)=>{let log='';const timeout=setTimeout(()=>reject(Error('Emulator startup timeout')),20000);const data=b=>{log+=b;if(log.includes('Listening at 127.0.0.1:'+port)){clearTimeout(timeout);resolve();}};child.stdout.on('data',data);child.stderr.on('data',data);child.once('error',reject);child.once('exit',()=>reject(Error('Emulator exited')));});
 const endpoint=p=>origin+'/'+p+'.json?ns='+ns;
 await new Promise((resolve,reject)=>{let n=0;const tryRead=()=>fetch(endpoint('')).then(()=>resolve(),()=>{if(++n>100)reject(Error('Emulator HTTP not ready'));else setTimeout(tryRead,100);});tryRead();});
 async function admin(p,value){const r=await fetch(endpoint(p),{method:'PUT',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify(value)});assert(r.ok);}
 async function read(p){const r=await fetch(endpoint(p),{headers:{Authorization:'Bearer owner'}});assert(r.ok);return r.json();}
 await admin('.settings/rules',{rules:{'.read':"auth != null && auth.uid === 'fixture-A'",'.write':"auth != null && auth.uid === 'fixture-A'"}});
 const history={questOS:{v1:{courseFirstCompletion:{old:{day:'2026-01-01',_version:'historical'}}}},gamification:{v1:{awards:{old:{xp:20}}}}};await admin('',history);
 server=createServer((req,res)=>{const file=new URL(req.url,'http://127.0.0.1').pathname;if(file==='/'){res.setHeader('Content-Type','text/html');return res.end('<title>B2-B.1 Emulator only</title>');}if(!/^\/prototypes\/sync-queue\/(contract|indexeddb-queue|write-adapter)\.mjs$/.test(file)){res.statusCode=404;return res.end();}res.setHeader('Content-Type','text/javascript');res.end(readFileSync(new URL('../..'+file,import.meta.url)));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,args:['--no-sandbox']});
 const context=await browser.newContext(),page=await context.newPage();let external=0;
 await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname==='127.0.0.1')return r.continue();external++;return r.abort();});
 await page.goto('http://127.0.0.1:'+server.address().port);
 for(const file of Object.keys(hashes))await page.addScriptTag({content:readFileSync(sdk+'/'+file,'utf8')});
 await page.evaluate(async({ns,port})=>{
  if(firebase.SDK_VERSION!=='9.22.0')throw Error('Unexpected SDK');firebase.initializeApp({projectId:ns,databaseURL:'https://'+ns+'.firebaseio.com'});
  window.db=firebase.database();db.useEmulator('127.0.0.1',port,{mockUserToken:{sub:'fixture-A',user_id:'fixture-A'}});
  const {openPrototypeQueue}=await import('/prototypes/sync-queue/indexeddb-queue.mjs');const {createWriteAdapter}=await import('/prototypes/sync-queue/write-adapter.mjs');
  window.queue=await openPrototypeQueue({name:'becoming-b2a-prototype:emulator'});window.ctx={uid:'fixture-A',epoch:1,status:'ready'};window.calls=0;
  window.adapter=createWriteAdapter({queue,uid:ctx.uid,epoch:ctx.epoch,context:()=>ctx,intervalMs:20,write(path,target){calls++;return db.ref(path).set(target.kind==='delete'?null:target.value);}});
 },{ns,port});
 async function wait(test){await page.waitForFunction(test,null,{timeout:12000});}
 async function check(name,fn){await fn();console.log('PASS '+name);}
 await check('real SDK Promise acknowledges one successful write and local CAS completes',async()=>{await page.evaluate(()=>adapter.enqueue('physiology/fc_p_1_a',true));await wait(()=>adapter.status().attempts.length===0&&calls===1);assert.equal(await read('physiology/fc_p_1_a'),true);});
 await check('offline original Promise survives reconnect without a second SDK invocation',async()=>{await page.evaluate(async()=>{db.goOffline();await adapter.enqueue('physiology/fc_p_1_c',true);});await wait(()=>calls===2);await page.evaluate(async()=>{for(let i=0;i<5;i++)await adapter.pump();});assert.equal(await page.evaluate(()=>calls),2);assert.notEqual(await read('physiology/fc_p_1_c'),true);await page.evaluate(()=>db.goOnline());await wait(()=>adapter.status().attempts.length===0);assert.equal(await read('physiology/fc_p_1_c'),true);assert.equal(await page.evaluate(()=>calls),2);});
 await check('false and explicit deletion preserve distinct target semantics',async()=>{await page.evaluate(()=>adapter.enqueue('physiology/fc_p_1_a',false));await wait(()=>calls===3&&adapter.status().attempts.length===0);assert.equal(await read('physiology/fc_p_1_a'),false);await page.evaluate(()=>adapter.enqueue('physiology/fc_p_1_a',null));await wait(()=>calls===4&&adapter.status().attempts.length===0);assert.equal(await read('physiology/fc_p_1_a'),null);});
 await check('actual permission rejection retains flight, never treats it as confirmed non-write',async()=>{await admin('.settings/rules',{rules:{'.read':true,'.write':false}});await page.evaluate(()=>adapter.enqueue('physiology/denied',true));await wait(()=>adapter.status().attempts.some(a=>a.phase==='rejected-unknown'));assert.equal(await page.evaluate(()=>calls),5);assert.equal(await read('physiology/denied'),null);});
 await check('historical dates and XP unchanged; browser sent no non-loopback requests',async()=>{assert.deepEqual(await read('questOS'),history.questOS);assert.deepEqual(await read('gamification'),history.gamification);assert.equal(external,0);});
 console.log('B2-B.1 Emulator checks passed: 5 (SDK 9.22.0 / Emulator 4.11.2 / Chromium; synthetic identity, not production Auth).');
}finally{clearTimeout(all);await browser?.close();if(server)await new Promise(r=>server.close(r));child.kill('SIGTERM');}
