const NS='http://www.w3.org/2000/svg';
function element(doc,tag,attrs={},text){const el=doc.createElementNS(NS,tag);for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));if(text!==undefined)el.textContent=text;return el;}
// 可替換的渲染介面：update、setCamera、dispose。沒有資料提交能力。
export function createMapRenderer(svg,world,manifest){
 const doc=svg.ownerDocument,scene=element(doc,'g',{'data-scene':''});
 scene.append(element(doc,'rect',{width:world.width,height:world.height,fill:'#e8ede4',rx:28}));
 const terrain=element(doc,'g',{fill:'#cad8bd',stroke:'#a6bc99','stroke-width':2});
 for(let row=0;row<5;row++)for(let col=0;col<7;col++){const x=600+(col-row-1)*76,y=125+(col+row)*40;terrain.append(element(doc,'polygon',{points:`${x},${y-40} ${x+76},${y} ${x},${y+40} ${x-76},${y}`}));}
 scene.append(terrain,element(doc,'path',{d:'M310 370 L605 490 L895 370',fill:'none',stroke:'#efe7d2','stroke-width':26,'stroke-linejoin':'round'}));
 const nodes=new Map();
 for(const b of manifest){
  const g=element(doc,'g',{transform:`translate(${b.x} ${b.y})`,'data-building':b.id,role:'button',tabindex:0,'aria-label':b.title});
  g.append(element(doc,'ellipse',{cy:38,rx:108,ry:28,fill:'#728965',opacity:.25}),element(doc,'polygon',{points:'-84,0 0,-44 84,0 0,44',fill:'#ddd6be',stroke:'#a7a18d','stroke-width':2}),element(doc,'path',{d:'M-60 0 L0 30 L60 0 V-70 L0-100 L-60-70Z',fill:'#eee8d9',stroke:'#b5b1a2','stroke-width':2}),element(doc,'polygon',{points:'-72,-70 0,-112 72,-70 0,-28',fill:b.color}),element(doc,'text',{y:-61,'text-anchor':'middle',fill:'#fff','font-size':30},b.symbol));
  const label=element(doc,'text',{y:81,'text-anchor':'middle',fill:'#28362e','font-size':22,'font-weight':600},b.title),stage=element(doc,'text',{y:107,'text-anchor':'middle',fill:'#536456','font-size':17});
  g.append(label,stage);scene.append(g);nodes.set(b.id,{g,stage});
 }
 svg.append(scene);
 return {focusBuilding(id){nodes.get(id)?.g.focus({preventScroll:true});},update(snapshot){for(const b of snapshot.buildings){const item=nodes.get(b.id);if(!item)continue;item.stage.textContent=`模擬階段 ${b.stage} / 5`;item.g.setAttribute('aria-pressed',String(snapshot.selected===b.id));item.g.setAttribute('aria-label',`${b.title}，模擬階段 ${b.stage} / 5`);}},setCamera(camera){scene.setAttribute('transform',`translate(${camera.x} ${camera.y}) scale(${camera.scale})`);},dispose(){scene.remove();nodes.clear();}};
}
