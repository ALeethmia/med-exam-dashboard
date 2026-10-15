import {test,expect} from '@playwright/test';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
const moduleURL='/prototypes/sync-queue/indexeddb-queue.mjs';
const prefix='becoming-b2a-prototype:';
async function prepare(context,page){
 await context.route('**/*',r=>{
  const u=new URL(r.request().url());if(u.hostname!=='127.0.0.1')return r.abort();
  if(u.pathname==='/__b2a__')return r.fulfill({contentType:'text/html',body:'<!doctype html><title>B2-A isolated queue</title>'});return r.continue();
 });
 await page.goto('http://127.0.0.1:3100/__b2a__');
}
async function bind(page,name,{uid='fixture-A',fault=null}={}){
 await page.evaluate(async({name,uid,fault,moduleURL})=>{
  const {openPrototypeQueue}=await import(moduleURL);
  let factory=indexedDB;
  // Deterministic fault injection over native IDB, not an actual full disk.
  if(fault)factory={open(...args){const req=indexedDB.open(...args);return new Proxy(req,{set(target,key,value){if(key==='onsuccess'){target.onsuccess=()=>{
   const db=req.result,real=db.transaction.bind(db);
   db.transaction=(...args)=>{const tx=real(...args);const store=tx.objectStore.bind(tx);tx.objectStore=n=>{const s=store(n);if(n==='intents'&&['quota','abort'].includes(fault))s.put=()=>{if(fault==='quota')throw new DOMException('injected','QuotaExceededError');tx.abort();throw new DOMException('injected','AbortError');};if(n==='flights'&&fault==='flight-abort'&&!s.flightAbortWrapped){s.flightAbortWrapped=true;for(const method of ['put','delete']){const original=s[method].bind(s);s[method]=(...args)=>{const result=original(...args);if(window.abortFlightMutation===method){tx.abort();throw new DOMException('injected flight mutation abort','AbortError');}return result;};}}return s;};return tx;};value();};return true;}return Reflect.set(target,key,value,target);},get:(target,key)=>Reflect.get(target,key,target)});}};
  window.client=await openPrototypeQueue({name,indexedDB:factory});window.session=client.bind(uid);
 },{name,uid,fault,moduleURL});
}
async function pair(browserContext,browserPage,name){await prepare(browserContext,browserPage);await bind(browserPage,name);const second=await browserContext.newPage();await second.goto('http://127.0.0.1:3100/__b2a__');await bind(second,name);return second;}
const course='physiology/fc_p_1_a';
test('two tabs concurrently write different courses without losing either intent',async({context,page})=>{
 const b=await pair(context,page,prefix+test.info().testId);
 await Promise.all([page.evaluate(()=>session.put('physiology/fc_p_1_a',true)),b.evaluate(()=>session.put('physiology/fc_p_1_c',false))]);
 const records=await page.evaluate(()=>session.list());expect(records).toHaveLength(2);expect(records.map(r=>r.path).sort()).toEqual(['physiology/fc_p_1_a','physiology/fc_p_1_c']);
});
test('same-course parallel writers serialize generations; true-false-true cannot be cleared by an old result',async({context,page})=>{
 const b=await pair(context,page,prefix+test.info().testId);
 const rows=await Promise.all([page.evaluate(()=>session.put('physiology/fc_p_1_a',true)),b.evaluate(()=>session.put('physiology/fc_p_1_a',false))]);
 expect(rows.map(r=>r.generation).sort()).toEqual([1,2]);
 const firstTrue=await page.evaluate(()=>session.put('physiology/fc_p_1_a',true));
 const middleFalse=await b.evaluate(()=>session.put('physiology/fc_p_1_a',false));
 const current=await page.evaluate(()=>session.put('physiology/fc_p_1_a',true));expect([firstTrue.generation,middleFalse.generation,current.generation]).toEqual([3,4,5]);
 for(const old of [...rows,firstTrue,middleFalse])expect(await b.evaluate(r=>session.removeIfCurrent(r),old)).toBe(false);
 expect((await b.evaluate(()=>session.list()))[0].intentId).toBe(current.intentId);
});
test('conditional deletion checks expected state and retains revision tombstone after success',async({context,page})=>{
 await prepare(context,page);await bind(page,prefix+test.info().testId);
 const row=await page.evaluate(()=>session.put('physiology/fc_p_1_a',null));expect(row.target).toEqual({kind:'delete'});
 expect(await page.evaluate(r=>session.removeIfCurrent({...r,state:'needs-choice'}),row)).toBe(false);
 expect(await page.evaluate(r=>session.removeIfCurrent(r),row)).toBe(true);
 expect(await page.evaluate(r=>session.removeIfCurrent(r),row)).toBe(false);
 expect((await page.evaluate(()=>session.put('physiology/fc_p_1_a',true))).generation).toBe(2);
});
test('superseding in-flight work retains its blocker; old acknowledgement never removes the new intent',async({context,page})=>{
 const b=await pair(context,page,prefix+test.info().testId);
 const row=await page.evaluate(()=>session.put('physiology/fc_p_1_a',true));
 const flight=await page.evaluate(r=>session.transition(r,'in-flight'),row);
 const newer=await b.evaluate(()=>session.put('physiology/fc_p_1_a',false));
 expect(await b.evaluate(r=>session.transition(r,'in-flight'),newer)).toBe(false);
 expect(await b.evaluate(r=>session.removeIfCurrent(r),newer)).toBe(false);
 expect(await b.evaluate(r=>session.settleOwnFlight(r.flightToken,'acknowledged'),flight)).toBe(false);
 expect(await page.evaluate(r=>session.settleOwnFlight(r.flightToken,'acknowledged'),flight)).toBe(true);
 expect(await page.evaluate(r=>session.removeIfCurrent(r),flight)).toBe(false);
 expect((await b.evaluate(()=>session.list()))[0].intentId).toBe(newer.intentId);
 expect(await b.evaluate(r=>session.transition(r,'in-flight'),newer)).toMatchObject({state:'in-flight'});
});
test('settled original flight can be removed exactly once without resetting the path generation',async({context,page})=>{
 await prepare(context,page);await bind(page,prefix+test.info().testId);
 const queued=await page.evaluate(()=>session.put('physiology/fc_p_1_a',true));const flight=await page.evaluate(r=>session.transition(r,'in-flight'),queued);
 expect(await page.evaluate(r=>session.removeIfCurrent(r),flight)).toBe(false);
 expect(await page.evaluate(r=>session.settleOwnFlight({...r.flightToken,flightId:'wrong-flight'},'acknowledged'),flight)).toBe(false);
 expect(await page.evaluate(r=>session.settleOwnFlight(r.flightToken,'acknowledged'),flight)).toBe(true);
 expect(await page.evaluate(r=>session.settleOwnFlight(r.flightToken,'acknowledged'),flight)).toBe(false);
 expect(await page.evaluate(r=>session.removeIfCurrent(r),flight)).toBe(true);
 expect(await page.evaluate(()=>session.list())).toEqual([]);expect(await page.evaluate(()=>session.unsettled())).toEqual([]);
 expect((await page.evaluate(()=>session.put('physiology/fc_p_1_a',true))).generation).toBe(2);
});
test('in-flight restart stays uncertain; another session cannot guess that a write was not sent',async({context,page})=>{
 const name=prefix+test.info().testId,b=await pair(context,page,name);
 const row=await page.evaluate(()=>session.put('physiology/fc_p_1_a',true));const flight=await page.evaluate(r=>session.transition(r,'in-flight'),row);await page.close();
 await b.reload();await bind(b,name);
 expect((await b.evaluate(()=>session.list()))[0].state).toBe('in-flight');
 expect(await b.evaluate(r=>session.settleOwnFlight(r.flightToken,'proved-not-sent'),flight)).toBe(false);
 const awaiting=await b.evaluate(r=>session.transition(r,'awaiting-proof'),flight);expect(await b.evaluate(r=>session.removeIfCurrent(r),awaiting)).toBe(false);
 expect(await b.evaluate(()=>session.unsettled())).toHaveLength(1);
});
test('UID changes invalidate stale clients without deleting old-account work',async({context,page})=>{
 await prepare(context,page);await bind(page,prefix+test.info().testId);
 const row=await page.evaluate(()=>session.put('physiology/fc_p_1_a',true));
 expect(await page.evaluate(async r=>{const old=session;window.session=client.bind('fixture-B');try{await old.removeIfCurrent(r);return 'unexpected';}catch(e){return e.code;}},row)).toBe('queue/stale-session');
 expect(await page.evaluate(()=>session.list())).toEqual([]);
 await page.evaluate(()=>{client.unbind();session=client.bind('fixture-A');});expect((await page.evaluate(()=>session.list()))[0].intentId).toBe(row.intentId);
});
test('switching UID aborts an active old-session transaction and keeps its previous intent',async({context,page})=>{
 await prepare(context,page);await bind(page,prefix+test.info().testId);await page.evaluate(()=>session.put('physiology/fc_p_1_a',true));
 const code=await page.evaluate(async()=>{const pending=session.put('physiology/fc_p_1_a',false);session=client.bind('fixture-B');try{await pending;return 'unexpected';}catch(e){return e.code;}});expect(code).toBe('queue/stale-session');
 expect(await page.evaluate(()=>session.list())).toEqual([]);await page.evaluate(()=>{session=client.bind('fixture-A');});expect((await page.evaluate(()=>session.list()))[0].target).toEqual({kind:'set',value:true});
});
for(const fault of ['quota','abort'])test(`injected ${fault} rolls back record and generation atomically`,async({context,page})=>{
 const name=prefix+test.info().testId;await prepare(context,page);await bind(page,name,{fault});
 const code=await page.evaluate(async()=>{try{await session.put('physiology/fc_p_1_a',true);return 'unexpected';}catch(e){return e.code;}});expect(code).toBe(fault==='quota'?'queue/quota-exceeded':'queue/aborted');
 await page.evaluate(()=>client.close());await bind(page,name);expect(await page.evaluate(()=>session.list())).toEqual([]);
 expect((await page.evaluate(()=>session.put('physiology/fc_p_1_a',true))).generation).toBe(1);
});
test('legacy localStorage, including writes by a non-cooperating tab, is never adopted or deleted',async({context,page})=>{
 const b=await pair(context,page,prefix+test.info().testId);
 const original='{"physiology/fc_p_1_a":true}';await page.evaluate(v=>localStorage.setItem('med_exam_pending_writes_v1',v),original);
 expect(await b.evaluate(()=>session.list())).toEqual([]);
 const row=await page.evaluate(()=>session.put('physiology/fc_p_1_c',true));await page.evaluate(r=>session.removeIfCurrent(r),row);
 expect(await b.evaluate(()=>localStorage.getItem('med_exam_pending_writes_v1'))).toBe(original);
 await b.evaluate(()=>localStorage.setItem('med_exam_pending_writes_v1','{"physiology/fc_p_1_a":false}'));
 expect(await page.evaluate(()=>session.list())).toEqual([]);expect(await page.evaluate(()=>localStorage.getItem('med_exam_pending_writes_v1'))).toContain('false');
});
test('closing a tab mid-transaction leaves either the entire transaction or none, never a partial generation',async({context,page})=>{
 const name=prefix+test.info().testId,b=await pair(context,page,name);
 await page.evaluate(async name=>{window.raw=await new Promise(resolve=>{const r=indexedDB.open(name,1);r.onsuccess=()=>resolve(r.result);});const tx=raw.transaction(['intents','revisions'],'readwrite');
 tx.objectStore('revisions').put({uid:'fixture-A',path:'physiology/fc_p_1_a',generation:1});tx.objectStore('intents').put({uid:'fixture-A',path:'physiology/fc_p_1_a',intentId:'interrupted',generation:1,target:{kind:'set',value:true},state:'queued'});
 function keepAlive(){const r=tx.objectStore('revisions').get(['fixture-A','physiology/fc_p_1_a']);r.onsuccess=keepAlive;}keepAlive();window.started=true;},name);
 await page.close();

 // Read both stores in one transaction to verify consistency after Chromium closes the writer.
 const state=await b.evaluate(async name=>{const db=await new Promise(resolve=>{const r=indexedDB.open(name,1);r.onsuccess=()=>resolve(r.result);});return await new Promise(resolve=>{const t=db.transaction(['intents','revisions']);let row,rev;const a=t.objectStore('intents').get(['fixture-A','physiology/fc_p_1_a']);a.onsuccess=()=>{row=a.result;};const c=t.objectStore('revisions').get(['fixture-A','physiology/fc_p_1_a']);c.onsuccess=()=>{rev=c.result;};t.oncomplete=()=>{db.close();resolve({row,rev});};});},name);
 expect(Boolean(state.row)).toBe(Boolean(state.rev));if(state.row)expect(state.row.generation).toBe(state.rev.generation);
});
test('version changes close old clients; incompatible reopen fails instead of migrating data',async({context,page})=>{
 const name=prefix+test.info().testId,b=await pair(context,page,name);await page.evaluate(()=>session.put('physiology/fc_p_1_a',true));
 await b.evaluate(()=>client.close());
 await b.evaluate(async name=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name,2);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();},name);
 expect(await page.evaluate(()=>session.valid())).toBe(false);
 const code=await b.evaluate(async({name,moduleURL})=>{try{const {openPrototypeQueue}=await import(moduleURL);await openPrototypeQueue({name});return 'unexpected';}catch(e){return e.code;}},{name,moduleURL});expect(code).toBe('queue/version-incompatible');
});
test('committed queue survives a full Chromium profile restart',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'becoming-b2a-'));let c;
 try{
  c=await chromium.launchPersistentContext(dir,{headless:true,executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined});let p=c.pages()[0];await prepare(c,p);await bind(p,prefix+'restart');await p.evaluate(()=>session.put('physiology/fc_p_1_a',true));await c.close();
  c=await chromium.launchPersistentContext(dir,{headless:true,executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined});p=c.pages()[0];await prepare(c,p);await bind(p,prefix+'restart');expect((await p.evaluate(()=>session.list()))[0]).toMatchObject({generation:1,state:'queued'});
 }finally{await c?.close();await rm(dir,{recursive:true,force:true});}
});

