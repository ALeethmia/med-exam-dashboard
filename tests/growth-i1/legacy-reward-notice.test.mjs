import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountStorage} from '../../account-storage.js';
import {createLifeStorage} from '../../src/study/life-isolation.js';
import {preserveRewardCache,rewardNoticeText} from '../../legacy-rewards.js';

function setup(){
 const values=new Map(),raw={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k),key:i=>[...values.keys()][i]??null,get length(){return values.size;}};
 const account=createAccountStorage(raw);account.bind('A');
 const storage=createLifeStorage(account.view(),'new-generation');
 const notice=extra=>rewardNoticeText({initialized:true,storage,legacyKeys:account.legacyKeys().length,...extra});
 return {values,raw,account,storage,notice};
}
const quarantine='med_exam_legacy_reward_quarantine_v1';
test('initialized account hides notice for unbound cache and confirmed award history, preserving all evidence',()=>{
 const x=setup();x.raw.setItem('med_exam_gamification_v1','unbound evidence');
 x.storage.setItem('med_exam_gamification_v1',JSON.stringify({awards:{old:{xp:20,day:'2026-10-01'}}}));
 const count=preserveRewardCache(x.storage);assert.equal(count,1);assert.equal(x.account.legacyKeys().length,1);
 const before=[...x.values];assert.equal(x.notice({preservedRewards:count}),'');assert.deepEqual([...x.values],before);
});
test('initialized empty account has no historical XP notice',()=>assert.equal(setup().notice(),''));
for(const [name,intent] of [['med_exam_daily_planner_v3',{awardDay:'2026-10-01'}],['med_exam_time_tasks_v1',{awarded:true}]]){
 test('archived '+name+' reward intent remains visible without replay or evidence mutation',()=>{
  const x=setup();x.storage.setItem(quarantine,JSON.stringify({[name]:[JSON.stringify({pending:{old:intent}})]}));
  const before=[...x.values];assert.match(x.notice(),/需人工核對/);assert.deepEqual([...x.values],before);
 });
}
test('active held intent warns even without an archive',()=>assert.match(setup().notice({held:1}),/需人工核對/));
test('ordinary archived pending without reward flags is not a reward anomaly',()=>{
 const x=setup();x.storage.setItem(quarantine,JSON.stringify({med_exam_daily_planner_v3:[JSON.stringify({pending:{task:{patch:{title:'edit'}}}})]}));assert.equal(x.notice(),'');
});
test('malformed or unrecognized evidence stays visible and unchanged',()=>{
 const x=setup();for(const value of ['broken','null','[]',JSON.stringify({unknown:['{}']}),JSON.stringify({med_exam_daily_planner_v3:['broken','[]']}),JSON.stringify({med_exam_daily_planner_v3:['{"pending":"broken"}']})]){
  x.storage.setItem(quarantine,value);assert.match(x.notice(),/需人工核對/);assert.equal(x.storage.getItem(quarantine),value);
 }
});
test('another UID archive and previous generation pending do not warn for the current account',()=>{
 const x=setup();x.account.bind('B');x.account.setItem(quarantine,JSON.stringify({med_exam_time_tasks_v1:['{"pending":{"old":{"awarded":true}}}']}));x.account.bind('A');
 x.account.setItem('life_v1:old-generation:med_exam_daily_planner_v3','{"pending":{"old":{"awardDay":"2026-10-01"}}}');
 const current=createLifeStorage(x.account.view(),'new-generation');assert.equal(x.notice({storage:current}),'');
});
test('accounts without initialization retain historical notice behavior',()=>{
 const x=setup();assert.match(x.notice({initialized:false}),/新任務不再發放 XP/);assert.match(x.notice({initialized:false,legacyKeys:1}),/需人工核對/);
});
