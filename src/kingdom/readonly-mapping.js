import {realmGrowth} from './realm-growth.js';
import {gameStats,subjectStats} from '../study/study-core.js';
import {buildingProgressSnapshot,realmActivityGroups} from './territory-core.js';
import {chronicleMilestones} from '../../chronicles-ui.js';
import {chapterSnapshot,CHAPTER_I} from './chapters.js';
import {validDate} from '../../daily-planner.js';
export const BUILDING_IDS=Object.freeze(['academy','keep','barracks']);
export const isRecord=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const clone=v=>v==null?v:structuredClone(v);
export function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
const emptyCatalog=()=>({physio:[],anatomy:[],biochem:[],pharm:[]});
function usableCatalog(v){return isRecord(v)&&['physio','anatomy','biochem','pharm'].every(k=>Array.isArray(v[k]))&&v.physio.every(g=>isRecord(g)&&Array.isArray(g.sections)&&g.sections.every(unit))&&v.anatomy.every(g=>isRecord(g)&&Array.isArray(g.lectures)&&g.lectures.every(weightedUnit))&&v.pharm.every(g=>isRecord(g)&&Array.isArray(g.lectures)&&g.lectures.every(weightedUnit))&&v.biochem.every(unit);}
const unit=v=>isRecord(v)&&['string','number'].includes(typeof v.id)&&typeof v.title==='string';
const weightedUnit=v=>unit(v)&&Number.isFinite(v.durationSec)&&v.durationSec>=0;
// RTDB returns dense numeric child keys as arrays, including null gap placeholders.
// Both shapes support ID lookup; accept only Boolean records and array gaps, without coercion.
const usableCourseState=state=>(isRecord(state)||Array.isArray(state))&&Object.values(state).every(value=>typeof value==='boolean'||Array.isArray(state)&&value===null);
const usableStates=v=>isRecord(v)&&['physiology','videos','biochem','pharmacology'].every(k=>usableCourseState(v[k]));
const usableHabits=v=>isRecord(v)&&Object.values(v).every(day=>isRecord(day)&&(!Object.hasOwn(day,'questOS_v1')||(isRecord(day.questOS_v1)&&['exercise','leisure'].every(k=>!Object.hasOwn(day.questOS_v1,k)||isRecord(day.questOS_v1[k])))));
// No source functions, databases, storage or clocks enter this projection.
export function mapKingdomReadOnly(input){
 const raw=clone(input||{}),warnings=[],day=validDate(raw.day)?raw.day:null;
 const loaded=raw.status==='ready';
 const courses=loaded&&usableCatalog(raw.data)&&usableStates(raw.states);
 const habits=loaded&&!!day&&usableHabits(raw.habits);
 const dates=loaded&&!!day&&isRecord(raw.courseDates);
 const awardsKnown=loaded&&!!day&&isRecord(raw.awards)&&Object.values(raw.awards).every(a=>a===null||isRecord(a));
 const data=courses?raw.data:emptyCatalog(),states=courses?raw.states:{};
 // Empty normalized inputs are used only inside the existing pure calculator. Unknown projections stay null.
 const calculation=buildingProgressSnapshot({data,states,habits:habits?raw.habits:{},courseDates:dates?raw.courseDates:{},day:day||''});
 const catalogCount=courses?calculation.evidence.courses.total:0;
 const availability={academy:courses&&catalogCount>0,barracks:habits,keep:courses&&catalogCount>0&&habits};
 const buildings=Object.fromEntries(BUILDING_IDS.map(id=>[id,availability[id]?{...calculation[id],actualStage:calculation[id].stage,available:true}:{id,stage:null,actualStage:null,roman:null,name:'尚未取得',available:false,reason:raw.status==='error'?'讀取失敗，未推定成長階段':'必要來源尚未取得或格式不支援'}]));
 let stats=null;if(awardsKnown){const awards=clone(raw.awards);for(const award of Object.values(awards))if(award?.xp===20&&!validDate(award.day)){warnings.push('獎勵日期缺少或無效：XP依既有規則保留，不推定歷史日期');award.day='';}stats=gameStats(awards,day);}
 const identity=loaded&&isRecord(raw.identity)&&typeof raw.identity.displayName==='string'&&raw.identity.displayName.trim()?raw.identity.displayName.trim():null;
 const chapter=loaded&&day&&isRecord(raw.settings)&&validDate(raw.settings.examDate)?chapterSnapshot(raw.settings,day):{...CHAPTER_I,examDate:null,daysRemaining:null,examTiming:'unknown',examResult:'unreported'};
 const growth=realmGrowth(calculation.evidence,{ready:loaded&&availability.academy&&availability.barracks&&availability.keep});
 const chroniclesKnown=Object.values(availability).every(Boolean)&&dates&&stats!==null;
 return freeze({sessionEpoch:raw.sessionEpoch??0,kind:raw.kind==='fixture'?'fixture':'readonly',status:raw.status||'missing',day,availability,buildings,stats,growth,lord:{name:identity,xp:stats?.xp??null,level:growth.level,next:null},chapter,subjects:courses?subjectStats(data,states):null,courses:courses?calculation.evidence.courses:null,territory:{...calculation,...buildings},territoryInput:{data,states,habits:habits?raw.habits:{},courseDates:dates?raw.courseDates:{},day:day||''},chronicles:chroniclesKnown?chronicleMilestones(calculation,stats.achievements):null,activity:chroniclesKnown?realmActivityGroups(calculation):null,warnings});
}
// Presentation state only. No setter exists for actual stages or source records.
export function createStagePresentation(){let snapshot=null;const previews=new Map();return Object.freeze({
 update(next){if(snapshot?.sessionEpoch!==next.sessionEpoch||next.status!=='ready')previews.clear();snapshot=next;},preview(id,value){if(!BUILDING_IDS.includes(id))throw Error('未知建築');if(value===null)previews.delete(id);else{if(!Number.isInteger(value)||value<1||value>5)throw Error('預覽需為 I–V');previews.set(id,value);}},
 read(id){if(!BUILDING_IDS.includes(id))throw Error('未知建築');const actualStage=snapshot?.buildings[id].actualStage??null,previewStage=previews.get(id)??null;return Object.freeze({actualStage,previewStage,displayStage:previewStage??actualStage});}
});}
// Injection contract: only already-loaded, nonmutating getters. No Firebase client is accepted.
export function captureExistingReadModel(api){
 // Existing stores may expose empty defaults before hydration. Never infer loaded status from {}.
 const readiness=api.readiness||{};
 const read=(name,fn)=>{if(readiness[name]!==true)return null;try{return clone(fn());}catch{return null;}};
 return freeze({status:api.status||'loading',sessionEpoch:api.sessionEpoch??0,kind:api.kind==='fixture'?'fixture':'readonly',data:read('data',()=>api.data),states:read('states',()=>api.readStudyStates()),habits:read('habits',()=>api.life.recordedHabits()),courseDates:read('courseDates',()=>api.courseDates.records()),awards:read('awards',()=>api.readAwards()),identity:read('identity',()=>{const user=api.readIdentity();return user?{displayName:user.displayName??null}:null;}),settings:read('settings',()=>api.settings.config()),day:read('day',()=>api.today())});
}
export function observeReadModel({read,subscribe},onSnapshot){let stopped=false;const emit=()=>{if(stopped)return;let raw;try{raw=read();}catch{raw={status:'error'};}onSnapshot(mapKingdomReadOnly(raw));};emit();let unsubscribe;try{unsubscribe=subscribe(emit);}catch{onSnapshot(mapKingdomReadOnly({status:'error'}));}return()=>{stopped=true;unsubscribe?.();};}
