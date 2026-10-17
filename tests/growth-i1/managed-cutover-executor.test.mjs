import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {approvalRequest,emulatorExecutor,managedRTDBLedger,businessTree,LEDGER_ROOT} from '../../scripts/managed-cutover-executor.mjs';
test('executor CLI is offline and inert by default; no apply, URL, identity, policy or dry-run override',()=>{
 const cli=new URL('../../scripts/managed-cutover-executor.mjs',import.meta.url);
 const status=spawnSync(process.execPath,[cli.pathname,'status'],{encoding:'utf8'});assert.equal(status.status,0,status.stderr);assert.deepEqual(JSON.parse(status.stdout),{productionTrustConfigured:false,writes:false,network:false,stages:['freeze','final-snapshot','initialize','active-rules']});
 for(const args of [[],['--apply'],['run-stage','--url','https://example.com'],['run-stage','--policy','fake'],['run-stage','--token','fake'],['run-stage','--dry-run','false'],['run-stage','--stage','initialize']]){const r=spawnSync(process.execPath,[cli.pathname,...args],{encoding:'utf8'});assert.equal(r.status,1);assert.equal(r.stdout,'');assert(!r.stderr.includes('fake'));}
});
test('Emulator trust cannot be used with remote/proxy endpoints; approval has bounded validity',()=>{
 for(const origin of ['https://my-exam-1aab9-default-rtdb.firebaseio.com','http://localhost:9000','http://127.0.0.1:9000@evil.test','http://127.0.0.1:9000/path'])assert.throws(()=>emulatorExecutor({origin,namespace:'demo-synthetic'}),/emulator-only/);
 assert.throws(()=>approvalRequest({packet:{},stage:'all',operation:'cutover-synthetic-operation',expiresAt:Date.now()+1000}),/stage-or-operation/);
 assert.throws(()=>approvalRequest({packet:{},stage:'initialize',operation:'cutover-synthetic-operation',expiresAt:Date.now()+7200000}),/expiry/);
});
test('actual RTDB ledger creates only fixed UID metadata using null_etag CAS and never retries',async()=>{
 const calls=[],request=async(...args)=>{calls.push(args);return args[2]??null;};const ledger=managedRTDBLedger(request);
 await ledger.claim('cutover-synthetic-operation/initialize/claim',{hash:'synthetic'});
 const [path,method,body,headers]=calls[0];assert.match(path,/^users\/[^/]+\/cutoverAdmin\/v1\/cutover-synthetic-operation\/initialize\/claim$/);assert.equal(method,'PUT');assert.deepEqual(headers,{'if-match':'null_etag'});assert.deepEqual(body,{hash:'synthetic'});
 let attempts=0;const denied=managedRTDBLedger(async()=>{attempts++;throw Error('executor/http-412');});await assert.rejects(denied.claim('initialize-once',{spent:true}),/412/);assert.equal(attempts,1);
 for(const key of ['users/another/record','../initialize-once','', 'patches/bad','cutover-synthetic-operation/initialize'])await assert.rejects(ledger.claim(key,{}),/ledger-path/);
 for(const invalid of [null,{},[],false])await assert.rejects(ledger.claim('initialize-once',invalid),/ledger-value/);
 assert.equal(calls.length,1);assert.equal(await ledger.read('initialize-once'),null);
});

test('backup projection excludes only the exact signed UID ledger root and preserves every other path',()=>{
 const uid=LEDGER_ROOT.split('/')[1];const tree={users:{[uid]:{cutoverAdmin:{v1:{claim:true},v2:{keep:false}},learningV3:{clock:1}},other:{cutoverAdmin:{v1:{keep:false}}}},definitions:{keep:true}};
 assert.deepEqual(businessTree(tree),{users:{[uid]:{cutoverAdmin:{v2:{keep:false}},learningV3:{clock:1}},other:{cutoverAdmin:{v1:{keep:false}}}},definitions:{keep:true}});
 assert.equal(tree.users[uid].cutoverAdmin.v1.claim,true,'raw full backup is never mutated');
});