test('review reproduction: original acknowledgement after awaiting-proof can settle and CAS delete',async({context,page})=>{
 await prepare(context,page);await bind(page,prefix+test.info().testId);
 const queued=await page.evaluate(()=>session.put('physiology/fc_p_1_a',true));
 const claimed=await page.evaluate(r=>session.transition(r,'in-flight'),queued);
 const awaiting=await page.evaluate(r=>session.transition(r,'awaiting-proof'),claimed);
 expect(await page.evaluate(token=>session.settleOwnFlight(token,'acknowledged'),claimed.flightToken)).toBe(true);
 expect(await page.evaluate(r=>session.removeIfCurrent(r),awaiting)).toBe(true);
 expect(await page.evaluate(()=>session.list())).toEqual([]);
});

test('all allowed intent phase routes complete with the original flight token and latest CAS state',async({context,page})=>{
 await prepare(context,page);await bind(page,prefix+test.info().testId);
 for(const phases of [[],['awaiting-proof'],['needs-choice'],['awaiting-proof','needs-choice','awaiting-proof']]){
  const queued=await page.evaluate(()=>session.put('physiology/fc_p_1_a',true));
  const claimed=await page.evaluate(r=>session.transition(r,'in-flight'),queued);let latest=claimed;
  for(const phase of phases)latest=await page.evaluate(({row,phase})=>session.transition(row,phase),{row:latest,phase});
  expect((await page.evaluate(()=>session.unsettled()))[0]).toMatchObject({phase:'unsettled',flightId:claimed.flightToken.flightId});
  expect(await page.evaluate(token=>session.settleOwnFlight(token,'acknowledged'),claimed.flightToken)).toBe(true);
  if(phases.length)expect(await page.evaluate(r=>session.removeIfCurrent(r),claimed)).toBe(false);
  expect(await page.evaluate(r=>session.removeIfCurrent(r),latest)).toBe(true);
 }
 // The no-flight route is an explicit workflow decision, not a fictitious transmission.
 let row=await page.evaluate(()=>session.put('physiology/fc_p_1_a',false));
 row=await page.evaluate(r=>session.transition(r,'needs-choice'),row);row=await page.evaluate(r=>session.transition(r,'awaiting-proof'),row);
 expect(await page.evaluate(()=>session.unsettled())).toEqual([]);expect(await page.evaluate(r=>session.removeIfCurrent(r),row)).toBe(true);
});

