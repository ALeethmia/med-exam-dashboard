// 世界座標與鏡頭運算不依賴 DOM、平台或業務資料。
const bounded=(value,min,max)=>Math.max(min,Math.min(max,value));
export function fitScale(view,world,padding=24){return Math.min(Math.max(1,view.width-padding*2)/world.width,Math.max(1,view.height-padding*2)/world.height);}
export function constrainCamera(camera,view,world){
 const min=fitScale(view,world),scale=bounded(camera.scale,min,min*4);
 const limit=(offset,size,extent)=>extent<=size?(size-extent)/2:bounded(offset,size-extent-24,24);
 return {scale,x:limit(camera.x,view.width,world.width*scale),y:limit(camera.y,view.height,world.height*scale)};
}
export function fitCamera(view,world){const scale=fitScale(view,world);return {scale,x:(view.width-world.width*scale)/2,y:(view.height-world.height*scale)/2};}
export function worldPoint(point,camera){return {x:(point.x-camera.x)/camera.scale,y:(point.y-camera.y)/camera.scale};}
export function zoomCamera(camera,factor,point,view,world){const p=worldPoint(point,camera),scale=bounded(camera.scale*factor,fitScale(view,world),fitScale(view,world)*4);return constrainCamera({scale,x:point.x-p.x*scale,y:point.y-p.y*scale},view,world);}
export function panCamera(camera,delta,view,world){return constrainCamera({...camera,x:camera.x+delta.x,y:camera.y+delta.y},view,world);}
export function createCamera(initialView,world){
 let view={...initialView},value=fitCamera(view,world);
 return {read:()=>({...value}),view:()=>({...view}),reset:()=>value=fitCamera(view,world),pan:delta=>value=panCamera(value,delta,view,world),zoom:(factor,point)=>value=zoomCamera(value,factor,point,view,world),resize:next=>{
  const previousFit=fitScale(view,world),relative=value.scale/previousFit,center=worldPoint({x:view.width/2,y:view.height/2},value);view={...next};
  if(Math.abs(relative-1)<0.001)value=fitCamera(view,world);
  else {const scale=fitScale(view,world)*relative;value=constrainCamera({scale,x:view.width/2-center.x*scale,y:view.height/2-center.y*scale},view,world);}
  return {...value};
 }};
}
