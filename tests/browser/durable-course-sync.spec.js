import {test,expect} from '@playwright/test';
async function init(context,page){
 await context.route('**/durable-course-fixture',route=>route.fulfill({contentType:'text/html',body:'<title>Synthetic course sync</title>'}));await page.goto('/durable-course-fixture');
 await page.evaluate(async()=>{
  const {createAccountStorage,routeAccountStorageEvents}=await import('/account-storage.js'),{createCourseSync}=await import('/src/study/course-sync.js'),{createMockDatabase}=await import('/tests/fixtures/mock-database.js');
  window.account=createAccountStorage(localStorage);account.bind('synthetic-browser-UID');routeAccountStorageEvents(window,account);window.storage=account.view();window.online=true;window.raw=createMockDatabase({}, {delay:0});let first=true;
  window.serverDB={...raw,ref(path){const ref=raw.ref(path);return {...ref,transaction:(...args)=>{if(first&&window.holdFirst){first=false;return new Promise(resolve=>window.release=async()=>resolve(await ref.transaction(...args)));}return ref.transaction(...args);}};}};
  window.engine=createCourseSync({storage,uid:'synthetic-browser-UID',valid:()=>account.read().bound,ready:()=>online,locks:navigator.locks,events:window});engine.attach(serverDB);
 });
}
const empty=page=>expect.poll(()=>page.evaluate(()=>engine.inspect().pending.length)).toBe(0);
test('native IndexedDB fallback handles same UID two-tab takeover and late callbacks without Web Locks',async({context,page})=>{
 await context.addInitScript(()=>Object.defineProperty(navigator,'locks',{value:undefined}));await init(context,page);await page.evaluate(()=>{holdFirst=true;engine.enqueue({'videos/1':true,'videos/2':true});});await expect.poll(()=>page.evaluate(()=>typeof release)).toBe('function');
 const opened=context.waitForEvent('page');await page.evaluate(()=>window.open('/durable-course-fixture'));const other=await opened;
 await other.evaluate(async()=>{const {createAccountStorage,routeAccountStorageEvents}=await import('/account-storage.js'),{createCourseSync}=await import('/src/study/course-sync.js');window.account=createAccountStorage(localStorage);account.bind('synthetic-browser-UID');routeAccountStorageEvents(window,account);window.engine=createCourseSync({storage:account.view(),uid:'synthetic-browser-UID',valid:()=>true,ready:()=>true,events:window});engine.attach(opener.serverDB);engine.enqueue({'videos/1':false,'videos/2':false});engine.enqueue({'videos/1':true,'videos/2':true});});
 await empty(other);await page.evaluate(()=>release());await empty(page);await empty(other);
 expect(await page.evaluate(()=>raw.inspect().tree.users['synthetic-browser-UID'].learningV3.courses.videos)).toEqual({1:true,2:true});expect(await page.evaluate(()=>raw.inspect().tree.users['synthetic-browser-UID'].learningV3.clock)).toBe(3);
 await other.evaluate(()=>engine.close());await page.evaluate(()=>engine.close());
});
test('quota failure exposes no partial batch and a failed local settlement never repeats the server mutation',async({context,page})=>{
 await init(context,page);const failure=await page.evaluate(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.includes('med_exam_course_write_v3:'))throw new DOMException('Synthetic','QuotaExceededError');return set.call(this,key,value);};let message;try{engine.enqueue({'videos/1':true,'videos/2':true});}catch(error){message=error.message;}Storage.prototype.setItem=set;return {message,pending:engine.inspect().pending.length,writes:raw.inspect().writes.length};});expect(failure.message).toContain('本機保存失敗');expect(failure.pending).toBe(0);expect(failure.writes).toBe(0);
 await page.evaluate(async()=>{window.remove=Storage.prototype.removeItem;Storage.prototype.removeItem=function(key){if(key.includes('med_exam_course_write_v3:'))throw Error('disk');return remove.call(this,key);};engine.enqueue({'videos/1':true});await engine.pump();});expect(await page.evaluate(()=>engine.inspect().pending.length)).toBe(1);
 await page.evaluate(async()=>{Storage.prototype.removeItem=remove;await engine.pump();});await empty(page);expect(await page.evaluate(()=>raw.inspect().tree.users['synthetic-browser-UID'].learningV3.clock)).toBe(1);await page.evaluate(()=>engine.close());
});
test('offline saved chapter survives refresh and automatically applies once without a review choice',async({context,page})=>{
 await init(context,page);await page.evaluate(async()=>{online=false;engine.enqueue({'physiology/fc_p_1_a':true,'physiology/fc_p_1_c':true});await engine.pump();engine.close();});await init(context,page);await empty(page);expect(await page.evaluate(()=>raw.inspect().tree.users['synthetic-browser-UID'].learningV3.courses.physiology)).toEqual({fc_p_1_a:true,fc_p_1_c:true});await page.evaluate(()=>engine.close());
});
test('actual course UI rolls back checkbox and whole chapter if local intent persistence fails',async({page})=>{
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto('/');await page.waitForFunction(()=>window.updateWorkspace&&i3Runtime.read().status==='ready');await page.evaluate(()=>showStudyItem('physiology','fc_p_1_a'));
 const row=page.locator('[data-study-key="physiology__fc_p_1_a"]'),messages=[];page.on('dialog',async dialog=>{messages.push(dialog.message());await dialog.accept();});
 await page.evaluate(()=>{window.set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.includes('med_exam_course_write_v3:'))throw Error('quota');return set.call(this,key,value);};});await row.locator('input[type=checkbox]').click();await expect(row.locator('input[type=checkbox]')).not.toBeChecked();await page.locator('[data-group="physiology__甲"]').getByRole('button',{name:/^全選：/}).click();expect(await page.evaluate(()=>Object.values(readStudyStates().physiology).some(Boolean))).toBe(false);expect(messages).toHaveLength(2);expect(messages.every(message=>message.includes('本機保存失敗'))).toBe(true);
 await page.evaluate(()=>Storage.prototype.setItem=set);await row.locator('input[type=checkbox]').click();await expect(row.locator('input[type=checkbox]')).toBeChecked();await expect.poll(()=>page.evaluate(()=>courseSync.inspect().pending.length)).toBe(0);expect(await page.evaluate(()=>learningDB)).toBe(null);
});
