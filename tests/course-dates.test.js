import test from 'node:test';
import assert from 'node:assert/strict';
import {createCourseDates,COURSE_DATES_PATH,COURSE_DATES_KEY} from '../course-dates.js';
import {memoryStorage,mockEvents,planningBackend,settle} from './helpers/planning-mock.js';
const keys=new Set(['physiology__p','videos__1','biochem__1','pharmacology__1']);
const options={keys,events:mockEvents(),today:()=> '2026-10-14'};
test('first dates persist, rechecks do not overwrite, removal survives reload and allows manual replacement',()=>{
 const storage=memoryStorage(),store=createCourseDates({...options,storage,localOnly:true});
 for(const key of keys){store.set(key,'2026-10-12',{firstOnly:true});store.set(key,'2026-10-14',{firstOnly:true});assert.equal(store.records()[key].day,'2026-10-12');}
 store.set('physiology__p',null);const reloaded=createCourseDates({...options,storage,localOnly:true});reloaded.set('physiology__p','2026-10-14',{firstOnly:true});assert.equal(reloaded.records().physiology__p.day,null);reloaded.set('physiology__p','2026-10-10');assert.equal(reloaded.records().physiology__p.day,'2026-10-10');assert.throws(()=>reloaded.set('orphan','2026-10-12'));assert.throws(()=>reloaded.set('videos__1','2026-10-15'));assert.throws(()=>reloaded.set('videos__1','2026-02-30'));
});
test('offline date edits reconnect, competing devices require explicit resolution and removed date stays removed',async()=>{
 const backend=planningBackend(),a=backend.client(),b=backend.client(),sa=memoryStorage(),sb=memoryStorage();const one=createCourseDates({...options,db:a.db,storage:sa}),two=createCourseDates({...options,db:b.db,storage:sb});await settle(one,two);
 one.set('physiology__p','2026-10-12',{firstOnly:true});await settle(one,two);assert.equal(two.records().physiology__p.day,'2026-10-12');
 a.connection.online=false;one.set('physiology__p','2026-10-13');await settle(one);assert.equal(one.status('physiology__p').pending,true);
 two.set('physiology__p',null);await settle(two);a.connection.online=true;await one.retry();await settle(one);assert.equal(one.status('physiology__p').conflict,true);assert.equal(backend.get(COURSE_DATES_PATH+'/physiology__p').day,null);
 one.resolve('physiology__p',false);assert.equal(one.records().physiology__p.day,null);assert.equal(JSON.parse(sa.getItem(COURSE_DATES_KEY)).pending.physiology__p,undefined);
});
test('racing automatic first dates preserve the remote original',async()=>{
 const backend=planningBackend(),client=backend.client(),storage=memoryStorage();client.connection.online=false;const store=createCourseDates({...options,db:client.db,storage});await settle(store);store.set('videos__1','2026-10-14',{firstOnly:true});await settle(store);backend.put(COURSE_DATES_PATH+'/videos__1',{day:'2026-10-12',_version:'remote'});client.connection.online=true;await store.retry();await settle(store);assert.equal(store.records().videos__1.day,'2026-10-12');assert.equal(store.status('videos__1').conflict,false);
});
