export const memoryStorage=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,v)=>values.set(key,v),values};};
export const mockEvents=()=>({addEventListener(){}});
export const copy=v=>JSON.parse(JSON.stringify(v));
export async function settle(...clients){for(let i=0;i<40;i++){await new Promise(r=>setImmediate(r));if(clients.every(c=>!c.status().syncing))return;}throw Error('Sync did not settle');}
export function planningBackend(seed={}) {
 const records=copy(seed),listeners=[],writes=[];
 const get=path=>path.split('/').reduce((v,k)=>v?.[k],records)??null;
 const put=(path,v)=>{const keys=path.split('/'),last=keys.pop();let target=records;for(const key of keys)target=target[key]||={};target[last]=copy(v);};
 const notify=()=>{for(const l of listeners)if(l.connection.online&&l.path!=='.info/connected')queueMicrotask(()=>l.callback({val:()=>copy(get(l.path))}));};
 function client(){const connection={online:true};return {connection,db:{ref:path=>({on(e,callback){listeners.push({path,callback,connection});queueMicrotask(()=>callback({val:()=>path==='.info/connected'?true:copy(get(path))}));},async once(){if(!connection.online)throw {code:'NETWORK_ERROR'};return {val:()=>copy(get(path))};},async transaction(fn){if(!connection.online)throw {code:'NETWORK_ERROR'};const next=fn(copy(get(path)));if(next!==undefined){put(path,next);writes.push({path,value:copy(next)});notify();}return {committed:next!==undefined,snapshot:{val:()=>copy(get(path))}};}})}};}
 return {records,client,get,put,notify,writes};
}
