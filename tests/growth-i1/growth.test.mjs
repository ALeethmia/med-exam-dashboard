import test from'node:test';import assert from'node:assert/strict';import{realmGrowth,growthPercent}from'../../src/kingdom/realm-growth.js';import{buildingProgressSnapshot,COURSE_THRESHOLDS,TRAINING_THRESHOLDS}from'../../src/kingdom/territory-core.js';
const ev=(D=0,T=0,E=T,N=115)=>({courses:{done:D,total:N},training:T,activityDays:E});
test('known empty evidence is Lv.1; all V Lv.20; old XP never enters formula',()=>{assert.equal(realmGrowth(ev()).level,1);assert.equal(realmGrowth(ev(98,30)).level,20);assert.deepEqual(realmGrowth({...ev(),xp:999999}),realmGrowth(ev()));});
test('40/40/20 exact weighting, no training means at most 60%',()=>{const x=realmGrowth(ev(115));assert.equal(x.academy,1);assert.equal(x.barracks,0);assert.equal(x.keep,1);assert(Math.abs(x.progress-.6)<1e-12);assert.equal(x.level,12);});
test('correction may downgrade; no highest-level floor',()=>{assert.equal(realmGrowth(ev(98,30)).level,20);assert.equal(realmGrowth(ev(97,30)).level,19);assert.equal(realmGrowth(ev()).level,1);});
test('catalog growth recomputes denominator; unavailable catalog/source is unknown',()=>{assert(realmGrowth(ev(58,8,8,120)).progress<realmGrowth(ev(58,8,8,115)).progress);for(const x of [null,ev(0,0,0,0),ev(-1),ev(116),{courses:{done:0,total:115},training:null,activityDays:null}])assert.equal(realmGrowth(x).available,false);assert.equal(realmGrowth(ev(),{ready:false}).level,null);});
test('visible percentage cannot claim 100% or Lv.20 before full completion',()=>{const g=realmGrowth(ev(97,30));assert.notEqual(growthPercent(g.progress),'100%');assert(g.level<20);assert.equal(growthPercent(null),'尚未取得');});
test('monotonic neighbors, all source thresholds, repeated small-catalog thresholds',()=>{
 let count=0;for(const N of [1,2,5,100,115])for(let D=0;D<=N;D++)for(const T of [0,2,3,7,8,15,16,29,30])for(const E of new Set([T,Math.max(T,30)])){
  const x=realmGrowth(ev(D,T,E,N));assert.equal(x.level,1+Math.floor(19*x.progress));for(const next of [ev(D+1,T,E,N),ev(D,T+1,Math.max(E,T+1),N),ev(D,T,E+1,N)]){const y=realmGrowth(next);if(y.available)assert(y.progress+1e-12>=x.progress);}count++;
 }assert(count>1000);
});
test('stage frontier agrees with existing unmodified I-V calculator',()=>{
 const data={anatomy:[{lectures:Array.from({length:115},(_,id)=>({id:String(id),title:'Synthetic',durationSec:1}))}],physio:[],biochem:[],pharm:[]};
 for(const D of [0,5,6,22,23,57,58,97,98,115])for(const T of [0,3,8,16,30]){const habits={};for(let i=0;i<T;i++)habits[new Date(Date.UTC(2026,8,i+1)).toISOString().slice(0,10)]={'daily-sport':true};const b=buildingProgressSnapshot({data,states:{videos:Object.fromEntries(Array.from({length:D},(_,i)=>[i,true]))},habits,courseDates:{},day:'2026-10-15'}),g=realmGrowth(b.evidence);for(const id of ['academy','barracks','keep'])assert.equal(1+g.gates[id].reduce((m,v,i)=>v===1?i+1:m,0),b[id].stage);}
});
