import test from 'node:test';
import assert from 'node:assert/strict';
import {fitCamera,fitScale,constrainCamera,zoomCamera,worldPoint,createCamera} from '../kingdom-map-core.js';
import {createPreviewState} from '../kingdom-preview-state.js';
import {BUILDING_MANIFEST,WORLD} from '../kingdom-building-manifest.js';
import {bindMapInput} from '../kingdom-map-input.js';
const view={width:960,height:600};
test('全景在不同尺寸保留世界邊界，縮放不超出四倍',()=>{
 for(const width of [288,358,736,1136]){const v={width,height:320},c=fitCamera(v,WORLD);assert.ok(c.x>=0&&c.y>=0);assert.ok(c.x+WORLD.width*c.scale<=width);assert.ok(c.y+WORLD.height*c.scale<=320);const maximum=constrainCamera({scale:999,x:999,y:-999},v,WORLD);assert.equal(maximum.scale,fitScale(v,WORLD)*4);const minimum=constrainCamera({scale:0,x:0,y:0},v,WORLD);assert.equal(minimum.scale,fitScale(v,WORLD));}
});
test('縮放錨點不漂移，拖曳限制與尺寸變更維持合理鏡頭',()=>{
 const camera=fitCamera(view,WORLD),point={x:480,y:300},before=worldPoint(point,camera),next=zoomCamera(camera,2,point,view,WORLD);assert.deepEqual(worldPoint(point,next),before);
 const c=createCamera(view,WORLD);c.zoom(2,point);c.pan({x:1e6,y:-1e6});assert.equal(c.read().x,24);assert.equal(c.read().y,view.height-WORLD.height*c.read().scale-24);c.resize({width:390,height:320});assert.equal(c.read().scale,fitScale(c.view(),WORLD)*2);c.reset();assert.deepEqual(c.read(),fitCamera(c.view(),WORLD));
});
test('模擬快照與選取只存在記憶體，維持五階段及不可變輸出',()=>{
 const p=createPreviewState(BUILDING_MANIFEST);p.select('academy');p.setStage('academy',5);assert.equal(p.read().buildings[0].stage,5);assert.throws(()=>p.setStage('academy',6));assert.throws(()=>{p.read().buildings[0].stage=2;});assert.equal(createPreviewState(BUILDING_MANIFEST).read().buildings[0].stage,1);
});
class Surface extends EventTarget {
 constructor(){super();this.clientWidth=960;this.clientHeight=600;this.captured=new Set();}
 getBoundingClientRect(){return {left:0,top:0};}
 setPointerCapture(id){this.captured.add(id);}
 hasPointerCapture(id){return this.captured.has(id);}
 releasePointerCapture(id){this.captured.delete(id);}
}
function send(surface,type,values={}){const e=new Event(type,{cancelable:true});Object.assign(e,{pointerId:1,pointerType:'touch',button:0,clientX:100,clientY:100,...values});surface.dispatchEvent(e);return e;}
test('拖曳、雙指與取消不選建築，解除綁定後沒有殘留輸入',()=>{
 const s=new Surface(),calls=[];const input=bindMapInput(s,{pan:p=>calls.push(['pan',p]),zoom:(f,p)=>calls.push(['zoom',f,p]),reset:()=>calls.push(['reset']),select:id=>calls.push(['select',id])});
 send(s,'pointerdown');send(s,'pointermove',{clientX:160});send(s,'pointerup');assert.ok(calls.some(c=>c[0]==='pan'));assert.ok(!calls.some(c=>c[0]==='select'));
 send(s,'pointerdown');send(s,'pointerdown',{pointerId:2,clientX:200});send(s,'pointermove',{pointerId:2,clientX:300});assert.ok(calls.some(c=>c[0]==='zoom'&&c[1]===2));send(s,'pointercancel');assert.equal(s.captured.size,0);
 assert.equal(send(s,'wheel',{deltaY:-100,deltaMode:1}).defaultPrevented,true);assert.equal(send(s,'keydown',{key:'Home'}).defaultPrevented,true);
 s.closest=()=>({dataset:{building:"academy"}});send(s,"pointerdown");send(s,"pointerup");assert.equal(calls.at(-1)[0],"select");
 const count=calls.length;input.dispose();input.dispose();send(s,'wheel',{deltaY:100});send(s,'keydown',{key:'Home'});send(s,'pointerdown');assert.equal(calls.length,count);assert.equal(s.captured.size,0);
});
test('多次綁定與清理不累積 wheel 處理器',()=>{
 const s=new Surface();let count=0;
 for(let i=0;i<20;i++){const input=bindMapInput(s,{pan:()=>{},zoom:()=>count++,reset:()=>{},select:()=>{}});send(s,'wheel',{deltaY:10,deltaMode:0});assert.equal(count,i+1);input.dispose();send(s,'wheel',{deltaY:10,deltaMode:0});assert.equal(count,i+1);}
});
test('地圖僅阻止主要滑鼠按鍵的原生選取與拖曳，清理後不攔截事件',()=>{
 const surface=new Surface();let focused=0;surface.focus=()=>focused++;
 const input=bindMapInput(surface,{pan:()=>{},zoom:()=>{},reset:()=>{},select:()=>{}});
 assert.equal(send(surface,'pointerdown',{pointerType:'mouse',button:2}).defaultPrevented,false);assert.equal(focused,0);
 assert.equal(send(surface,'pointerdown',{pointerType:'mouse'}).defaultPrevented,true);assert.equal(focused,1);send(surface,'pointerup',{pointerType:'mouse'});
 assert.equal(send(surface,'pointerdown',{pointerType:'touch'}).defaultPrevented,false);send(surface,'pointercancel');assert.equal(send(surface,'dragstart').defaultPrevented,true);
 input.dispose();assert.equal(send(surface,'dragstart').defaultPrevented,false);assert.equal(send(surface,'pointerdown',{pointerType:'mouse'}).defaultPrevented,false);
});