test('another tab can advance intent state while the original session settles its flight',async({context,page})=>{
 const b=await pair(context,page,prefix+test.info().testId);
 const row=await page.evaluate(()=>session.put('physiology/fc_p_1_a',true));const claimed=await page.evaluate(r=>session.transition(r,'in-flight'),row);
 const [latest,settled]=await Promise.all([b.evaluate(r=>session.transition(r,'awaiting-proof'),claimed),page.evaluate(token=>session.settleOwnFlight(token,'acknowledged'),claimed.flightToken)]);
 expect(settled).toBe(true);expect(latest.state).toBe('awaiting-proof');
 expect(await b.evaluate(r=>session.removeIfCurrent(r),claimed)).toBe(false);expect(await b.evaluate(r=>session.removeIfCurrent(r),latest)).toBe(true);
});

test('replayed confirmation for a superseded flight cannot settle a newer transmission',async({context,page})=>{
 const b=await pair(context,page,prefix+test.info().testId);
 const first=await page.evaluate(()=>session.put('physiology/fc_p_1_a',true));const old=await page.evaluate(r=>session.transition(r,'in-flight'),first);
 await page.evaluate(r=>session.transition(r,'awaiting-proof'),old);
 const newer=await b.evaluate(()=>session.put('physiology/fc_p_1_a',false));expect(await page.evaluate(t=>session.settleOwnFlight(t,'acknowledged'),old.flightToken)).toBe(true);
 const claimed=await b.evaluate(r=>session.transition(r,'in-flight'),newer);
 expect(claimed.flightToken.flightId).not.toBe(old.flightToken.flightId);
 expect(await page.evaluate(t=>session.settleOwnFlight(t,'acknowledged'),old.flightToken)).toBe(false);
 expect(await page.evaluate(r=>session.removeIfCurrent(r),old)).toBe(false);
 expect(await b.evaluate(()=>session.unsettled())).toHaveLength(1);
 expect((await b.evaluate(()=>session.unsettled()))[0].flightId).toBe(claimed.flightToken.flightId);
});

