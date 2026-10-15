// Isolated persistence facade: no SDK, network, product globals, legacy storage or reward events.
import {fault,courseKey,targetValue} from './contract.mjs';
export function createCourseFacade(store){
 return Object.freeze({
  async saveCourses(request){return await store.save(request);},
  inspect:()=>store.inspect(),
  saveNonCourse(){throw fault('facade/non-course-delegation-required');},
  importLegacy(){throw fault('facade/legacy-adoption-disabled');},
  describeLegacy({path,value}={}){courseKey(path);return {kind:'legacy-review-only',path,target:targetValue(value),ownership:'unverified',sync:'needs-owner-and-server-proof',dispatch:false,dateHandoff:false};},
  async deliverDates(sink){
   if(sink?.mode!=='isolated-mock'||typeof sink.accept!=='function')throw fault('facade/real-date-sink-disabled');
   const result=[];
   for(const handoff of (await store.inspect()).handoffs){
    if(handoff.state!=='pending')continue;
    // The mock must durably deduplicate by UID/handoffId. Its receipt is not production proof.
    if(!store.valid())throw fault('facade/stale-session');
    const receipt=await sink.accept(structuredClone(handoff));
    result.push({handoffId:handoff.handoffId,acknowledged:await store.acknowledgeDate(handoff,receipt)});
   }
   return result;
  }
 });
}
// Mock UI contract only. A rejected async save retains the draft for an explicit retry.
export function createMockCourseUI(facade){
 let state={saved:false,busy:false,draft:null,committed:null,error:null};
 return Object.freeze({read:()=>structuredClone(state),async submit(request){
  if(state.busy)throw fault('facade/ui-busy');state={...state,saved:false,busy:true,draft:structuredClone(request),error:null};
  try{const result=await facade.saveCourses(request);state={saved:true,busy:false,draft:null,committed:result,error:null};return result;}
  catch{state={...state,busy:false,saved:false,error:'本機保存失敗；操作尚未保存，可重試。'};return null;}
 }});
}
