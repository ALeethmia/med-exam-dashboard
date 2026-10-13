import {WORLD,BUILDING_MANIFEST} from './kingdom-building-manifest.js';
import {createPreviewState} from './kingdom-preview-state.js';
import {createCamera,fitScale} from './kingdom-map-core.js';
import {createMapRenderer} from './kingdom-map-renderer.js';
import {bindMapInput} from './kingdom-map-input.js';
export function mountPreview(root){
 const svg=root.querySelector('[data-map]'),state=createPreviewState(BUILDING_MANIFEST),camera=createCamera({width:svg.clientWidth,height:svg.clientHeight},WORLD),renderer=createMapRenderer(svg,WORLD,BUILDING_MANIFEST);
 const status=root.querySelector('[data-status]'),stage=root.querySelector('[data-stage]'),controller=new AbortController();let disposed=false;
 function draw(){renderer.setCamera(camera.read());root.querySelector('[data-zoom]').textContent=Math.round(camera.read().scale/fitScale(camera.view(),WORLD)*100)+'%';}
 function render(){const snapshot=state.read();renderer.update(snapshot);const b=snapshot.buildings.find(b=>b.id===snapshot.selected);stage.disabled=!b;stage.value=String(b?.stage||1);status.textContent=b?`${b.title} · ${b.role} · 模擬階段 ${b.stage} / 5`:'選擇建築，檢查位置與互動。';root.querySelectorAll('[data-select]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.select===snapshot.selected)));}
 function select(id){state.select(id);render();}
 const reset=()=>{camera.reset();draw();},zoom=(factor,point)=>{camera.zoom(factor,point);draw();},pan=delta=>{camera.pan(delta);draw();};
 const input=bindMapInput(svg,{reset,zoom,pan,select,wheelMode:()=>root.querySelector('[data-wheel-mode]').value});
 root.querySelectorAll('[data-select]').forEach(button=>button.addEventListener('click',()=>select(button.dataset.select),{signal:controller.signal}));
 root.querySelector('[data-reset]').addEventListener('click',reset,{signal:controller.signal});
 for(const button of root.querySelectorAll('[data-zoom-factor]'))button.addEventListener('click',()=>zoom(Number(button.dataset.zoomFactor),{x:svg.clientWidth/2,y:svg.clientHeight/2}),{signal:controller.signal});
 stage.addEventListener('change',()=>{state.setStage(state.read().selected,Number(stage.value));render();},{signal:controller.signal});
 const observer=new ResizeObserver(()=>{camera.resize({width:svg.clientWidth,height:svg.clientHeight});draw();});observer.observe(svg);
 root.querySelector('[data-wheel-mode]').value='auto';
 draw();render();
 return {dispose(){if(disposed)return;disposed=true;input.dispose();observer.disconnect();controller.abort();renderer.dispose();}};
}
const root=document.querySelector('[data-preview]');
let instance=mountPreview(root);
// 支援離開、BFCache 恢復；清理所有輸入與尺寸觀察，不建立動畫迴圈。
addEventListener('pagehide',()=>{instance?.dispose();instance=null;});
addEventListener('pageshow',()=>{if(!instance)instance=mountPreview(root);});
