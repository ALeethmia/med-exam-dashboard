import {test,expect} from '@playwright/test';
async function init(context,page){
 await context.route('**/durable-course-fixture',r=>r.fulfill({contentType:'text/html',body:'<title>Synthetic course sync only</title>'}));
 await page.goto('/durable-course-fixture');
 await page.evaluate(async()=>{
  const {createAccountStorage,routeAccountStorageEvents}=await import('/account-storage.js');
  const {createCourseSync}=await import('/src/study/course-sync.js');
  const {createMockDatabase}=await import('/tests/fixtures/mock-database.js');
  window.account=createAccountStorage(localStorage);account.bind('synthetic-browser-UID');routeAccountStorageEvents(window,account);window.storage=account.view();
  window.online=true;window.dates={};window.configure=()=>{window.engine=createCourseSync({storage,uid:'synthetic-browser-UID',valid:()=>account.read().bound,ready:()=>online,locks:navigator.locks,prepareDates:changes=>Object.fromEntries(Object.entries(changes).filter(([,v])=>v).map(([p])=>[p,'2026-10-15'])),acceptDates:input=>{for(const [p,d] of Object.entries(input))dates[p]??=d;return true;}});engine.attach(window.opener?.serverDB||window.serverDB);};
  window.raw=createMockDatabase({}, {delay:1});let first=true;window.serverDB={...raw,ref(path=''){const ref=raw.ref(path);return {...ref,update:patch=>{if(first&&window.holdFirst){first=false;return new Promise(resolve=>{window.release=async()=>{await ref.update(patch);resolve();};});}return ref.update(patch);}};}};
  configure();
 });
}
const empty=page=>expect.poll(()=>page.evaluate(()=>engine.inspect().pending.length)).toBe(0);
test('actual localStorage and Web Locks serialize same UID two-tab ABA as atomic batches',async({context,page})=>{
 await init(context,page);await page.evaluate(()=>{holdFirst=true;engine.enqueue({'videos/1':true,'videos/2':true});});await expect.poll(()=>page.evaluate(()=>typeof release)).toBe('function');
 const opened=context.waitForEvent('page');await page.evaluate(()=>window.open('/durable-course-fixture'));const other=await opened;
 await other.evaluate(async()=>{
  const {createAccountStorage,routeAccountStorageEvents}=await import('/account-storage.js');const {createCourseSync}=await import('/src/study/course-sync.js');window.account=createAccountStorage(localStorage);account.bind('synthetic-browser-UID');routeAccountStorageEvents(window,account);
  window.engine=createCourseSync({storage:account.view(),uid:'synthetic-browser-UID',valid:()=>true,ready:()=>true,locks:navigator.locks,acceptDates:()=>true});engine.attach(opener.serverDB);
  engine.enqueue({'videos/1':false,'videos/2':false});engine.enqueue({'videos/1':true,'videos/2':true});
 });
 expect(await page.evaluate(()=>engine.inspect().pending.length)).toBe(3);await page.evaluate(()=>release());await empty(page);await empty(other);
 expect(await page.evaluate(()=>raw.inspect().tree.videos)).toEqual({1:true,2:true});expect(await page.evaluate(()=>raw.inspect().writes.filter(w=>w.method==='update').length)).toBe(3);
 await other.evaluate(()=>engine.close());await page.evaluate(()=>engine.close());
});
test('local quota failure has no intent, date or remote mutation; acknowledgement cleanup failure never resends',async({context,page})=>{
 await init(context,page);
 const failure=await page.evaluate(()=>{
  const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.includes('med_exam_course_write_v2:'))throw new DOMException('Synthetic','QuotaExceededError');return set.call(this,key,value);};let message;
  try{engine.enqueue({'videos/1':true,'videos/2':true});}catch(error){message=error.message;}Storage.prototype.setItem=set;return {message,pending:engine.inspect().pending.length,dates,writes:raw.inspect().writes.length};
 });expect(failure.message).toContain('本機保存失敗');expect(failure.pending).toBe(0);expect(failure.dates).toEqual({});expect(failure.writes).toBe(0);
 await page.evaluate(async()=>{window.remove=Storage.prototype.removeItem;Storage.prototype.removeItem=function(key){if(key.includes('med_exam_course_write_v2:'))throw Error('Synthetic disk');return remove.call(this,key);};engine.enqueue({'videos/1':true});await engine.pump();});
 expect(await page.evaluate(()=>engine.inspect().pending.length)).toBe(1);expect(await page.evaluate(()=>raw.inspect().writes.filter(w=>w.method==='update').length)).toBe(1);
 await page.evaluate(async()=>{Storage.prototype.removeItem=remove;await engine.pump();});await empty(page);expect(await page.evaluate(()=>raw.inspect().writes.filter(w=>w.method==='update').length)).toBe(1);await page.evaluate(()=>engine.close());
});
test('refresh after offline local save restores a queued group without review',async({context,page})=>{
 await init(context,page);await page.evaluate(async()=>{online=false;engine.enqueue({'physiology/fc_p_1_a':true,'physiology/fc_p_1_c':true});await engine.pump();engine.close();});await init(context,page);await empty(page);
 expect(await page.evaluate(()=>raw.inspect().tree.physiology)).toEqual({fc_p_1_a:true,fc_p_1_c:true});expect(await page.evaluate(()=>engine.inspect().error)).toBe('');await page.evaluate(()=>engine.close());
});
test('course UI rolls back checkbox and whole chapter when its local journal cannot commit',async({page})=>{
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto('/');await page.waitForFunction(()=>window.updateWorkspace&&window.i3Runtime.read().status==='ready');await page.evaluate(()=>window.showStudyItem('physiology','fc_p_1_a'));
 const row=page.locator('[data-study-key="physiology__fc_p_1_a"]'),messages=[];page.on('dialog',async dialog=>{messages.push(dialog.message());await dialog.accept();});
 await page.evaluate(()=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.includes('med_exam_course_write_v2:'))throw new DOMException('Synthetic','QuotaExceededError');return originalSet.call(this,key,value);};});
 await row.locator('input[type=checkbox]').click();await expect(row.locator('input[type=checkbox]')).not.toBeChecked();expect(await page.evaluate(()=>window.readStudyStates().physiology.fc_p_1_a||false)).toBe(false);expect(messages[0]).toContain('本機保存失敗');
 await page.locator('[data-group="physiology__甲"]').getByRole('button',{name:/^全選：/}).click();expect(await page.evaluate(()=>Object.values(window.readStudyStates().physiology).some(Boolean))).toBe(false);expect(messages[1]).toContain('本機保存失敗');expect(await page.evaluate(()=>window.courseDates.records().physiology__fc_p_1_a)).toBeUndefined();
 await page.evaluate(()=>Storage.prototype.setItem=originalSet);await row.locator('input[type=checkbox]').click();await expect(row.locator('input[type=checkbox]')).toBeChecked();await expect.poll(()=>page.evaluate(()=>window.courseSync.inspect().pending.length)).toBe(0);expect(await page.evaluate(()=>window.learningDB)).toBe(null);
});
