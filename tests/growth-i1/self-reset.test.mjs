import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountStorage} from '../../account-storage.js';
import {createSelfResetPlan} from '../../src/study/reset-plan.js';
import {performSelfReset,reconcileSelfReset,resetEvidence,createResetRest} from '../../src/study/self-reset.js';
const id='12345678-1234-4123-8123-123456789abc';
function fixture(){
 const map=new Map(),backing={get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 const account=createAccountStorage(backing);account.bind('fixture-A');const storage=account.view();
 storage.setItem('med_exam_videos_cloud','old');storage.setItem('life_v1:old:med_exam_life_v1','old');storage.setItem('med_exam_theme','dark');
 backing.setItem('becoming_uid_v1:fixture-B:med_exam_videos_cloud','other');backing.setItem('firebase:authUser:test','auth');
 const course={schema:3,generation:'old-course',era:4},life={schema:1,generation:'old-life',era:8};let calls=[],stopped=0,reloads=0;
 const user={uid:'fixture-A',email:'fixture@example.test',getIdTokenResult:async()=>({token:'synthetic',claims:{sub:'fixture-A',email_verified:true,auth_time:Math.floor(Date.now()/1000)}}),getIdToken:async()=>'synthetic'};
 const rest=async(path,token,options)=>{calls.push({path,options});if(options?.method==='PATCH')return true;if(path.endsWith('selfResetContract'))return {version:1};if(path.endsWith('learningV3'))return course;if(path.endsWith('lifeControl'))return life;return null;};
 return {map,account,storage,course,life,user,rest,calls,options:{user,storage,rest,id,reauthenticate:async()=>{},stop:()=>stopped++,reload:()=>reloads++},state:()=>({stopped,reloads})};
}
test('one atomic UID reset rotates both eras; preserves settings and excludes legacy/other UID',async()=>{
 const f=fixture(),p=await createSelfResetPlan({uid:f.user.uid,course:f.course,life:f.life,settings:{examDate:'2027-01-01'},training:{stage:2},id});
 assert.equal(p.atomicUpdate['users/fixture-A/learningV3'].era,5);assert.equal(p.atomicUpdate['users/fixture-A/lifeControl'].era,9);assert.equal(p.atomicUpdate['users/fixture-A/lifeV1/old-life'],null);
 assert.deepEqual(p.atomicUpdate['users/fixture-A/lifeV1/life_'+id+'/training'],{stage:2});assert(Object.keys(p.atomicUpdate).every(path=>path.startsWith('users/fixture-A/')));
 await performSelfReset(f.options);assert.equal(f.calls.filter(x=>x.options?.method==='PATCH').length,1);assert.deepEqual(f.state(),{stopped:1,reloads:1});
 assert.equal(f.storage.getItem('med_exam_videos_cloud'),null);assert.equal(f.storage.getItem('life_v1:old:med_exam_life_v1'),null);assert.equal(f.storage.getItem('med_exam_theme'),'dark');assert.equal(f.map.get('becoming_uid_v1:fixture-B:med_exam_videos_cloud'),'other');assert.equal(f.map.get('firebase:authUser:test'),'auth');assert.equal(resetEvidence(f.storage)[0].phase,'confirmed');
});
test('missing recent verification, changed UID and local evidence failure cannot send PATCH',async()=>{
 for(const change of [f=>f.user.getIdTokenResult=async()=>({claims:{sub:f.user.uid,email_verified:false}}),f=>f.options.valid=()=>false,f=>f.options.storage={...f.storage,setItem(){throw Error('quota');}}]){
  const f=fixture();change(f);await assert.rejects(performSelfReset(f.options));assert.equal(f.calls.filter(x=>x.options?.method==='PATCH').length,0);assert.equal(f.state().stopped,0);
 }
});
test('lost ACK and permission failure retain evidence and never retry; server receipt alone reconciles',async()=>{
 for(const definite of [false,true]){
  const f=fixture(),original=f.rest;f.options.rest=async(...args)=>{if(args[2]?.method==='PATCH'){f.calls.push({options:args[2]});throw Object.assign(Error('synthetic'),{definite});}return original(...args);};
  await assert.rejects(performSelfReset(f.options));assert.equal(resetEvidence(f.storage)[0].phase,definite?'rejected':'unknown');assert.equal(f.storage.getItem('med_exam_videos_cloud'),'old');assert.equal(f.state().reloads,0);
  await assert.rejects(performSelfReset(f.options),/evidence-pending/);assert.equal(f.calls.filter(x=>x.options?.method==='PATCH').length,1);
  assert.equal(await reconcileSelfReset({...f.options,rest:async()=>null}),false);
  assert.equal(await reconcileSelfReset({...f.options,rest:async()=>({courseEra:5,lifeEra:9})}),true);assert.equal(resetEvidence(f.storage)[0].phase,'confirmed');assert.equal(f.storage.getItem('med_exam_videos_cloud'),null);
 }
});
test('REST timeout is unknown and has exactly one request; non-Firebase endpoints are rejected',async()=>{
 for(const url of ['http://evil.test','https://example.com','https://x.firebaseio.com/other','https://a:b@x.firebaseio.com/'])assert.throws(()=>createResetRest(url));
 let calls=0;const rest=createResetRest('https://synthetic.firebaseio.com',{timeoutMs:5,fetcher:async(url,options)=>{calls++;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('timeout'))));}});
 await assert.rejects(rest('','synthetic',{method:'PATCH',body:{}}));assert.equal(calls,1);
});

test('first activation is explicit and never resets an already initialized account; missing contract blocks PATCH',async()=>{
 const f=fixture();let sent;
 const rest=async(path,token,options)=>{if(options){sent=options.body;return true;}return path.endsWith('selfResetContract')?{version:1}:null;};
 await performSelfReset({...f.options,rest,allowInitialize:true});assert.equal(sent['users/fixture-A/learningV3'].era,0);assert.equal(sent['users/fixture-A/lifeControl'].era,0);
 const again=fixture();await assert.rejects(performSelfReset({...again.options,allowInitialize:true}),/already-initialized/);
 const noContract=fixture();await assert.rejects(performSelfReset({...noContract.options,rest:async()=>null}),/rules-cutover-required/);assert.equal(noContract.state().stopped,0);
});
