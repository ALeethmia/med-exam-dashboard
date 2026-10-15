import test from 'node:test';
import assert from 'node:assert/strict';
import {DB_PREFIX,uidKey,courseKey,targetValue,matches,expectedKey,transitionAllowed,storageFault} from '../../prototypes/sync-queue/contract.mjs';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openPrototypeQueue} from '../../prototypes/sync-queue/indexeddb-queue.mjs';
const row={uid:'fixture-A',path:'physiology/fc_p_1_a',intentId:'one',generation:1,state:'queued'};
test('course targets distinguish false from an explicit deletion',()=>{assert.deepEqual(targetValue(false),{kind:'set',value:false});assert.deepEqual(targetValue(null),{kind:'delete'});assert.deepEqual(targetValue(true),{kind:'set',value:true});for(const v of [undefined,0,'true',{}])assert.throws(()=>targetValue(v),/invalid-target/);});
test('UID/path validation rejects unbound identities and arbitrary database paths',()=>{for(const v of ['',null,{},' '.repeat(2),'x'.repeat(129)])assert.throws(()=>uidKey(v),/invalid-uid/);for(const p of ['../physiology/a','gamification/v1/awards','https://bad.invalid/a','physiology/a/b','physiology/'])assert.throws(()=>courseKey(p),/invalid-path/);for(const p of ['videos/1','physiology/fc_p_1_c','biochem/2','pharmacology/unit_1'])assert.equal(courseKey(p),p);});
test('CAS requires UID, path, intent, generation and exact state',()=>{assert(matches(row,{...row}));for(const patch of [{uid:'fixture-B'},{path:'physiology/fc_p_1_c'},{intentId:'three'},{generation:3},{state:'in-flight'}])assert(!matches(row,{...row,...patch}));assert(!matches(null,row));});
test('expected identities reject another UID and missing generations',()=>{assert.deepEqual(expectedKey(row,'fixture-A'),['fixture-A',row.path]);for(const patch of [{uid:'fixture-B'},{generation:undefined},{generation:0},{generation:Infinity},{state:'done'},{intentId:''}])assert.throws(()=>expectedKey({...row,...patch},'fixture-A'),/invalid-expected/);});
test('no transition blindly requeues unknown writes',()=>{assert(transitionAllowed('queued','in-flight'));assert(transitionAllowed('in-flight','awaiting-proof'));assert(transitionAllowed('awaiting-proof','needs-choice'));for(const from of ['in-flight','awaiting-proof','needs-choice'])assert(!transitionAllowed(from,'queued'));assert(!transitionAllowed('awaiting-proof','in-flight'));});
test('storage errors are bounded codes, never raw messages containing data',()=>{for(const [name,code] of [['QuotaExceededError','queue/quota-exceeded'],['AbortError','queue/aborted'],['SecurityError','queue/unavailable'],['VersionError','queue/version-incompatible'],['UnknownError','queue/storage-failed']])assert.equal(storageFault({name,message:'sensitive fixture text'}).message,code);});
test('prototype must explicitly select a separate database',async()=>{for(const name of ['production',DB_PREFIX,undefined])await assert.rejects(openPrototypeQueue({name}),/prototype-name-required/);await assert.rejects(openPrototypeQueue({name:DB_PREFIX+'unit',indexedDB:null}),/unavailable/);});
test('open synchronous denial and async errors reject instead of claiming persistence',async()=>{
 await assert.rejects(openPrototypeQueue({name:DB_PREFIX+'unit',indexedDB:{open(){throw {name:'SecurityError'};}}}),/unavailable/);
 const factory={open(){const r={error:{name:'QuotaExceededError'}};queueMicrotask(()=>r.onerror());return r;}};
 await assert.rejects(openPrototypeQueue({name:DB_PREFIX+'unit',indexedDB:factory}),/quota-exceeded/);
});
test('blocked opens fail closed; a late connection is closed',async()=>{let request,closed=0;const factory={open(){request={};queueMicrotask(()=>request.onblocked());return request;}};await assert.rejects(openPrototypeQueue({name:DB_PREFIX+'unit',indexedDB:factory}),/open-blocked/);request.result={close(){closed++;}};request.onsuccess();assert.equal(closed,1);});
test('open timeouts also close late connections',async()=>{let request,closed=0;const promise=openPrototypeQueue({name:DB_PREFIX+'unit',indexedDB:{open(){return request={};}},openTimeoutMs:5});await assert.rejects(promise,/open-timeout/);request.result={close(){closed++;}};request.onsuccess();assert.equal(closed,1);});

test('native DOMException numeric code does not bypass bounded error handling',()=>{assert.equal(storageFault(new DOMException('fixture','QuotaExceededError')).code,'queue/quota-exceeded');assert.equal(storageFault(new DOMException('fixture','AbortError')).code,'queue/aborted');});

test('prototype is not imported by product entries and has no Firebase/network/legacy-storage side effects',()=>{
 const root=fileURLToPath(new URL('../../',import.meta.url));
 const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
 const entries=[...readdirSync(root).filter(f=>/\.(js|html)$/.test(f)).map(f=>path.join(root,f)),...walk(path.join(root,'src'))];
 for(const entry of entries)assert(!readFileSync(entry,'utf8').includes('prototypes/sync-queue'),entry);
 for(const f of ['contract.mjs','indexeddb-queue.mjs'])assert(!/\bfetch\s*\(|\bfirebase\b|\blocalStorage\s*\.|dispatchEvent\s*\(/.test(readFileSync(path.join(root,'prototypes/sync-queue',f),'utf8').replace(/^\s*\/\/.*$/gm,'')),f);
});
