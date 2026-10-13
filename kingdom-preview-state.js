// 只存在本次頁面的記憶體；不讀取或提交學習、XP 與同步佇列。
export function createPreviewState(manifest){
 const stages=new Map(manifest.map(b=>[b.id,1]));let selected=null;
 return {select(id){if(stages.has(id))selected=id;},setStage(id,stage){if(!stages.has(id)||!Number.isInteger(stage)||stage<1||stage>5)throw new Error('請選擇既有模型的第 1–5 階段。');stages.set(id,stage);},read:()=>Object.freeze({selected,buildings:Object.freeze(manifest.map(b=>Object.freeze({...b,stage:stages.get(b.id),simulated:true})))} )};
}
