import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {chromium} from 'playwright';
const base=process.env.HOST_URL||'http://127.0.0.1:8812';
const aliases=JSON.parse(readFileSync(new URL('../../config/legacy-assets.json',import.meta.url)));
let legacyURLs=0;
for(const [oldPath,newPath] of Object.entries(aliases)){
 const old=await fetch(base+'/'+oldPath+'?layout-check=1',{redirect:'manual'});
 assert.equal(old.status,200,oldPath);assert.equal(old.headers.get('location'),null);
 const expected=oldPath.endsWith('.js')?'compat/'+oldPath:newPath;assert.equal(await old.text(),readFileSync(new URL('../../'+expected,import.meta.url),'utf8'));
 assert.match(old.headers.get('cache-control'),/no-store/);
 const current=await fetch(base+'/'+newPath);
 assert.equal(current.status,200,newPath);assert.match(current.headers.get('content-type'),newPath.endsWith('.css')?/text\/css/:/javascript/);
 assert.equal(await current.text(),readFileSync(new URL('../../'+newPath,import.meta.url),'utf8'),newPath);
 assert.match(current.headers.get('cache-control'),/no-store/);legacyURLs++;
}
const pure=JSON.parse(readFileSync(new URL('../../docs/REPOSITORY_LAYOUT_B_MAP.json',import.meta.url))).files.filter(f=>f.action==='move-with-compatibility-export').map(f=>[f.from,f.implementation]);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});let checks=0;
try{
 for(const width of [1440,390,320]){
  const c=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});const p=await c.newPage(),errors=[],bad=[];
  await c.addInitScript(()=>{const values=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>values.get(String(k))??null,setItem:(k,v)=>values.set(String(k),String(v)),removeItem:k=>values.delete(String(k)),key:i=>[...values.keys()][i]??null,get length(){return values.size;}}});});
  await c.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
  p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400&&new URL(r.url()).pathname!=='/favicon.ico')bad.push(r.url());});
  await p.goto(base+'/?mode=local');await p.waitForFunction(()=>window.updateWorkspace&&window.i3Runtime.read().status==='ready');
  await p.evaluate(()=>window.switchTab('home'));assert(await p.locator('#task-list').count());
  await p.evaluate(()=>window.switchTab('physiology'));assert(await p.locator('[data-study-key="physiology__fc_p_1_a"]').isVisible());
  await p.evaluate(()=>window.switchTab('kingdom'));assert(await p.locator('#kingdom-lite-map').isVisible());assert.equal(await p.locator('.building-details').count(),3);assert.equal((await p.locator('#sync-status').textContent()).trim(),'本機模式');
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks+=4;
  const identity=await p.evaluate(async pairs=>{for(const [old,canonical] of pairs){const a=await import('/'+old),b=await import('/'+canonical);if(JSON.stringify(Object.keys(a))!==JSON.stringify(Object.keys(b))||Object.keys(a).some(k=>a[k]!==b[k]))return false;}return true;},pure);
  assert(identity,'old/canonical ESM must share module identity');checks++;
  await p.goto(base+'/kingdom-preview.html');await p.waitForFunction(()=>document.querySelector('svg'));
  assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);checks++;await c.close();
 }
}finally{await browser.close();}
console.log(JSON.stringify({legacyURLs,browserChecks:checks,widths:[1440,390,320],errors:0,scope:'Local HTTP assets and RAM-only browser; no real Firebase'}));
