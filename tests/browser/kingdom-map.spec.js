import {test,expect} from '@playwright/test';
async function ready(page){await page.goto('/kingdom-preview.html');await expect(page.locator('[data-zoom]')).toHaveText('100%');}
test.beforeEach(async({page})=>{await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());});
for(const width of [320,390,768,1440])test('地圖全景與控制項在 '+width+'px 無溢出',async({page})=>{
 await page.setViewportSize({width,height:900});await ready(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.locator('[data-building]')).toHaveCount(3);
 const visible=await page.locator('[data-map]').evaluate(svg=>{const scene=svg.querySelector('[data-scene]').getBoundingClientRect(),view=svg.getBoundingClientRect();return scene.left>=view.left-1&&scene.right<=view.right+1&&scene.top>=view.top-1&&scene.bottom<=view.bottom+1;});expect(visible).toBe(true);
 if(width===390||width===1440)await page.screenshot({path:'docs/screenshots/kingdom-map-preview-'+(width===390?'mobile':'desktop')+'.png',fullPage:true});
});
test('滾輪縮放有邊界，拖曳建築不會選取，點擊與鍵盤可操作',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await ready(page);const map=page.locator('[data-map]');await page.locator('[data-wheel-mode]').selectOption('zoom');await map.hover();await page.mouse.wheel(0,-300);await expect(page.locator('[data-zoom]')).not.toHaveText('100%');
 for(let i=0;i<10;i++)await page.mouse.wheel(0,-300);await expect(page.locator('[data-zoom]')).toHaveText('400%');await page.getByRole('button',{name:'全景／重設'}).click();
 const b=await page.locator('[data-building=academy]').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+80,b.y+b.height/2,{steps:5});await page.mouse.up();await expect(page.locator('[data-stage]')).toBeDisabled();
 await page.getByRole('button',{name:'全景／重設'}).click();await page.locator('[data-building=academy]').click();await expect(page.locator('[data-status]')).toContainText('奧術學院');
 await map.focus();await page.keyboard.press('+');await expect(page.locator('[data-zoom]')).toHaveText('120%');await page.keyboard.press('ArrowRight');await page.keyboard.press('Home');await expect(page.locator('[data-zoom]')).toHaveText('100%');
 await page.locator('[data-building=barracks]').focus();await page.keyboard.press('Enter');await expect(page.locator('[data-status]')).toContainText('皇家兵營');
});
test('雙指與 pointercancel 清理手勢，不留下誤觸或卡住的指標',async({page})=>{
 await ready(page);await page.locator('[data-map]').evaluate(svg=>{
  const r=svg.getBoundingClientRect();svg.setPointerCapture=()=>{};svg.hasPointerCapture=()=>false;
  const fire=(type,id,x)=>svg.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'touch',pointerId:id,clientX:r.left+x,clientY:r.top+150}));
  fire('pointerdown',1,150);fire('pointerdown',2,250);fire('pointermove',2,350);fire('pointercancel',1,150);fire('pointermove',2,600);
 });await expect(page.locator('[data-stage]')).toBeDisabled();await expect(page.locator('[data-zoom]')).toHaveText('200%');await page.getByRole('button',{name:'全景／重設'}).click();await page.locator('[data-building=keep]').click();await expect(page.locator('[data-status]')).toContainText('王國要塞');
});
test('預覽沒有持久化寫入或業務初始化，重新載入清除模擬',async({page})=>{
 const requests=[];page.on('request',r=>requests.push(r.url()));
 await page.addInitScript(()=>{
  const original=Storage.prototype.setItem;original.call(localStorage,'med_exam_pending_writes_v1','{"videos/1":true}');original.call(localStorage,'audit-sentinel','保留');
  window.auditBefore=JSON.stringify(Object.entries(localStorage).sort());window.auditWrites=[];
  for(const name of ['setItem','removeItem','clear']){Storage.prototype[name]=function(){window.auditWrites.push(name);throw new Error('預覽不得寫入儲存');};}
  indexedDB.open=()=>{window.auditWrites.push('indexedDB.open');throw new Error('預覽不得開啟資料庫');};
 });await ready(page);await page.locator('[data-select=academy]').click();await page.locator('[data-stage]').selectOption('5');await page.locator('[data-wheel-mode]').selectOption('zoom');await expect(page.locator('[data-status]')).toContainText('5 / 5');
 await page.evaluate(()=>{dispatchEvent(new Event('online'));dispatchEvent(new Event('storage'));document.dispatchEvent(new Event('visibilitychange'));});
 expect(await page.evaluate(()=>({writes:window.auditWrites,same:JSON.stringify(Object.entries(localStorage).sort())===window.auditBefore,business:typeof window.learningDB}))).toEqual({writes:[],same:true,business:'undefined'});
 expect(requests.some(url=>/firebase|auth\.js|workspace\.js|sync\.js|store\.js|theme\.js/.test(url))).toBe(false);await page.reload();await expect(page.locator('[data-building=academy]')).toHaveAttribute('aria-label','奧術學院，模擬階段 1 / 5');await expect(page.locator('[data-stage]')).toBeDisabled();await expect(page.locator('[data-wheel-mode]')).toHaveValue('auto');
});
test('二十次掛載與清理移除場景、observer 及輸入，離開預覽可回到正式介面',async({page})=>{
 await ready(page);const result=await page.evaluate(async()=>{
  const {mountPreview}=await import('/kingdom-preview.js');let passed=true;
  for(let i=0;i<20;i++){const root=document.querySelector('[data-preview]').cloneNode(true);root.querySelector('[data-map]').replaceChildren();document.body.append(root);const instance=mountPreview(root);root.querySelector('[data-select=academy]').click();const before=root.querySelector('[data-status]').textContent;instance.dispose();instance.dispose();root.querySelector('[data-select=keep]').click();root.querySelector('[data-map]').dispatchEvent(new WheelEvent('wheel',{deltaY:-100,cancelable:true}));passed&&=root.querySelector('[data-status]').textContent===before&&root.querySelectorAll('[data-scene]').length===0;root.remove();}
  return passed;
 });expect(result).toBe(true);await page.getByRole('link',{name:'離開預覽，返回 Dashboard'}).click();await page.waitForFunction(()=>typeof window.updateWorkspace==='function');await expect(page.locator('[data-map]')).toHaveCount(0);await page.goBack();await expect(page.locator('[data-scene]')).toHaveCount(1);
});

