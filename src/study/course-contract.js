// The only cloud course write contract: one bounded per-UID document transaction.
export const COURSE_SYNC_PATH='learningV3';
export const INITIAL_GENERATION='initial-v3';
export const courseDocumentPath=uid=>'users/'+encodeURIComponent(uid)+'/learningV3';
export const coursePath=path=>/^(videos|biochem|physiology|pharmacology)\/[A-Za-z0-9_-]{1,128}$/.test(path);
export const courseToken=path=>path.replace('/','__');
export const emptyCourseDocument=(generation=INITIAL_GENERATION)=>({schema:3,generation,era:0,clock:0,courses:{},versions:{},firstCompletion:{}});
export const copy=value=>JSON.parse(JSON.stringify(value));
export function normalizeDocument(value){
 if(value===null)return emptyCourseDocument();
 if(!value||value.schema!==3||typeof value.generation!=='string'||!Number.isSafeInteger(value.clock)||value.clock<0||!Number.isSafeInteger(value.era)||value.era<0)throw Error('course-sync/schema');
 return {...emptyCourseDocument(value.generation),...copy(value)};
}
const currentValue=(doc,path)=>{const [subject,id]=path.split('/');return doc.courses[subject]?.[id]??null;};
export function decision(doc,row){
 if(doc.generation!==row.generation)return 'retired';
 const courses=Object.keys(row.changes),dates=Object.keys(row.manualDates||{});
 if(courses.length+dates.length&&courses.every(path=>doc.versions[courseToken(path)]===row.id)&&dates.every(key=>doc.firstCompletion[key]?._version===row.id))return 'acknowledged';
 if(courses.some(path=>(doc.versions[courseToken(path)]??null)!==row.bases[path].version||currentValue(doc,path)!==row.bases[path].value)||dates.some(key=>(doc.firstCompletion[key]?._version??null)!==row.dateBases[key]))return 'review';
 return 'apply';
}
export function applyCourseRequest(current,row){
 const doc=normalizeDocument(current);if(decision(doc,row)!=='apply')return doc;
 for(const [path,value] of Object.entries(row.changes)){const [subject,id]=path.split('/');doc.courses[subject]??={};doc.courses[subject][id]=value;doc.versions[courseToken(path)]=row.id;}
 for(const [key,day] of Object.entries(row.dates||{}))if(!Object.hasOwn(doc.firstCompletion,key))doc.firstCompletion[key]={day,_version:row.id};
 for(const [key,day] of Object.entries(row.manualDates||{}))doc.firstCompletion[key]={day,_version:row.id};
 doc.clock++;return doc;
}
// Existing Stores keep their read interfaces. Old course writers cannot use this facade.
export function createCourseDatabase(database,uid){
 const root=courseDocumentPath(uid);
 const retired=path=>!path||/^(videos|biochem|physiology|pharmacology)(\/|$)/.test(path)||path==='questOS'||path==='questOS/v1'||/^questOS\/v1\/courseFirstCompletion(\/|$)/.test(path)||path===root||path.startsWith(root+'/')||root.startsWith(path+'/');
 return {ref(path=''){
  const course=/^(videos|biochem|physiology|pharmacology)(\/|$)/.test(path),date=path==='questOS/v1/courseFirstCompletion'||path.startsWith('questOS/v1/courseFirstCompletion/');
  const mapped=course?root+'/courses/'+path:date?root+'/firstCompletion'+path.slice('questOS/v1/courseFirstCompletion'.length):path;
  const ref=mapped?database.ref(mapped):database.ref();
  const invoke=(method,args)=>{
   if(method==='update'?Object.keys(args[0]).some(key=>retired([path,key].filter(Boolean).join('/'))):retired(path))return Promise.reject({code:'course-sync/legacy-writer-disabled'});
   return ref[method](...args);
  };
  return {on:(...args)=>ref.on(...args),off:(...args)=>ref.off(...args),once:(...args)=>ref.once(...args),transaction:(...args)=>invoke('transaction',args),update:(...args)=>invoke('update',args),set:(...args)=>invoke('set',args)};
 },goOffline:()=>database.goOffline?.()};
}
