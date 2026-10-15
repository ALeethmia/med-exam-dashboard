import {icon,colors,roman} from './kingdom-lite-art.js';
const NS='http://www.w3.org/2000/svg';
function element(doc,tag,attrs={},text){const el=doc.createElementNS(NS,tag);for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));if(text!==undefined)el.textContent=text;return el;}
// I1 replaces presentation only; the existing renderer contract is unchanged.
export function createMapRenderer(svg,world,manifest){
 const doc=svg.ownerDocument,scene=element(doc,'g',{'data-scene':'',id:'scene'});
 scene.innerHTML='<rect width="1200" height="760" rx="30" fill="#eaf0e4"/><path d="M155 390Q200 150 420 180T1030 300Q1160 520 900 635T285 625Q90 550 155 390" fill="#e2ead7" stroke="#d3dfc9" stroke-width="2"/><path d="M310 370Q435 370 605 490Q750 400 895 370M605 490v150" fill="none" stroke="#d6cdb8" stroke-width="23" stroke-linecap="round"/><path d="M310 370Q435 370 605 490Q750 400 895 370M605 490v150" fill="none" stroke="#f7f0dd" stroke-width="16" stroke-linecap="round"/><g id="trees" fill="#c6d7ba" stroke="#8ea784" stroke-width="2"></g><text x="600" y="120" text-anchor="middle" fill="#99ac92" font-size="17" letter-spacing="7">初 始 之 地</text>';
 for(const [x,y] of [[240,225],[205,450],[390,565],[790,220],[990,470],[940,570],[450,230],[755,605]])scene.querySelector('#trees').innerHTML+=`<path d="M${x} ${y}v28m-19-12 19-41 19 41Z"/><path d="M${x+33} ${y+24}l8-13 8 13" fill="none" opacity=".5"/>`;
 const nodes=new Map();
 for(const b of manifest){
  const g=element(doc,'g',{transform:`translate(${b.x} ${b.y})`,'data-building':b.id,role:'button',tabindex:0,'aria-label':b.title,style:`color:${colors[b.id]}`});
  const glyph=element(doc,'g',{class:'building-glyph'}),ground=element(doc,'ellipse',{class:'ground',cy:30,rx:99,ry:32,fill:'#d4dfc7',stroke:'#b7c9ab','stroke-width':2});
  const art=element(doc,'g',{'data-art':''}),label=element(doc,'text',{y:82,'text-anchor':'middle',fill:'#34483f','font-size':23,'font-weight':600},b.title),stage=element(doc,'text',{y:111,'text-anchor':'middle',fill:'#6c7f68','font-size':17});
  glyph.append(element(doc,'rect',{x:-103,y:-116,width:206,height:240,fill:'transparent'}),ground,art,label,stage);g.append(glyph);scene.append(g);nodes.set(b.id,{g,art,stage,renderedStage:undefined});
 }
 svg.append(scene);
 return {focusBuilding(id){nodes.get(id)?.g.focus({preventScroll:true});},update(snapshot){for(const b of snapshot.buildings){const item=nodes.get(b.id);if(!item)continue;if(item.renderedStage!==b.stage){item.art.innerHTML=b.stage?icon(b.id,b.stage):'<text text-anchor="middle" y="0" font-size="60" fill="#718570">?</text>';item.renderedStage=b.stage;}item.stage.textContent=b.stage?`${b.previewing?"外觀預覽":"來源階段"} ${roman[b.stage-1]}`:"尚未取得";item.g.setAttribute('aria-pressed',String(snapshot.selected===b.id));item.g.setAttribute('aria-label',`${b.title}，${b.previewing?"外觀預覽":"來源階段"} ${b.stage?roman[b.stage-1]:"尚未取得"}${b.fixture?"，Fixture":""}`);}},setCamera(camera){scene.setAttribute('transform',`translate(${camera.x} ${camera.y}) scale(${camera.scale})`);},dispose(){scene.remove();nodes.clear();}};
}
