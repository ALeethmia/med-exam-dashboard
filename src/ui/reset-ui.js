import {createResetRest,performSelfReset,reconcileSelfReset,resetEvidence} from '../study/self-reset.js';
export async function guardPendingReset(user){
 const storage=window.becomingStorage.view();
 if(!resetEvidence(storage).some(item=>item.phase!=='confirmed'))return true;
 const panel=document.createElement('dialog');panel.className='account-dialog';
 panel.innerHTML='<h2>重置結果待確認</h2><p>已保留操作證據。為避免舊進度回寫，暫停載入與同步；不會再次送出重置。</p><button type="button">只讀查核結果</button><p role="status"></p>';
 document.body.append(panel);panel.showModal();panel.addEventListener('cancel',event=>event.preventDefault());
 const check=async()=>{
  const button=panel.querySelector('button');button.disabled=true;
  try{
   const resolved=await reconcileSelfReset({user,storage,rest:createResetRest(window.examFirebaseConfig.databaseURL)});
   if(resolved){location.reload();return;}
   panel.querySelector('[role=status]').textContent='伺服器尚無此操作收據。保留證據並停止，請由維護者核對；不可直接重試重置。';
  }catch{panel.querySelector('[role=status]').textContent='目前無法查核伺服器，證據仍保留。連線恢復後可再做只讀查核。';}
  finally{button.disabled=false;}
 };
 panel.querySelector('button').onclick=()=>void check();await check();return false;
}
export function mountResetUI(){
 const section=document.getElementById('reset-data');
 if(!section)return;
 section.innerHTML='<h2>資料管理</h2><p>清空此帳號的課程完成狀態、首次完成日期、習慣、運動／休閒紀錄、任務、個人行程、清單與王國成長。此操作無法從設定頁復原。</p><p>保留登入、課程目錄、外觀、考試／容量與運動設定，以及其他帳號的資料。舊版本快取與共用歷史 XP 會隔離，不會帶回新進度。</p><button type="button" id="open-self-reset" class="workspace-link">重置學習與生活進度</button><p id="reset-status" role="status"></p>';
 const launch=section.querySelector('button'),status=section.querySelector('[role=status]');
 launch.disabled=!!window.workspaceLocalOnly;
 if(launch.disabled)status.textContent='此功能僅供已登入的雲端帳號使用。';
 const panel=document.createElement('dialog');panel.className='account-dialog';panel.id='self-reset-dialog';
 panel.innerHTML='<form><h2>重置學習與生活進度</h2><p>課程、日期、生活紀錄與王國進度將歸零。未同步的舊進度也不會帶回。</p><label><input type="checkbox" id="reset-scope"> 我了解此操作無法從設定頁復原</label><label for="reset-account">輸入目前登入帳號的完整電子郵件</label><input id="reset-account" type="email" autocomplete="off"><p id="reset-account-hint"></p><div class="account-actions"><button type="button" id="cancel-self-reset">取消</button><button type="submit" id="confirm-self-reset" disabled>下一步：確認帳號並重置</button></div><p role="status"></p></form>';
 document.body.append(panel);
 const form=panel.querySelector('form'),confirm=panel.querySelector('[type=submit]'),scope=panel.querySelector('#reset-scope'),account=panel.querySelector('#reset-account');let busy=false;
 const valid=()=>!window.workspaceLocalOnly&&!!window.authenticatedUser&&firebase.auth().currentUser?.uid===window.authenticatedUser.uid&&window.i3Runtime?.read().status==='ready';
 const update=()=>{confirm.disabled=busy||!valid()||!scope.checked||account.value!==window.authenticatedUser?.email;};
 form.oninput=update;
 launch.onclick=()=>{
  form.reset();panel.querySelector('[role=status]').textContent='';
  panel.querySelector('#reset-account-hint').textContent=window.authenticatedUser?.email||'請先登入並等待同步完成。';update();panel.showModal();panel.querySelector('#cancel-self-reset').focus();
 };
 panel.querySelector('#cancel-self-reset').onclick=()=>{if(!busy)panel.close();};
 panel.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 form.onsubmit=async event=>{
  event.preventDefault();update();if(confirm.disabled)return;
  const user=firebase.auth().currentUser;
  if(!window.confirm('最後確認：將清空此帳號的學習與生活進度。接著必須重新驗證目前的 Google 帳號。確定繼續？'))return;
  busy=true;update();launch.disabled=true;panel.querySelector('#cancel-self-reset').disabled=true;
  const storage=window.becomingStorage.view();let stopped=false;
  try{
   await performSelfReset({user,storage,rest:createResetRest(window.examFirebaseConfig.databaseURL),valid:()=>valid()&&firebase.auth().currentUser?.uid===user.uid,
    reauthenticate:async current=>{const provider=new firebase.auth.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});await current.reauthenticateWithPopup(provider);},
    stop(){stopped=true;window.courseSync?.close();window.lifeSession?.close();window.i3Runtime?.stop();firebase.database().goOffline();},reload:()=>location.reload()});
  }catch{
   panel.querySelector('[role=status]').textContent=stopped?'重置失敗或結果不明。操作證據已保留，同步已停止；重新載入後僅查核收據，不會再次送出。':'尚未送出重置。請確認連線、帳號驗證與資料讀取權限。';
   if(stopped){const reload=document.createElement('button');reload.type='button';reload.textContent='重新載入並查核';reload.onclick=()=>location.reload();panel.querySelector('form').append(reload);}
   else{busy=false;launch.disabled=false;panel.querySelector('#cancel-self-reset').disabled=false;update();}
  }
 };
}
