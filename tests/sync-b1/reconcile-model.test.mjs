// B1 decision model only: not imported by sync.js or any product entry.
import test from 'node:test';
import assert from 'node:assert/strict';
const mayClose=(intent,proof,session)=>typeof intent.uid==='string'&&Number.isSafeInteger(intent.epoch)&&Number.isSafeInteger(intent.generation)&&session.ready&&intent.uid===session.uid&&intent.epoch===session.epoch&&proof.uid===intent.uid&&proof.epoch===intent.epoch&&proof.generation===intent.generation&&proof.source==='server-committed-transaction'&&proof.committed===true&&proof.inFlightSettled===true&&Object.is(proof.value,intent.value);
const intent={uid:'fixture-A',epoch:2,generation:3,value:true};
const session={uid:'fixture-A',epoch:2,ready:true};
const proof={...intent,source:'server-committed-transaction',committed:true,inFlightSettled:true};
test('same values from SDK cache or connectivity never authorize auto-close',()=>{
 for(const source of ['value-event','once','get','connected','ready'])assert.equal(mayClose(intent,{...proof,source},session),false);
});
test('successful server proof needs the same intent, UID, session and settled original flight',()=>{
 assert.equal(mayClose(intent,proof,session),true);
 for(const patch of [{uid:'fixture-B'},{epoch:1},{generation:1},{committed:false},{inFlightSettled:false},{value:false},{value:null}])assert.equal(mayClose(intent,{...proof,...patch},session),false);
 for(const patch of [{uid:'fixture-B'},{epoch:3},{ready:false}])assert.equal(mayClose(intent,proof,{...session,...patch}),false);
});
test('true-false-true is not an old true acknowledgement of a newer intent',()=>assert.equal(mayClose({...intent,generation:5},proof,session),false));
test('unknown legacy intent metadata cannot authorize closure',()=>{
 assert.equal(Boolean(mayClose({value:true},proof,session)),false);
 const old={...intent},unproven={...proof};delete old.generation;delete unproven.generation;assert.equal(Boolean(mayClose(old,unproven,session)),false);
});
test('same UID localStorage whole-map writers can lose an unrelated pending edit',()=>{
 let stored={};const a={...stored},b={...stored};a['physiology/a']=true;b['physiology/b']=true;stored=a;stored=b;
 assert.equal(stored['physiology/a'],undefined); // Risk demonstration, not a safety guarantee.
});
test('unversioned Boolean ABA cannot prove that no other device edited the course',()=>{
 const before=true;const remoteHistory=[true,false,true];assert.equal(before,remoteHistory.at(-1));assert.equal(remoteHistory.length,3);
});