test('wrong flight identity, payload type or stale session never clears a blocker',async({context,page})=>{
 await prepare(context,page);await bind(page,prefix+test.info().testId);
 const row=await page.evaluate(()=>session.put('physiology/fc_p_1_a',true));const claimed=await page.evaluate(r=>session.transition(r,'in-flight'),row);
 for(const patch of [{flightId:'wrong'},{ownerSession:'another-session'},{intentId:'other'},{generation:2},{path:'physiology/fc_p_1_c'}])expect(await page.evaluate(({token,patch})=>session.settleOwnFlight({...token,...patch},'acknowledged'),{token:claimed.flightToken,patch})).toBe(false);
 expect(await page.evaluate(async r=>{try{await session.settleOwnFlight(r,'acknowledged');return 'unexpected';}catch(e){return e.code;}},claimed)).toBe('queue/invalid-flight');
 expect(await page.evaluate(async token=>{try{await session.settleOwnFlight({...token,uid:'fixture-B'},'acknowledged');return 'unexpected';}catch(e){return e.code;}},claimed.flightToken)).toBe('queue/invalid-flight');
 expect(await page.evaluate(async token=>{const old=session;client.unbind();session=client.bind('fixture-A');try{await old.settleOwnFlight(token,'acknowledged');return 'unexpected';}catch(e){return e.code;}},claimed.flightToken)).toBe('queue/stale-session');
 expect(await page.evaluate(t=>session.settleOwnFlight(t,'acknowledged'),claimed.flightToken)).toBe(false);expect(await page.evaluate(()=>session.unsettled())).toHaveLength(1);
});

