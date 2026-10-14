// Extracted verbatim from approved Lite v2.1; only ES module exports added.
export const roman=['I','II','III','IV','V'];
export const colors={academy:'#80619e',barracks:'#46617f',keep:'#b47557'};
export const descriptions={academy:['知識累積與理解','對照既有課程完成與科目學習進度。'],barracks:['練習、行動與穩定節奏','對照既有今日學習任務與訓練狀態。'],keep:['整體旅程與成長','對照既有章節總覽與成長進度。']};
export function icon(id,s){
 const wall='#fffaf0',light={academy:'#e8def1',barracks:'#dce5ee',keep:'#f1dfca'}[id];
 // 共用筆觸與結構元件；每棟保留自己的輪廓與階段增量。
 const path=(d,fill='none')=>`<path d="${d}" fill="${fill}"/>`;
 const flag=(x,y)=>path(`M${x} ${y+22}v-22l17 5-17 7`,light);
 const star=(x,y)=>path(`M${x} ${y-9}l3 6 6 3-6 3-3 6-3-6-6-3 6-3Z`,light);
 let shape='';
 if(id==='academy'){
  // 高而不對稱的學術尖塔，低矮書庫只向右生長。
  shape+=path('M-26 22v-76H2v76Z',wall)+path('M-34-54l22-35 22 35Z',light);
  shape+=path('M-18-37v12M-8-37v12');
  shape+=path('M-25-4q7-5 13 0q7-5 14 0v19q-7-5-14 0q-6-5-13 0Z M-12-4v19',light);
  if(s>=2)shape+=path('M2 22v-41h39v41Z',wall)+path('M-2-19l23-17 24 17Z',light);
  if(s>=3)shape+=path('M10 22V1a11 11 0 0 1 22 0v21 M21-10v8')+path('M-55 22v-51h16v51Z',wall)+path('M-61-29l14-21 14 21Z',light);
  if(s>=4)shape+=path('M41 22v-23h21v23Z',wall)+path('M39-1q13-20 26 0Z',light)+path('M52-11v-14m-8 0 18-8 3 7-18 8Z',light);
  if(s>=5)shape+=path('M-12-92l8-12 8 12-8 12Z',light)+star(55,-59)+path('M-63-72q-10 13 0 26M-68-50l-4 7 8 1');
 }
 if(id==='barracks'){
  // 橫向長廳與寬屋頂，保留訓練場而非側塔。
  shape+=path('M-42 22v-43h84v43Z',wall)+path('M-52-21l17-25h70l17 25Z',light);
  shape+=path('M-13-13h26v14Q12 12 0 17Q-12 12-13 1Z',light)+path('M-6-3l6 7 6-7');
  if(s>=2)shape+=path('M-29-12V6M29-12V6 M-42 14h19M23 14h19')+path('M-68 22v-42M-78 22h20 M-77-19l18-15M-77-34l18 15');
  if(s>=3)shape+=path('M42 22h23v-56H42Z',wall)+path('M39-34h29v-8h-8v-8h-13v8h-8Z',light)+path('M49-19h9v12h-9Z',light);
  if(s>=4)shape+=flag(-34,-75)+flag(54,-77)+path('M-53 22v-10h18M-59 22v-10h-9');
  if(s>=5)shape+=path('M-14-57L9-80l5 5-23 23M14-57L-9-80l-5 5 23 23 M-17-61l12 12M17-61L5-49')+path('M-76 4h15M-72 10h11');
 }
 if(id==='keep'){
  // 寬厚城垛與拱形大門，擴建皆為方形防禦結構。
  if(s>=3)shape+=path('M-20-37v-43h10v8H-5v-8H5v8h5v-8h10v43Z',wall)+path('M-6-59H6v13H-6Z',light);
  if(s>=4)shape+=path('M-79 22v-31h10v8h10v-8h10v31M49 22v-31h10v8h10v-8h10v31',light);
  shape+=path('M-40 22v-58h12v9h11v-9h12v9H6v-9h12v9h10v-9h12v58Z',wall);
  shape+=path('M-14 22V4a14 14 0 0 1 28 0v18Z',light)+path('M-9 7H9M-8 14H8M0 7v15');
  if(s>=2)shape+=path('M-63 22v-78h10v9h10v-9h10v78Z M33 22v-78h10v9h10v-9h10v78Z',wall)+path('M-53-30v12M53-30v12');
  if(s>=4)shape+=flag(-48,-89)+flag(48,-89);
  if(s>=5)shape+=path('M-14-92l-3-13 10 7 7-10 7 10 10-7-3 13Z',light)+path('M-9-10l9-9 9 9-9 9Z',light)+path('M-26 27h52M-34 33h68');
 }
 return `<g class="structure" fill="none">${shape}${path('M-80 23H80')}</g>`;
}
export function mini(id,s){return `<svg viewBox="-100 -115 200 155" aria-hidden="true" style="color:${colors[id]}">${icon(id,s)}</svg>`;}
