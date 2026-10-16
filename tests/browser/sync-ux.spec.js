import {test,expect} from '@playwright/test';
import {readFileSync,mkdirSync} from 'node:fs';
const source=readFileSync(new URL('../../sync.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../../styles/workspace.css',import.meta.url),'utf8');
async function setup(page,{scenario='same',width=1440,theme='light'}={}){
 await page.setViewportSize({width,height:1000});
 await page.route('**/*',r=>r.abort());
 await page.setContent(`<html lang="zh-Hant" data-theme="${theme}"><head><style>${css}</style></head><body><main class="workspace-main"><header class="workspace-topbar"><div class="workspace-toolbar"><div class="breadcrumb">Becoming / 總覽</div><div class="workspace-controls"><span id="sync-status"></span><div class="appearance-control"><button>淺色</button><button>深色</button><button>系統</button></div><button>重試同步</button></div></div><h1>今天的任務，從這裡開始。</h1></header><section class="workspace-panel"><h2>今日任務</h2><p>同步提示不會擠入外觀控制列，也不遮擋學習內容。</p></section></main></body></html>`);
 await page.evaluate(({scenario})=>{
  const values=new Map(),path='physiology/fc_p_1_a';
  if(['same','different','offline','failure'].includes(scenario))values.set('med_exam_pending_writes_v1',JSON.stringify({[path]:true}));
  window.learningStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
  window.studyData={physio:[{sections:[{id:'fc_p_1_a',title:'細胞膜與運輸'}]}]};
  window.observedSyncValues=values;window.writes=[];
  window.fixtureDB={ref(p){return {off(){},on(event,cb){if(p==='.info/connected')cb({val:()=>scenario!=='offline'});},once:async()=>{if(scenario==='failure')throw Error('fixture read failure');return {val:()=>scenario!=='different'};},update:async patch=>window.writes.push(patch)}}};
 },{scenario});
 await page.addScriptTag({content:source});await page.evaluate(()=>window.attachLearningDB(window.fixtureDB));
 if(['same','different'].includes(scenario))await expect(page.locator('#learning-sync-conflicts')).toBeVisible();
 if(scenario==='failure')await expect(page.locator('#sync-status')).toContainText('同步失敗');
}
for(const width of [1440,390,320])for(const theme of ['light','dark']){
 test(`stable sync notice, keyboard and ${theme} theme at ${width}px`,async({page})=>{
  await setup(page,{width,theme});
  const details=page.locator('#learning-sync-conflicts');await expect(details).not.toHaveAttribute('open');
  await expect(page.locator('#learning-sync-notice')).not.toBeHidden();
  expect(await page.locator('.workspace-controls #learning-sync-notice').count()).toBe(0);
  await details.locator('summary').focus();await page.keyboard.press('Enter');await expect(details).toHaveAttribute('open');
  await expect(details).toContainText('尚未取得可靠寫入確認');await expect(details).not.toContainText('雲端與本機不同');await expect(details).toContainText('細胞膜與運輸');
  const button=details.locator('summary');await button.focus();
  const retained=await button.elementHandle();await page.evaluate(()=>window.retryLearningSync());
  await expect(button).toBeFocused();expect(await retained.evaluate(el=>el.isConnected)).toBe(true);await expect(details).toHaveAttribute('open');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await page.evaluate(()=>window.writes.length)).toBe(0);
  expect(await page.evaluate(()=>JSON.parse(window.observedSyncValues.get('med_exam_pending_writes_v1')))).toEqual({'physiology/fc_p_1_a':true});
  if(process.env.SYNC_UX_SCREENSHOTS){mkdirSync(process.env.SYNC_UX_SCREENSHOTS,{recursive:true});await page.screenshot({path:`${process.env.SYNC_UX_SCREENSHOTS}/${width}-${theme}-same.png`,fullPage:true});}
 });
}
for(const scenario of ['same','different','offline','failure','normal'])test(`sync presentation ${scenario}`,async({page})=>{
 await setup(page,{scenario,width:390});
 if(scenario==='normal')await expect(page.locator('#learning-sync-notice')).toBeHidden();
 else if(scenario==='offline')await expect(page.locator('[data-sync-overview]')).toContainText('離線中');
 else if(scenario==='failure')await expect(page.locator('[data-sync-overview]')).toContainText('同步暫時失敗');
 else{
  await page.locator('summary').click();
  await expect(page.locator('[data-sync-kind]')).toHaveAttribute('data-sync-kind',scenario==='same'?'unconfirmed':'observed-difference');
  await expect(page.locator('[data-sync-detail]')).toContainText(scenario==='same'?'目前快照：已完成':'目前快照：未完成');
 }
 if(process.env.SYNC_UX_SCREENSHOTS)await page.screenshot({path:`${process.env.SYNC_UX_SCREENSHOTS}/390-${scenario}.png`,fullPage:true});
});
test('historical course intents remain read-only and cannot enter the new writer through legacy decisions',async({page})=>{
 await setup(page);await page.locator('summary').click();
 await expect(page.getByRole('button',{name:'採用雲端',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'重新套用本機',exact:true})).toBeDisabled();
 await page.evaluate(async()=>{await resolveLearningSync('physiology/fc_p_1_a',true);await resolveLearningSync('physiology/fc_p_1_a',false);});
 expect(await page.evaluate(()=>JSON.parse(observedSyncValues.get('med_exam_pending_writes_v1')))).toEqual({'physiology/fc_p_1_a':true});expect(await page.evaluate(()=>writes.length)).toBe(0);
});
