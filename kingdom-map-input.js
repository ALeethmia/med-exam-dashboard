// 輸入只發送鏡頭與選取意圖；不持有業務 store 或 Firebase。
// wheel 沒有可靠的硬體 ID；像素事件優先平移，歧義由使用者選擇模式。
export function wheelIntent(event,mode='auto'){
 if(event.ctrlKey)return 'zoom';
 if(mode==='zoom'||mode==='pan')return mode;
 return event.deltaMode===1||event.deltaMode===2?'zoom':'pan';
}
export function bindMapInput(surface,{pan,zoom,reset,select,wheelMode=()=> 'auto',navigate=()=>{}}){
 const listeners=[],pointers=new Map();let gesture=null,disposed=false;
 const listen=(type,fn,options)=>{surface.addEventListener(type,fn,options);listeners.push(()=>surface.removeEventListener(type,fn,options));};
 const local=event=>{const r=surface.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top};};
 const pair=()=>{const [a,b]=[...pointers.values()];return {center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},distance:Math.hypot(a.x-b.x,a.y-b.y)};};
 const clear=()=>{for(const id of pointers.keys())if(surface.hasPointerCapture?.(id))surface.releasePointerCapture(id);pointers.clear();gesture=null;};
 listen('pointerdown',event=>{
  if(event.pointerType==='mouse'&&event.button!==0||pointers.size>=2)return;
  // 阻止滑鼠啟動原生選取，同時明確保留建築與地圖的鍵盤焦點。
  if(event.pointerType==='mouse'){event.preventDefault();(event.target.closest?.('[data-building]')||surface).focus?.({preventScroll:true});}
  surface.setAttribute?.('data-pointer-focus','');
  const point=local(event);pointers.set(event.pointerId,point);surface.setPointerCapture?.(event.pointerId);
  if(pointers.size===1)gesture={start:point,last:point,dragged:false,building:event.target.closest?.('[data-building]')?.dataset.building};
  else gesture={pinch:true,previous:pair(),dragged:true};
 });
 listen('pointermove',event=>{
  if(!pointers.has(event.pointerId))return;
  const point=local(event);pointers.set(event.pointerId,point);
  if(pointers.size===2){const next=pair(),previous=gesture.previous;pan({x:next.center.x-previous.center.x,y:next.center.y-previous.center.y});if(previous.distance>0&&next.distance>0)zoom(next.distance/previous.distance,next.center);gesture.previous=next;return;}
  if(gesture.pinch)return;
  if(Math.hypot(point.x-gesture.start.x,point.y-gesture.start.y)>6)gesture.dragged=true;
  if(gesture.dragged)pan({x:point.x-gesture.last.x,y:point.y-gesture.last.y});gesture.last=point;
 });
 listen('pointerup',event=>{
  if(!pointers.has(event.pointerId))return;
  const point=local(event),moved=Math.hypot(point.x-(gesture.start?.x??point.x),point.y-(gesture.start?.y??point.y))>6;
  if(!gesture.dragged&&!gesture.pinch&&!moved&&gesture.building)select(gesture.building);
  pointers.delete(event.pointerId);if(surface.hasPointerCapture?.(event.pointerId))surface.releasePointerCapture(event.pointerId);
  if(!pointers.size)gesture=null;
 });
 listen('focusout',event=>{if(!surface.contains?.(event.relatedTarget))surface.removeAttribute?.('data-pointer-focus');});
 listen('dragstart',event=>event.preventDefault());
 listen('pointercancel',clear);listen('lostpointercapture',event=>{if(pointers.has(event.pointerId))clear();});
 listen('wheel',event=>{
  event.preventDefault();clear();const unit=event.deltaMode===1?16:event.deltaMode===2?surface.clientHeight:1;
  if(wheelIntent(event,wheelMode())==='pan')pan({x:-event.deltaX*unit,y:-event.deltaY*unit});
  // Chrome 捏合與 Ctrl＋滾輪共用訊號；僅此路徑提高為 1.5 倍。
  else zoom(Math.exp(-Math.max(-300,Math.min(300,event.deltaY*unit))*.002*(event.ctrlKey?1.5:1)),local(event));
 },{passive:false});
 listen('keydown',event=>{
  surface.removeAttribute?.('data-pointer-focus');
  const id=event.target.closest?.('[data-building]')?.dataset.building;
  if(id&&['Enter',' '].includes(event.key)){event.preventDefault();select(id);return;}
  const moves={ArrowLeft:{x:40,y:0},ArrowRight:{x:-40,y:0},ArrowUp:{x:0,y:40},ArrowDown:{x:0,y:-40}};
  if(id&&event.key==='Escape'){event.preventDefault();surface.focus?.({preventScroll:true});return;}
  if(moves[event.key]){event.preventDefault();if(id)navigate(id,event.key);else pan(moves[event.key]);}
  else if(['+','=','-','0','Home'].includes(event.key)){event.preventDefault();if(['0','Home'].includes(event.key))reset();else zoom(event.key==='-'?1/1.2:1.2,{x:surface.clientWidth/2,y:surface.clientHeight/2});}
 });
 return {dispose(){if(disposed)return;disposed=true;for(const remove of listeners)remove();clear();surface.removeAttribute?.('data-pointer-focus');}};
}
