import {COURSE_THRESHOLDS,TRAINING_THRESHOLDS} from './territory-core.js';
const c=(x,t)=>Math.min(1,Math.max(0,x/t)),mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
export function realmGrowth(evidence,{ready=true}={}){
 const {done:D,total:N}=evidence?.courses||{},T=evidence?.training,E=evidence?.activityDays;
 if(!ready||![D,N,T,E].every(Number.isSafeInteger)||N<=0||D<0||D>N||T<0||E<T)return Object.freeze({available:false,progress:null,level:null});
 const q=COURSE_THRESHOLDS.slice(1).map(p=>Math.ceil(N*p/100)),b=TRAINING_THRESHOLDS.slice(1);
 const a=q.map(t=>c(D,t)),u=b.map(t=>c(T,t));
 const k=q.map((_,i)=>Math.max(a[i],i===0?c(E,b[0]):Math.min(c(D,q[i-1]),c(E,b[i]))));
 const academy=mean(a),barracks=mean(u),keep=mean(k),progress=Math.min(1,.4*academy+.4*barracks+.2*keep);
 // Preserve exact endpoint: no rounded display value may grant Lv.20 early.
 const level=1+Math.floor(19*progress);
 return Object.freeze({available:true,academy,barracks,keep,progress,level,catalogCount:N,gates:Object.freeze({academy:Object.freeze(a),barracks:Object.freeze(u),keep:Object.freeze(k)})});
}
export const growthPercent=progress=>progress==null?'尚未取得':progress===1?'100%':(Math.floor(progress*10000)/100).toFixed(2)+'%';