test('aborted claim and settlement roll back both identity and blocker changes; retry stays safe',async({context,page})=>{
 await prepare(context,page);await bind(page,prefix+test.info().testId,{fault:'flight-abort'});
 const row=await page.evaluate(()=>session.put('physiology/fc_p_1_a',true));await page.evaluate(()=>{window.abortFlightMutation='put';});
 expect(await page.evaluate(async r=>{try{await session.transition(r,'in-flight');return 'unexpected';}catch(e){return e.code;}},row)).toBe('queue/aborted');
 expect((await page.evaluate(()=>session.list()))[0].state).toBe('queued');expect(await page.evaluate(()=>session.unsettled())).toEqual([]);
 await page.evaluate(()=>{window.abortFlightMutation=null;});const claimed=await page.evaluate(r=>session.transition(r,'in-flight'),row);
 const awaiting=await page.evaluate(r=>session.transition(r,'awaiting-proof'),claimed);
 await page.evaluate(()=>{window.abortFlightMutation='delete';});
 expect(await page.evaluate(async token=>{try{await session.settleOwnFlight(token,'acknowledged');return 'unexpected';}catch(e){return e.code;}},claimed.flightToken)).toBe('queue/aborted');
 expect((await page.evaluate(()=>session.list()))[0].state).toBe('awaiting-proof');expect(await page.evaluate(()=>session.unsettled())).toHaveLength(1);
 expect(await page.evaluate(r=>session.removeIfCurrent(r),awaiting)).toBe(false);
 await page.evaluate(()=>{window.abortFlightMutation=null;});expect(await page.evaluate(token=>session.settleOwnFlight(token,'acknowledged'),claimed.flightToken)).toBe(true);
 expect(await page.evaluate(r=>session.removeIfCurrent(r),awaiting)).toBe(true);
});

