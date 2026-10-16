import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {approvalRequest,emulatorExecutor,managedGCSLedger} from '../../scripts/managed-cutover-executor.mjs';
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
test('actual durable GCS ledger uses immutable create-if-absent, scoped names, no overwrite/delete or retry',async()=>{
 const calls=[],http=async(...args)=>{calls.push(args);return {ok:true};};const ledger=managedGCSLedger('becoming-cutover-synthetic',http);
 await ledger.claim('cutover-synthetic-operation/initialize/claim',{hash:'synthetic'});
 const [url,method,body]=calls[0],u=new URL(url);assert.equal(u.origin,'https://storage.googleapis.com');assert.equal(u.searchParams.get('ifGenerationMatch'),'0');assert.equal(u.searchParams.get('name'),'v1/cutover-synthetic-operation/initialize/claim');assert.equal(method,'POST');assert.deepEqual(body,{hash:'synthetic'});
 const denied=managedGCSLedger('becoming-cutover-synthetic',async()=>{throw Error('executor/http-412');});await assert.rejects(denied.claim('patches/hash',{}),/412/);
 assert.equal(calls.length,1);assert.throws(()=>managedGCSLedger('bad/bucket',http),/ledger-bucket/);
 assert.equal(await managedGCSLedger('becoming-cutover-synthetic',async()=>{throw Error('executor/http-404');}).read('missing'),null);
});
