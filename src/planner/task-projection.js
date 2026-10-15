import {flattenSubjects} from '../study/study-core.js';
export function taskKind(task){const links=task?.links;return links==null||Array.isArray(links)&&links.length===0?'general':Array.isArray(links)?'course':'invalid';}
export function projectTask(task,{data,states,status='loading'}){
 const kind=taskKind(task),result={...task,storedComplete:task.complete,completionSource:kind};
 if(kind==='general')return {...result,complete:!!task.complete,completionKnown:true};
 const unknown=error=>({...result,complete:null,completionKnown:false,completionError:error});
 if(kind==='invalid')return unknown('課程連結格式無效');
 if(status!=='ready')return unknown(status==='error'?'課程讀取失敗':'課程尚未取得');
 const catalog=new Set(flattenSubjects(data).map(l=>l.path+'__'+l.id)),unique=new Map();
 for(const l of task.links){if(!l||typeof l.path!=='string'||!['string','number'].includes(typeof l.id)||!catalog.has(l.path+'__'+l.id))return unknown('課程連結待確認');unique.set(l.path+'__'+l.id,{path:l.path,id:String(l.id)});}
 for(const l of unique.values()){const value=states?.[l.path]?.[l.id];if(value!=null&&typeof value!=='boolean')return unknown('課程紀錄格式無效');}
 return {...result,links:[...unique.values()],complete:[...unique.values()].every(l=>states?.[l.path]?.[l.id]===true),completionKnown:true};
}
