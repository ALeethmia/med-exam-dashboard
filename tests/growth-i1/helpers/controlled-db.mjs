import {createMockDatabase} from '../../fixtures/mock-database.js';
export function controlledDB(seed={}){
 const raw=createMockDatabase(seed,{delay:1}),rules=[],attempts=[];let online=true;
 const matches=(a,path)=>a.path===path;
 const ref=path=>{const r=raw.ref(path);const wrap=method=>async(...args)=>{
   attempts.push({method,path});const i=rules.findIndex(x=>x.method===method&&matches(x,path));const rule=i<0?null:rules.splice(i,1)[0];
   if(rule?.gate)await rule.gate;
   if(!online)throw {code:'NETWORK_ERROR'};
   if(rule?.code&&!rule.after)throw {code:rule.code};
   if(rule?.before)await rule.before();
   const result=await r[method](...args);
   if(rule?.code)throw {code:rule.code};
   return result;
 };
 return {...r,once:wrap('once'),update:wrap('update'),set:wrap('set'),transaction:wrap('transaction')};};
 return {...raw,ref:(path='')=>ref(path),attempts,fail(method,path,{code='NETWORK_ERROR',after=false,before=null}={}){rules.push({method,path,code,after,before});},hold(method,path){let release;const gate=new Promise(resolve=>release=resolve);rules.push({method,path,gate});return release;},connection(value){online=value;raw.connection(value);}};
}
export const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),values};};
export const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