test('觸控模擬的雙指縮放正常，地圖外仍可捲動頁面',async({page})=>{
 await page.setViewportSize({width:390,height:600});await ready(page);const client=await page.context().newCDPSession(page);await client.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
 const r=await page.locator('[data-map]').boundingBox();const points=[{x:r.x+100,y:r.y+140,id:1},{x:r.x+200,y:r.y+140,id:2}];await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[points[0],{...points[1],x:r.x+270}]});await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(page.locator('[data-zoom]')).not.toHaveText('100%');await expect(page.locator('[data-stage]')).toBeDisabled();
 await page.getByRole('button',{name:'全景／重設'}).click();await page.locator('footer').scrollIntoViewIfNeeded();const before=await page.evaluate(()=>scrollY);await page.mouse.move(10,20);await page.mouse.wheel(0,-400);await expect.poll(()=>page.evaluate(()=>scrollY)).toBeLessThan(before);await expect(page.locator('[data-zoom]')).toHaveText('100%');await client.detach();
});

test('macOS Chrome 回報情境：拖曳 SVG 文字不反白，地圖外仍可選取與複製',async({page,context})=>{
 // 本機以 Chromium 驗證原生選取路徑；不宣稱已在 macOS 實機執行。
 await page.setViewportSize({width:1440,height:1000});await ready(page);
 const map=page.locator('[data-map]'),label=page.locator('[data-building=academy] text').filter({hasText:'奧術學院'});
 const bounds=await map.boundingBox(),text=await label.boundingBox();
 await page.mouse.move(text.x+3,text.y+text.height/2);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width+20,bounds.y+bounds.height+30,{steps:15});await page.mouse.up();
 expect(await page.evaluate(()=>getSelection().toString())).toBe('');await expect(page.locator('[data-stage]')).toBeDisabled();
 await page.getByRole('button',{name:'全景／重設'}).click();await page.locator('[data-building=academy]').click();await expect(page.locator('[data-status]')).toContainText('奧術學院');await expect(page.locator('[data-building=academy]')).toBeFocused();
 await page.keyboard.press('Enter');await page.keyboard.press('+');await expect(page.locator('[data-zoom]')).toHaveText('120%');await page.locator('[data-wheel-mode]').selectOption('zoom');await map.hover();await page.mouse.wheel(0,-100);await expect(page.locator('[data-zoom]')).not.toHaveText('120%');await map.focus();await page.keyboard.press('Home');await expect(page.locator('[data-zoom]')).toHaveText('100%');
 await page.locator('h1').scrollIntoViewIfNeeded();const heading=await page.locator('h1').boundingBox();await page.mouse.move(heading.x+1,heading.y+heading.height/2);await page.mouse.down();await page.mouse.move(heading.x+heading.width-1,heading.y+heading.height/2,{steps:15});await page.mouse.up();
 const selected=await page.evaluate(()=>getSelection().toString());expect(selected).toContain('艾瑟利亞');await context.grantPermissions(['clipboard-read','clipboard-write']);await page.keyboard.press('ControlOrMeta+c');expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(selected);
});

