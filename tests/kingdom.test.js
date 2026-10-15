import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BRAND,CHAPTER_I,CHAPTERS,chapterSnapshot} from '../chapters.js';
import {BUILDINGS,kingdomSnapshot,exerciseLabel} from '../kingdom-core.js';
import {defaultTraining,lifeSummary} from '../life-core.js';
import {defaultStudySettings} from '../adaptive-core.js';
import {createPlanner} from '../daily-planner.js';
import {memoryStorage,mockEvents} from './helpers/planning-mock.js';
const data={physio:[{sections:[{id:'p',title:'生理'}]}],anatomy:[{lectures:[{id:1,title:'解剖',durationSec:60}]}],biochem:[{id:1,title:'生化'}],pharm:[{lectures:[{id:1,title:'藥理',durationSec:120}]}]};
const goals={study:{total:2,done:1,percent:50},exercise:{type:'walk',status:'pending'},leisure:{status:'not_scheduled'}};
const input={data,states:{physiology:{p:true}},settings:defaultStudySettings(),day:'2026-10-12',goals,training:defaultTraining()};
test('brand and chapter definitions have stable identifiers and no separate exam date or resource balance',()=>{
 assert.equal(BRAND.name,'Becoming');assert.equal(CHAPTERS[0].id,'scholars-trial');assert.equal(CHAPTER_I.world,'Aetheria');assert.equal(CHAPTER_I.goalType,'exam');assert.equal(CHAPTER_I.examDate,undefined);assert.equal(BUILDINGS.length,3);assert.deepEqual(BUILDINGS.map(b=>b.id),['keep','academy','barracks']);assert.ok(Object.isFrozen(CHAPTER_I));
});
test('chapter uses adaptive date and elapsed dates never imply passage, reset or a new chapter',()=>{
 const today=chapterSnapshot({examDate:'2026-10-12'},'2026-10-12');assert.equal(today.examTiming,'today');const tomorrow=chapterSnapshot({examDate:'2026-10-13'},'2026-10-12');assert.equal(tomorrow.daysRemaining,1);
 const future=chapterSnapshot({examDate:'2026-10-12'},'2027-01-20');assert.equal(future.daysRemaining,0);assert.equal(future.examTiming,'elapsed');assert.equal(future.chapterState,'in_progress');assert.equal(future.examResult,'unreported');assert.equal(future.id,today.id);
});
test('summary is pure, counts actual units and keeps daily task completion separate from course completion',()=>{
 const before=JSON.stringify(input),result=kingdomSnapshot(input);assert.equal(result.courses.done,1);assert.equal(result.courses.remaining,3);assert.equal(result.subjects[0].percent,100);assert.equal(result.study.done,1);assert.equal(result.milestones[1].reached,true);assert.equal(JSON.stringify(input),before);assert.ok(!Object.hasOwn(result,'resources'));assert.ok(!Object.hasOwn(result,'xp'));
 const empty=kingdomSnapshot({...input,states:{},goals:{...goals,study:{total:0,done:0}}});assert.equal(empty.courses.done,0);assert.equal(empty.milestones[1].reached,false);assert.equal(empty.study.label,'今日未安排學習任務');
});
test('all exercise safety and leisure states are neutral and derived from existing records',()=>{
 for(const [exercise,expected] of [[{type:'none',status:'not_scheduled'},'未安排'],[{type:'rest',status:'not_scheduled'},'休息與恢復'],[{type:'walk',status:'symptom_rest'},'症狀休息 · 以恢復為先'],[{type:'walk',status:'alternative'},'低強度替代完成'],[{type:'walk',status:'complete'},'正常完成']])assert.equal(exerciseLabel(exercise,{}),expected);
 assert.equal(exerciseLabel({type:'walk',status:'pending'},{paused:true}),'暫停訓練 · 休息與恢復');assert.equal(exerciseLabel({status:'complete',legacy:true},{}),'已完成（舊紀錄）');
 for(const [status,label] of [['not_scheduled','未安排'],['pending','尚未完成'],['complete','已完成']])assert.equal(kingdomSnapshot({...input,goals:{...goals,leisure:{status}}}).leisure.label,label);
});
test('reading the kingdom with actual Planner and legacy habits never mutates tasks, awards or storage',()=>{
 const storage=memoryStorage();let id=0;const planner=createPlanner({storage,events:mockEvents(),localOnly:true,newId:()=>String(++id),today:()=>input.day});const a=planner.add({title:'a'}),b=planner.add({title:'b',planning:{version:1,waiting:true}});planner.update(a,{complete:true});const habits={'daily-sport':true,'daily-game':true},training=defaultTraining(),before=JSON.stringify({tasks:planner.snapshot(),awards:planner.awards(),habits});
 const result=kingdomSnapshot({...input,training,goals:lifeSummary(planner,input.day,training,habits)});assert.equal(result.study.total,1);assert.equal(result.study.done,1);assert.equal(result.exercise.label,'已完成（舊紀錄）');assert.equal(result.leisure.label,'已完成');assert.equal(planner.get(b).planning.waiting,true);assert.equal(JSON.stringify({tasks:planner.snapshot(),awards:planner.awards(),habits}),before);
});
test('kingdom modules cannot initialize Firebase, storage, XP awards or resource transactions',()=>{
 for(const file of ['src/kingdom/chapters.js','src/kingdom/kingdom-core.js','kingdom-ui.js','chronicles-ui.js','src/kingdom/territory-core.js','territory-ui.js']){const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');assert.ok(!/localStorage|sessionStorage|firebase|\.transaction\(|\.setItem\(|planner\.update\(|planner\.add\(/.test(source),file);}
});

test('chronicles use original immutable XP and achievement calculations, never kingdom currencies',async()=>{
 const {gameStats}=await import('../study-core.js');const awards=Object.fromEntries(Array.from({length:10},(_,i)=>['historic-'+i,{xp:20,day:'2026-10-12'}]));const before=JSON.stringify(awards),current=gameStats(awards,'2026-10-12');assert.equal(current.xp,200);assert.equal(current.weekly,10);assert.equal(current.achievements.filter(a=>a.unlocked).length,3);assert.deepEqual(current.achievements.map(a=>a.title),['開始前進','今日專注','持續累積']);const later=gameStats(awards,'2026-10-19');assert.equal(later.xp,200);assert.equal(later.weekly,0);assert.ok(later.achievements.every(a=>a.unlocked));assert.equal(JSON.stringify(awards),before);assert.equal(later.resources,undefined);
});

test('chronicle display distinguishes dated course evidence from current progress without inventing unlock dates',async()=>{
 const {chronicleMilestones}=await import('../chronicles-ui.js');const {buildingProgressSnapshot}=await import('../territory-core.js');const {gameStats}=await import('../study-core.js');
 const evidence={data,states:input.states,habits:{},courseDates:{},day:input.day},awards={legacy:{xp:20,day:'2026-10-01'}},before=JSON.stringify({evidence,awards});
 const current=chronicleMilestones(buildingProgressSnapshot(evidence),gameStats(awards,input.day).achievements);
 assert.deepEqual(current.history,[]);assert.equal(current.current.length,3);assert.ok(current.current.every(e=>!Object.hasOwn(e,'date')));assert.ok(current.current.find(e=>e.id==='achievement-progress').detail.includes('1 / 3'));
 assert.equal(JSON.stringify({evidence,awards}),before);
});
test('chronicles keep only one earliest valid recorded learning footprint, never daily microevents or stage events',async()=>{
 const {chronicleMilestones}=await import('../chronicles-ui.js');const {buildingProgressSnapshot}=await import('../territory-core.js');const {gameStats}=await import('../study-core.js');
 const evidence={data,states:{},habits:{'2026-10-09':{'daily-sport':true}},courseDates:{physiology__p:{day:'2026-10-10'},videos__1:{day:'2026-10-08'},biochem__1:{day:'2026-10-13'},pharmacology__1:{day:'2026-02-30'},orphan:{day:'2026-01-01'}},day:input.day};
 const buildings=buildingProgressSnapshot(evidence),before=JSON.stringify(buildings),display=chronicleMilestones(buildings,gameStats({},input.day).achievements);
 assert.equal(display.history.length,1);assert.equal(display.history[0].date,'2026-10-08');assert.ok(display.history[0].title.includes('最早已記錄'));assert.ok(display.history[0].detail.includes('解剖學'));
 assert.ok(!display.history.some(e=>e.id.startsWith('milestone:')));assert.equal(JSON.stringify(buildings),before);assert.deepEqual(chronicleMilestones(buildings,gameStats({},input.day).achievements),display);
});