test('old untyped prototype flight stays blocked rather than inventing a transmission identity',async({context,page})=>{
 const name=prefix+test.info().testId;await prepare(context,page);await bind(page,name);
 const row=await page.evaluate(()=>session.put('physiology/fc_p_1_a',true));
 await page.evaluate(async({name,row})=>{const db=await new Promise(resolve=>{const r=indexedDB.open(name,1);r.onsuccess=()=>resolve(r.result);});await new Promise((resolve,reject)=>{const t=db.transaction(['intents','flights'],'readwrite');const old={...row,state:'in-flight',ownerSession:session.sessionId};t.objectStore('intents').put(old);t.objectStore('flights').put(old);t.oncomplete=resolve;t.onerror=()=>reject(t.error);});db.close();},{name,row});
 const raw=(await page.evaluate(()=>session.list()))[0];const awaiting=await page.evaluate(r=>session.transition(r,'awaiting-proof'),raw);
 expect(await page.evaluate(r=>session.removeIfCurrent(r),awaiting)).toBe(false);
 expect(await page.evaluate(r=>session.settleOwnFlight({kind:'flight-token',uid:r.uid,path:r.path,intentId:r.intentId,generation:r.generation,ownerSession:session.sessionId,flightId:'guessed'},'acknowledged'),row)).toBe(false);
 expect(await page.evaluate(()=>session.unsettled())).toHaveLength(1);
});
