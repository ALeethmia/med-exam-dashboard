import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {emulatorAddress,emulatorClient,verifyServerBackup,digest,rehearseCutover} from '../../scripts/emulator-cutover.mjs';
test('cutover rejects production/non-loopback, credentials, namespaces and injected paths before requests',async()=>{
 for(const url of ['https://my-exam-1aab9-default-rtdb.firebaseio.com','https://127.0.0.1:9000','http://192.168.1.2:9000','http://127.0.0.1','http://127.0.0.1:9000/path','http://user:pass@127.0.0.1:9000','http://127.0.0.1:9000/?target=production','http://localhost.example.com:9000'])assert.throws(()=>emulatorClient(url,'demo-cutover'));
 for(const ns of ['production','demo-a&ns=real','demo-a/other','demo-'])assert.throws(()=>emulatorClient('http://127.0.0.1:9000',ns));
 assert.equal(emulatorAddress('http://127.0.0.1:9000','demo-test'),'http://127.0.0.1:9000');
 await assert.rejects(rehearseCutover({origin:'http://127.0.0.1:9000',namespace:'demo-test'}),/smoke-required/);
 await assert.rejects(rehearseCutover({origin:'http://127.0.0.1:9000',namespace:'demo-test',uid:'real-account',smoke:async()=>{}}),/synthetic-uid-only/);
 await assert.rejects(emulatorClient('http://127.0.0.1:9000','demo-test').read('../.settings/rules'),/invalid-path/);
});
test('cutover HTTP refuses redirects and verifies backup content',async()=>{
 const server=createServer((req,res)=>{res.writeHead(302,{Location:'https://my-exam-1aab9-default-rtdb.firebaseio.com/.json'});res.end();});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{await assert.rejects(emulatorClient('http://127.0.0.1:'+server.address().port,'demo-test').read(''));}finally{await new Promise(r=>server.close(r));}
 const tree={users:{'fixture-B':{keep:true}},values:[null,false,0]};const backup={serialized:JSON.stringify(tree),sha256:digest(tree)};
 assert.deepEqual(verifyServerBackup(backup),tree);assert.throws(()=>verifyServerBackup({...backup,serialized:'{}'}),/checksum/);
});

test('unreachable freeze acknowledgement is reported as unconfirmed, never as safe recovery',async()=>{
 const server=createServer((req,res)=>{res.writeHead(503);res.end('{}');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{await assert.rejects(rehearseCutover({origin:'http://127.0.0.1:'+server.address().port,namespace:'demo-freeze-failure',smoke:async()=>{}}),e=>e.message==='cutover/freeze-unconfirmed'&&e.freezeConfirmed===false);}finally{await new Promise(r=>server.close(r));}
});