test('地圖滑鼠操作不留下上下焦點藍線，Tab 仍有清楚焦點提示',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await ready(page);const map=page.locator('[data-map]');
 await page.getByRole('button',{name:'全景／重設'}).focus();await page.keyboard.press('Tab');await expect(map).toBeFocused();
 expect(await map.evaluate(el=>({visible:el.matches(':focus-visible'),outline:getComputedStyle(el).outlineStyle,offset:getComputedStyle(el).outlineOffset}))).toEqual({visible:true,outline:'solid',offset:'-3px'});
 const r=await map.boundingBox();await page.mouse.move(r.x+20,r.y+20);await page.mouse.down();await page.mouse.move(r.x+80,r.y+40,{steps:4});await page.mouse.up();
 expect(await page.evaluate(()=>getSelection().toString())).toBe('');expect(await map.evaluate(el=>getComputedStyle(el).outlineStyle)).toBe('none');
 await page.getByRole('button',{name:'全景／重設'}).focus();await page.keyboard.press('Tab');await expect(map).toBeFocused();expect(await map.evaluate(el=>getComputedStyle(el).outlineStyle)).toBe('solid');await page.keyboard.press('Tab');await expect(page.locator('[data-building=academy]')).toBeFocused();expect(await page.locator('[data-building=academy] > polygon').first().evaluate(el=>getComputedStyle(el).strokeWidth)).toBe('5px');
});

test('Chrome wheel 模擬：雙指滑動優先平移，捏合與滑鼠模式縮放',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await ready(page);const map=page.locator('[data-map]');await page.getByRole('button',{name:'放大',exact:true}).click();const scene=page.locator('[data-scene]');const before=await scene.getAttribute('transform');
 await map.dispatchEvent('wheel',{deltaMode:0,deltaX:24,deltaY:36});await expect(scene).not.toHaveAttribute('transform',before);await expect(page.locator('[data-zoom]')).toHaveText('120%');
 await map.dispatchEvent('wheel',{deltaMode:0,deltaY:-40,ctrlKey:true});await expect(page.locator('[data-zoom]')).not.toHaveText('120%');
 await page.locator('[data-wheel-mode]').selectOption('zoom');await page.getByRole('button',{name:'全景／重設'}).click();await map.hover();await page.mouse.wheel(0,-100);await expect(page.locator('[data-zoom]')).not.toHaveText('100%');
 await page.locator('[data-wheel-mode]').selectOption('pan');const zoom=await page.locator('[data-zoom]').textContent();await map.dispatchEvent('wheel',{deltaMode:0,deltaX:0,deltaY:100});await expect(page.locator('[data-zoom]')).toHaveText(zoom);
 await map.dispatchEvent('wheel',{deltaMode:0,deltaY:-40,ctrlKey:true});await expect(page.locator('[data-zoom]')).not.toHaveText(zoom);await page.reload();await expect(page.locator('[data-wheel-mode]')).toHaveValue('auto');
});

test('滑鼠冷啟動點擊地圖與建築沒有原生矩形框，選取與 Tab 焦點不同',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await ready(page);const map=page.locator('[data-map]'),building=page.locator('[data-building=academy]');
 const inspect=el=>({focus:el.matches(':focus'),visible:el.matches(':focus-visible'),outline:getComputedStyle(el).outlineStyle});
 // 另外模擬 Chrome 可能出現的 :focus 而非 :focus-visible，避免只測單一平台啟發式。
 const client=await page.context().newCDPSession(page);await client.send('DOM.enable');await client.send('CSS.enable');const {root}=await client.send('DOM.getDocument');const forced=[];
 for(const selector of ['[data-map]','[data-building=academy]']){const {nodeId}=await client.send('DOM.querySelector',{nodeId:root.nodeId,selector});await client.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:['focus']});forced.push(await page.locator(selector).evaluate(inspect));await client.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[]});}
 await client.detach();for(const state of forced){expect(state.visible).toBe(false);expect(state.outline).toBe('none');}

 const r=await map.boundingBox();await page.mouse.click(r.x+20,r.y+20);const rootState=await map.evaluate(inspect);await building.click();const buildingState=await building.evaluate(inspect);
 expect(rootState.outline).toBe('none');expect(buildingState.outline).toBe('none');
 await expect(building).toHaveAttribute('aria-pressed','true');await expect(building).toHaveAttribute('tabindex','0');const base=building.locator('> polygon').first();const selected=await base.evaluate(el=>({stroke:getComputedStyle(el).stroke,width:getComputedStyle(el).strokeWidth,dash:getComputedStyle(el).strokeDasharray}));expect(selected.width).toBe('3px');expect(selected.dash).toBe('none');
 await page.getByRole('button',{name:'全景／重設'}).focus();await page.keyboard.press('Tab');await expect(map).toBeFocused();expect(await map.evaluate(el=>getComputedStyle(el).outlineStyle)).toBe('solid');await page.keyboard.press('Tab');await expect(building).toBeFocused();expect(await building.evaluate(el=>getComputedStyle(el).outlineStyle)).toBe('none');
 const keyboard=await base.evaluate(el=>({stroke:getComputedStyle(el).stroke,width:getComputedStyle(el).strokeWidth,dash:getComputedStyle(el).strokeDasharray}));expect(keyboard.width).toBe('5px');expect(keyboard.stroke).not.toBe(selected.stroke);expect(keyboard.dash).not.toBe('none');
 await page.keyboard.press('Tab');await expect(page.locator('[data-building=keep]')).toBeFocused();await expect(building).toHaveAttribute('aria-pressed','true');expect(await base.evaluate(el=>getComputedStyle(el).strokeWidth)).toBe('3px');
});

