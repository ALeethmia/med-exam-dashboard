import {OWNER_UID} from '../../owner-config.js';
import {createAccountStorage} from '../../account-storage.js';
import {createResetRest,performSelfReset,reconcileSelfReset,resetEvidence} from '../study/self-reset.js';
const form=document.getElementById('first-form'),status=document.getElementById('first-status'),login=document.getElementById('first-login'),button=form.querySelector('[type=submit]');
const account=createAccountStorage(localStorage);let user=null,busy=false;
firebase.initializeApp(window.examFirebaseConfig);const auth=firebase.auth(),rest=createResetRest(window.examFirebaseConfig.databaseURL);
const provider=()=>{const value=new firebase.auth.GoogleAuthProvider();value.setCustomParameters({prompt:'select_account'});return value;};
const valid=()=>!!user&&user.uid===OWNER_UID&&auth.currentUser?.uid===user.uid;
const update=()=>{button.disabled=busy||!valid()||!document.getElementById('first-scope').checked||document.getElementById('first-email').value!==user.email;};
login.onclick=async()=>{try{await auth.signInWithPopup(provider());}catch{status.textContent='無法登入，請確認 Google 登入與授權網域設定。';}};
auth.onAuthStateChanged(async next=>{
 user=next;account.unbind();form.hidden=true;
 if(!valid()){status.textContent=next?'此帳號沒有啟用權限。':'請登入已確認的擁有者帳號。';return;}
 account.bind(user.uid);document.getElementById('first-identity').textContent=user.email;form.hidden=false;update();
 if(resetEvidence(account.view()).some(item=>item.phase!=='confirmed')){
  busy=true;update();status.textContent='發現待確認證據，只查核收據，不會重送初始化。';
  try{if(await reconcileSelfReset({user,storage:account.view(),rest})){location.replace('/');return;}}catch{}
  status.textContent='尚無法證明初始化完成。保留證據並停止，請維護者核對；重新載入僅再次查核。';
 }
});
form.oninput=update;
form.onsubmit=async event=>{
 event.preventDefault();update();if(button.disabled)return;
 if(!confirm('最後確認：此帳號將從空白開始，舊進度不會匯入。確定首次啟用？'))return;
 busy=true;update();login.disabled=true;
 try{
  await performSelfReset({user,storage:account.view(),rest,allowInitialize:true,valid,
   reauthenticate:current=>current.reauthenticateWithPopup(provider()),reload:()=>location.replace('/')});
 }catch{status.textContent='未完成啟用。若已留下操作證據，重新載入只查核結果。若帳號已初始化，請回 Becoming 使用設定頁；若缺少新版 Rules 契約，請先完成維護者切換程序。';}
};
