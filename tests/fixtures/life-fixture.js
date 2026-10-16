// Logical-record adapter for existing UI mocks, not a Rules/security substitute.
// The SDK Emulator tests use real physical UID/generation paths without this adapter.
export function lifeFixtureDatabase(db){
 if(db.__lifeFixture)return db;
 const paths={habits:'habits',training:'questOS/v1/training','adaptiveStudy/settings':'questOS/v1/adaptiveStudy/settings',timeTasks:'gamification/v2/timeTasks','planner/tasks':'gamification/v3/planner/tasks',custom_events:'custom_events',checklist:'checklist'};
 const uid=()=>window.becomingStorage?.read().uid||window.fixtureUID||'test-owner';
 const logical=path=>{
  const match=path.match(/^users\/([^/]+)\/lifeV1\/([^/]+)\/(.*)$/);if(!match)return path;
  if(match[1]!==encodeURIComponent(uid())||match[2]!=='fixture-life-1')throw Error('Fixture UID/generation mismatch');
  for(const [bucket,legacy] of Object.entries(paths))if(match[3]===bucket||match[3].startsWith(bucket+'/'))return legacy+match[3].slice(bucket.length);
  throw Error('Unknown fixture life bucket');
 };
 return {...db,__lifeFixture:true,ref(path=''){
  if(path.endsWith('/lifeControl')){
   if(path!=='users/'+encodeURIComponent(uid())+'/lifeControl')throw Error('Fixture control UID mismatch');
   // Existing UI fixtures hold data subscriptions, not this already-provisioned control.
   const callbacks=new Set(),snap=()=>({val:()=>({schema:1,generation:'fixture-life-1',era:0})});
   return {on(event,fn){callbacks.add(fn);queueMicrotask(()=>{if(callbacks.has(fn))fn(snap());});},off(event,fn){callbacks.delete(fn);},once:async()=>snap()};
  }
  const ref=db.ref(logical(path));return {...ref,update:patch=>ref.update(Object.fromEntries(Object.entries(patch).map(([key,value])=>[path?key:logical(key),value])))};
 }};
}
