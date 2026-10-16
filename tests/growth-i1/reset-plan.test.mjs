import {testCoordination} from '../helpers/course-coordination.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createResetPlan,verifyResetBackup,RESET_CLOUD_PATHS} from '../../src/study/reset-plan.js';
const uid='synthetic-reset-A',prefix='becoming_uid_v1:'+uid+':';
const fixture=()=>({videos:Object.fromEntries(Array.from({length:500},(_,i)=>[i,true])),biochem:{1:true},physiology:{fc_p_1_a:true},pharmacology:{1:true},gamification:{v1:{awards:{a:{xp:20}}},v3:{planner:{tasks:{t:{complete:true}}}}},habits:{day:{sport:true}},questOS:{v1:{courseDefinitions:{keep:true},courseFirstCompletion:{a:{day:'2026-10-01'}},training:{sessions:{a:{complete:true}}}}},custom_events:{a:['test']},checklist:{a:true},users:{'synthetic-reset-B':{untouched:true}},courseDefinitions:{keep:true}});
test('backup lists exact root/local scope, validates integrity and has no execution capability',async()=>{
 const cloud=fixture(),local={[prefix+'med_exam_pending_writes_v1']:'{}',[prefix+'med_exam_course_write_v2:batch']:'synthetic','becoming_uid_v1:synthetic-reset-B:progress':'keep',med_exam_theme:'dark'},before=structuredClone({cloud,local});
 const plan=await createResetPlan({verifiedUID:uid,ownerUID:uid,cloudSnapshot:cloud,localSnapshot:local,unsettledWrites:1});
 assert.equal(plan.executable,false);assert.equal(plan.cloudPaths.length,11);assert.equal(plan.localKeys.length,2);assert.deepEqual(plan.untouchedCloudRoots,['courseDefinitions']);assert.match(plan.blockers.join(' '),/Unsettled/);
 const backup=await verifyResetBackup(plan.backup,uid);assert.deepEqual(backup.cloud.videos,cloud.videos);assert.deepEqual({cloud,local},before);
 await assert.rejects(verifyResetBackup({...plan.backup,serialized:plan.backup.serialized+' '},uid),/checksum/);await assert.rejects(verifyResetBackup(plan.backup,'synthetic-reset-B'),/identity/);
});
test('synthetic manual-plan simulation and restore preserve other UID and static definitions',async()=>{
 const cloud=fixture(),local={[prefix+'progress']:'true','becoming_uid_v1:synthetic-reset-B:progress':'keep'};
 const plan=await createResetPlan({verifiedUID:uid,ownerUID:uid,cloudSnapshot:cloud,localSnapshot:local});const backup=await verifyResetBackup(plan.backup,uid);
 // RAM-only test of a human-reviewed plan, not a shipped reset implementation.
 const resetCloud=structuredClone(cloud),resetLocal={...local};for(const path of RESET_CLOUD_PATHS){const keys=path.split('/'),key=keys.pop(),parent=keys.reduce((node,k)=>node?.[k],resetCloud);if(parent)delete parent[key];}for(const key of plan.localKeys)delete resetLocal[key];
 assert.deepEqual(resetCloud.users,cloud.users);assert.deepEqual(resetCloud.courseDefinitions,cloud.courseDefinitions);assert.deepEqual(resetCloud.questOS.v1.courseDefinitions,{keep:true});assert.equal(resetCloud.videos,undefined);assert.equal(resetLocal['becoming_uid_v1:synthetic-reset-B:progress'],'keep');
 for(const [path,value] of Object.entries(backup.cloud)){const keys=path.split('/'),key=keys.pop();let node=resetCloud;for(const k of keys)node=node[k]??={};node[key]=value;}Object.assign(resetLocal,backup.local);assert.deepEqual(resetCloud,cloud);assert.deepEqual(resetLocal,local);
});
test('wrong UID cannot even prepare a plan',async()=>{await assert.rejects(createResetPlan({verifiedUID:'synthetic-B',ownerUID:uid,cloudSnapshot:fixture(),localSnapshot:{}}),/identity/);});

test('synthetic empty account returns initial kingdom and accepts fresh progress without old pending',async()=>{
 const {realmGrowth}=await import('../../src/kingdom/realm-growth.js');const {createCourseSync}=await import('../../src/study/course-sync.js');const {createAccountStorage}=await import('../../account-storage.js');const {createMockDatabase}=await import('../fixtures/mock-database.js');
 const values=new Map(),backing={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k),key:i=>[...values.keys()][i]??null,get length(){return values.size;}};
 const account=createAccountStorage(backing);account.bind(uid);account.setItem('med_exam_pending_writes_v1','{"physiology/fc_p_1_a":true}');backing.setItem('becoming_uid_v1:synthetic-reset-B:progress','keep');
 const local=Object.fromEntries(values),cloud=fixture(),plan=await createResetPlan({verifiedUID:uid,ownerUID:uid,cloudSnapshot:cloud,localSnapshot:local});await verifyResetBackup(plan.backup,uid);
 // Disposable synthetic state only. The production helper has no apply/delete method.
 for(const key of plan.localKeys)backing.removeItem(key);
 const db=createMockDatabase({users:cloud.users,courseDefinitions:cloud.courseDefinitions},{delay:0});
 assert.equal(realmGrowth({courses:{done:0,total:115},training:0,activityDays:0}).level,1);assert.equal(account.getItem('med_exam_pending_writes_v1'),null);assert.equal(account.read().uid,uid);
 let tail=Promise.resolve();const locks={request(name,options,fn){const result=tail.then(fn);tail=result.catch(()=>{});return result;}};
 for(let n=0;n<10;n++){
  const engine=createCourseSync({coordination:testCoordination(),storage:account.view(),uid,valid:()=>true,ready:()=>true,locks,events:new EventTarget(),acceptDates:()=>true});engine.attach(db);engine.enqueue({'videos/1':n%2===0},{baseline:{'videos/1':n===0?null:n%2!==0}});await engine.pump();assert.equal(engine.inspect().pending.length,0);engine.close();
 }
 assert.equal(db.inspect().tree.users[uid].learningV3.courses.videos[1],false);assert.equal(db.inspect().tree.gamification,undefined);assert.deepEqual(db.inspect().tree.users['synthetic-reset-B'],cloud.users['synthetic-reset-B']);assert.equal(backing.getItem('becoming_uid_v1:synthetic-reset-B:progress'),'keep');
});

test('canonical backup is UID-exact and reset plan rotates generation/era rather than deleting the fence',async()=>{const cloud=fixture();cloud.users[uid]={learningV3:{schema:3,generation:'old',era:7,clock:42,courses:{videos:{1:true}},versions:{videos__1:'old-op'},firstCompletion:{}}};const before=structuredClone(cloud);const plan=await createResetPlan({verifiedUID:uid,ownerUID:uid,cloudSnapshot:cloud,localSnapshot:{}});assert(plan.cloudPaths.includes('/users/'+uid+'/learningV3'));const backup=await verifyResetBackup(plan.backup,uid);assert.deepEqual(backup.cloud['users/'+uid+'/learningV3'],before.users[uid].learningV3);assert.equal(plan.canonicalFence.replacement.era,8);assert.notEqual(plan.canonicalFence.replacement.generation,'old');assert.equal(plan.executable,false);assert.deepEqual(cloud,before);});
