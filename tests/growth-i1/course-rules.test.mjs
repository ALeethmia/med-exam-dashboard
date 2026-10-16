import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {makeCourseRules,makeFrozenCourseRules,courses} from '../../scripts/course-rules-candidate.mjs';
test('candidate and fixture are generated from the same 115-course allowlist',()=>{
 assert.equal(courses.length,115);assert.equal(new Set(courses.map(c=>c.key)).size,115);
 execFileSync(process.execPath,['scripts/course-rules-candidate.mjs','--check']);
 assert.deepEqual(JSON.parse(readFileSync('tests/fixtures/course-rules.json')),makeCourseRules('fixture-A'));
 assert.deepEqual(JSON.parse(readFileSync('config/firebase/database.rules.candidate.json')),makeCourseRules('__REVIEWED_OWNER_UID__'));
});
test('no ancestor grants can reopen retired paths; old shared writers are explicit',()=>{
 const rules=makeCourseRules('fixture-A').rules;
 for(const path of ['','users','users/$uid','questOS','questOS/v1','gamification','gamification/v1','gamification/v2','gamification/v3','gamification/v3/planner']){
  const node=path?path.split('/').reduce((node,key)=>node[key],rules):rules;
  assert(!node['.write'],path+' must not have an ancestor grant');
 }
 for(const path of ['videos','biochem','physiology','pharmacology','questOS/v1/courseFirstCompletion','questOS/v1/courseSyncV2'])assert.equal(path.split('/').reduce((node,key)=>node[key],rules)['.write'],false);
 assert.equal(rules.habits['.write'],false);assert.equal(rules.gamification.v3.planner.tasks['.write'],false);assert.equal(rules.users.$uid.lifeControl['.write'],false);assert(rules.users.$uid.lifeV1.$generation.habits['.write']);
 assert.equal(rules.gamification.v1.awards['.write'],false);assert.equal(rules.gamification.v1.days['.write'],false);
 const freeze=makeFrozenCourseRules('fixture-A');
 assert.deepEqual(JSON.parse(readFileSync('config/firebase/database.rules.freeze.candidate.json')),makeFrozenCourseRules('__REVIEWED_OWNER_UID__'));
 const walk=node=>{for(const [key,value] of Object.entries(node)){if(key==='.write')assert.equal(value,false);else if(value&&typeof value==='object')walk(value);}};walk(freeze.rules);
 assert.throws(()=>makeCourseRules("injected' || true || '"));
});
