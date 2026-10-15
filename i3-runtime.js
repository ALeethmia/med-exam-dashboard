import {createReadiness,observeDatabase} from './readiness.js';
export function installKingdomRuntime(target=window){
 const lifecycle=createReadiness();let wrapped=null;
 const runtime={lifecycle,read:lifecycle.read,subscribe:lifecycle.subscribe,
 begin(user){wrapped?.dispose();wrapped=null;return lifecycle.start(user);},
 wrap(database){if(lifecycle.read().status==='signedOut')return null;if(!database){lifecycle.fail('read/unavailable');return null;}wrapped=observeDatabase(database,lifecycle);return wrapped;},
 retry(){wrapped?.retry();},stop(){wrapped?.dispose();wrapped=null;lifecycle.start(null);},
 dispose(){wrapped?.dispose();lifecycle.dispose();}};
 if(target.document){let viewEpoch=lifecycle.read().epoch,viewStatus=lifecycle.read().status;lifecycle.subscribe(state=>{if(state.epoch!==viewEpoch||state.status==='signedOut'){target.document.getElementById('account-button')?.remove();for(const dialog of target.document.querySelectorAll('dialog[open]'))if(!dialog.querySelector('#auth-status'))dialog.close();}const becameReady=state.status==='ready'&&viewStatus!=='ready';viewStatus=state.status;viewEpoch=state.epoch;if(becameReady)target.dispatchEvent?.(new (target.Event||Event)('learning-read-ready'));target.document.documentElement.dataset.readStatus=state.status;
 const main=target.document.querySelector('.workspace-main');if(main){let note=main.querySelector('[data-global-load-status]');if(!note){note=target.document.createElement('p');note.dataset.globalLoadStatus='';note.className='workspace-note i3-global-status';note.setAttribute('role','status');main.prepend(note);}note.hidden=state.status==='ready';note.textContent=({loading:'正在讀取資料，尚未呈現個人進度。',error:'資料讀取失敗；個人進度已隱藏，請重試讀取。',signedOut:'尚未登入，未載入個人進度。'})[state.status]||'';}
 });}
 target.i3Runtime=Object.freeze(runtime);return runtime;
}
