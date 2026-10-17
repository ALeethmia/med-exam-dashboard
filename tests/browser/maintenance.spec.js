import {test,expect} from '@playwright/test';

for(const width of [390,1440])test('maintenance artifact blocks startup, storage writes and Firebase at '+width,async({page})=>{
 await page.setViewportSize({width,height:900});
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());requests.push(u.pathname);
  if(u.hostname!=='127.0.0.1')return route.abort();
  if(u.pathname==='/src/ui/maintenance-config.js')return route.fulfill({contentType:'text/javascript',body:'export const maintenanceEnabled = true;'});
  return route.continue();
 });
 await page.addInitScript(cloud=>{
  if(cloud)Object.defineProperty(window,'workspaceLocalOnly',{get:()=>false,set(){}});
  // Both UID history and Auth-like keys pre-exist before write instrumentation.
  localStorage.setItem('becoming_uid_v1:synthetic-owner:pending','synthetic-pending');localStorage.setItem('firebase:synthetic-auth','keep-auth');sessionStorage.setItem('synthetic-session','keep');
  window.maintenanceWrites=[];
  for(const method of ['setItem','removeItem','clear']){const original=Storage.prototype[method];Storage.prototype[method]=function(...args){maintenanceWrites.push({method,args});return original.apply(this,args);};}
  const forbidden=()=>{throw Error('Firebase startup forbidden during maintenance');};window.firebase={apps:[],initializeApp:forbidden,auth:forbidden,database:forbidden};
  for(const method of ['open','deleteDatabase'])indexedDB[method]=()=>{maintenanceWrites.push({method:'indexedDB.'+method});throw Error('IndexedDB startup forbidden during maintenance');};
 },width===390);
 // A local-mode URL must not bypass the artifact switch.
 await page.goto('/?mode=local');await expect(page.getByRole('heading',{name:'系統維護中'})).toBeVisible();await expect(page.locator('#maintenance')).toContainText('不會因維護模式而被清除');
 expect(await page.evaluate(()=>({learning:typeof window.updateWorkspace,sync:typeof window.courseSync,life:typeof window.lifeSession,db:typeof window.learningDB,storage:typeof window.learningStorage,account:typeof window.becomingStorage,runtime:typeof window.i3Runtime}))).toEqual({learning:'undefined',sync:'undefined',life:'undefined',db:'undefined',storage:'undefined',account:'undefined',runtime:'undefined'});
 expect(requests.filter(p=>/^\/(auth|sync|workspace|account-storage|i3-runtime|course-dates|life-store|daily-planner)\.js$/.test(p)||/\/course-sync\.js$/.test(p))).toEqual([]);
 expect(await page.evaluate(()=>maintenanceWrites)).toEqual([]);expect(await page.evaluate(()=>[localStorage.getItem('becoming_uid_v1:synthetic-owner:pending'),localStorage.getItem('firebase:synthetic-auth'),sessionStorage.getItem('synthetic-session')])).toEqual(['synthetic-pending','keep-auth','keep']);
 expect(await page.locator('input,button,dialog').count()).toBe(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
 await page.reload();await expect(page.getByRole('heading',{name:'系統維護中'})).toBeVisible();expect(await page.evaluate(()=>maintenanceWrites)).toEqual([]);
});

test('disabled artifact resumes the existing local flow only after a full reload',async({page})=>{
 let maintenance=true;await page.route('**/*',route=>{
  const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();
  if(u.pathname==='/src/ui/maintenance-config.js')return route.fulfill({contentType:'text/javascript',body:'export const maintenanceEnabled = '+maintenance+';'});
  return route.continue();
 });
 await page.goto('/');await expect(page.getByRole('heading',{name:'系統維護中'})).toBeVisible();maintenance=false;
 // Changing the next artifact response does not hot-start a stopped page.
 expect(await page.evaluate(()=>typeof window.updateWorkspace)).toBe('undefined');
 await page.reload();await page.waitForFunction(()=>typeof window.updateWorkspace==='function'&&i3Runtime.read().status==='ready');await expect(page.locator('#maintenance')).toHaveCount(0);
 expect(await page.evaluate(()=>window.learningDB)).toBe(null);expect(await page.evaluate(()=>workspaceLocalOnly)).toBe(true);
});