test('觸控板捏合靈敏度提高為 1.5 倍，普通滾輪與按鈕速度不變',async({page})=>{
 await ready(page);const map=page.locator('[data-map]');await map.dispatchEvent('wheel',{deltaMode:0,deltaY:-50,ctrlKey:true});await expect(page.locator('[data-zoom]')).toHaveText('116%');
 await page.getByRole('button',{name:'全景／重設'}).click();await page.locator('[data-wheel-mode]').selectOption('zoom');await map.dispatchEvent('wheel',{deltaMode:0,deltaY:-50,ctrlKey:false});await expect(page.locator('[data-zoom]')).toHaveText('111%');
 await page.getByRole('button',{name:'全景／重設'}).click();await page.getByRole('button',{name:'放大',exact:true}).click();await expect(page.locator('[data-zoom]')).toHaveText('120%');
});

test('地圖平移與建築空間導覽分開，選取、Esc、Tab 及焦點提示相容',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await ready(page);const map=page.locator('[data-map]'),scene=page.locator('[data-scene]'),academy=page.locator('[data-building=academy]'),keep=page.locator('[data-building=keep]'),barracks=page.locator('[data-building=barracks]');
 await page.getByRole('button',{name:'放大',exact:true}).click();await page.getByRole('button',{name:'放大',exact:true}).click();await map.focus();const initial=await scene.getAttribute('transform');await page.keyboard.press('ArrowRight');await expect(scene).not.toHaveAttribute('transform',initial);const outline=await map.evaluate(el=>getComputedStyle(el).outlineStyle);await page.keyboard.press('ArrowRight');expect(await map.evaluate(el=>getComputedStyle(el).outlineStyle)).toBe(outline);
 await page.getByRole('button',{name:'全景／重設'}).click();await academy.focus();const before=await scene.getAttribute('transform');await page.keyboard.press('ArrowLeft');await expect(academy).toBeFocused();await page.keyboard.press('ArrowRight');await expect(keep).toBeFocused();await page.keyboard.press('ArrowRight');await expect(barracks).toBeFocused();await page.keyboard.press('ArrowRight');await expect(barracks).toBeFocused();await expect(scene).toHaveAttribute('transform',before);await expect(page.locator('[data-stage]')).toBeDisabled();
 await page.keyboard.press('Enter');await expect(barracks).toHaveAttribute('aria-pressed','true');await page.keyboard.press('ArrowLeft');await expect(keep).toBeFocused();await expect(barracks).toHaveAttribute('aria-pressed','true');await expect(keep).toHaveAttribute('aria-pressed','false');await page.keyboard.press('ArrowDown');await expect(keep).toBeFocused();await page.keyboard.press('Space');await expect(keep).toHaveAttribute('aria-pressed','true');await page.keyboard.press('Escape');await expect(map).toBeFocused();expect(await map.evaluate(el=>getComputedStyle(el).outlineStyle)).toBe('solid');
 await page.keyboard.press('Tab');await expect(academy).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(map).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(page.getByRole('button',{name:'全景／重設'})).toBeFocused();await page.keyboard.press('Tab');await expect(map).toBeFocused();await page.keyboard.press('Tab');await expect(academy).toBeFocused();await page.keyboard.press('ArrowDown');await expect(keep).toBeFocused();
 await page.locator('[data-wheel-mode]').focus();await page.keyboard.press('ArrowDown');await expect(page.locator('[data-wheel-mode]')).toHaveValue('zoom');await expect(scene).toHaveAttribute('transform',before);
});
