import {test,expect} from './fixtures.js';

test('initialized notice ignores unbound cache and confirmed history, but preserves unresolved evidence',async({page})=>{
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto('/');await page.waitForFunction(()=>typeof window.updateWorkspace==='function');
 await page.evaluate(()=>{
  // Exercise the display boundary for a successfully initialized life session.
  window.lifeSession={resetId:'synthetic-reset'};
  localStorage.setItem('med_exam_videos_cloud','{"1":true}');
  window.updateWorkspace();
 });
 const notice=page.locator('[data-legacy-rewards]');await expect(notice).toBeHidden();
 const before=await page.locator('#lord-xp-level').textContent();
 const history=JSON.stringify({med_exam_gamification_v1:[JSON.stringify({awards:{old:{xp:20,day:'2026-10-01'}}})]});
 await page.evaluate(value=>{learningStorage.setItem('med_exam_legacy_reward_quarantine_v1',value);window.updateWorkspace();},history);
 await expect(notice).toBeHidden();
 const pending=JSON.stringify({med_exam_daily_planner_v3:[JSON.stringify({pending:{old:{awardDay:'2026-10-01'}}})]});
 await page.evaluate(value=>{learningStorage.setItem('med_exam_legacy_reward_quarantine_v1',value);window.updateWorkspace();},pending);
 await expect(notice).toBeVisible();await expect(notice).toContainText('需人工核對');
 expect(await page.locator('#lord-xp-level').textContent()).toBe(before);
 expect(await page.evaluate(()=>learningStorage.getItem('med_exam_legacy_reward_quarantine_v1'))).toBe(pending);
 expect(await page.evaluate(()=>localStorage.getItem('med_exam_videos_cloud'))).toBe('{"1":true}');
 expect(await page.evaluate(()=>window.learningDB)).toBe(null);
});
