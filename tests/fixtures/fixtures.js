import {flattenSubjects,awardKey} from'../../src/study/study-core.js';
import {freeze,clone} from'../../src/kingdom/readonly-mapping.js';
export const FIXTURE_DAY='2026-10-14';
// Synthetic catalog for deterministic boundary tests. UI uses the retained public curriculum.
export function fixtureCatalog(total=100){return {physio:[{chapterId:'甲',sections:Array.from({length:total},(_,i)=>({id:'fixture-'+i,title:'Fixture 課程 '+i}))}],anatomy:[],biochem:[],pharm:[],weeks:[]};}
export function makeFixture(name='current-II',catalog=fixtureCatalog()){
 const items=flattenSubjects(catalog),updated=name==='updated',count=name==='empty'?0:Math.ceil(items.length*(updated ? 0.3 : 0.05));
 const states={physiology:{},videos:{},biochem:{},pharmacology:{}},courseDates={},awards={},habits={};
 items.slice(0,count).forEach((item,i)=>{states[item.path][item.id]=true;if(i<3)courseDates[awardKey(item)]={day:'2026-10-'+String(2+i).padStart(2,'0'),_version:'fixture-date-'+i};});
 const activity=name==='empty'?0:updated?8:3;
 for(let i=1;i<=activity;i++)habits['2026-10-'+String(i).padStart(2,'0')]={questOS_v1:{exercise:{type:'walk',status:'complete'},leisure:{title:'Fixture 恢復紀錄',status:'complete'}}};
 if(name!=='empty'){for(let i=0;i<(updated?10:6);i++)awards[awardKey(items[i])]={xp:20,day:'2026-10-03'};awards['time__2026-10-02__morning']={xp:20,day:'2026-10-02'};awards['planner__fixture-task']={xp:20,day:'2026-10-04'};}
 const raw={status:'ready',kind:'fixture',day:FIXTURE_DAY,data:clone(catalog),states,habits,courseDates,awards,identity:{displayName:'驗收樣本甲（Fixture）'},settings:{examDate:'2027-01-16'}};
 if(name==='missing')Object.assign(raw,{states:null,habits:null,courseDates:null,awards:null,identity:null,settings:null});
 if(name==='legacy'){raw.identity=null;raw.courseDates={};raw.habits=Object.fromEntries(Object.keys(habits).map(d=>[d,{'daily-sport':true,'daily-game':true}]));}
 if(name==='empty')raw.identity=null;
 if(name==='loading')raw.status='loading';
 return freeze(raw);
}
export function fixtureSource(initial){let value=initial;const listeners=new Set();return Object.freeze({read:()=>value,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},use(next){value=freeze(clone(next));for(const listener of listeners)listener();}});}
