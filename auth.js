import {preserveRewardCache} from './legacy-rewards.js';
import {OWNER_UID} from './owner-config.js';
import {REQUIRED_PATHS} from './readiness.js';

// Keep the existing classic-script globals intact; start learning only after authentication.
let started = false;
let activeUID=null,authEpoch=0;
async function startLearning(stillCurrent=()=>true) {
  if (started) return;
  started = true;
  const accountStorage=window.becomingStorage.view();
  if(!window.workspaceLocalOnly){
    const {openLifeSession}=await import('./src/study/life-isolation.js');
    if(!stillCurrent())return;
    const lifeOwner=window.becomingStorage.capture(),lifeUID=window.becomingStorage.read().uid;
    window.lifeSession=await openLifeSession({database:firebase.database(),uid:window.becomingStorage.read().uid,storage:accountStorage,valid:()=>lifeOwner.valid()&&window.authenticatedUser?.uid===lifeUID,
      onRetire(){window.becomingStorage.unbind();window.i3Runtime?.stop();firebase.database().goOffline?.();location.reload();},
      onStorageFailure(){window.i3Runtime?.lifecycle.fail('storage/write-failed');}});
    if(!stillCurrent()){window.lifeSession.close();return;}
    if(window.i3Runtime?.read().status==='error')window.i3Runtime.begin(window.authenticatedUser);
  }
  window.learningStorage=window.lifeSession?.storage||accountStorage;preserveRewardCache(window.learningStorage);window.SubjectUI?.bindStorage();
  const {createCourseDatabase}=await import('./src/study/course-contract.js');
  if(!stillCurrent())return;
  window.createCourseDatabase=createCourseDatabase;
  await import('./src/study/course-sync.js');
  if(!stillCurrent())return;
  await import('./sync.js');
  if(!stillCurrent())return;
  const script = document.createElement('script');
  script.textContent = document.getElementById('learning-script').textContent;
  document.body.append(script);
  await import('./workspace.js');
}
function dialog(markup) {
  const element = document.createElement('dialog');
  element.className = 'account-dialog';
  element.innerHTML = markup;
  document.body.append(element);
  return element;
}
function authMessage(error) {
  // Show only the bounded Firebase code, never raw errors, tokens or account details.
  const candidate = typeof error?.code === 'string' ? error.code : '';
  const code = /^auth\/[a-z0-9._-]{1,120}$/.test(candidate) ? candidate : '';
  const browserCode = ({TypeError:'client/type-error', SecurityError:'client/security-error', NotAllowedError:'client/not-allowed', AbortError:'client/aborted'})[error?.name] || 'client/unknown-error';
  const message = ({
    'auth/unauthorized-domain': '此網址尚未授權。請在 Firebase Authentication 的授權網域加入目前的網站網域。',
    'auth/popup-blocked': '瀏覽器阻擋了登入視窗，請允許此網站開啟彈出式視窗後重試。',
    'auth/popup-closed-by-user': '登入視窗已關閉，可以再次登入。',
    'auth/cancelled-popup-request': '另一個登入視窗正在開啟，請關閉多餘視窗後重試。',
    'auth/network-request-failed': '無法連線至登入服務，請檢查網路後重試。',
    'auth/operation-not-allowed': '請先在 Firebase Authentication 啟用 Google 登入。',
    'auth/configuration-not-found': '找不到 Firebase 登入設定，請確認已在網站對應的 Firebase 專案啟用 Authentication。',
    'auth/invalid-api-key': 'Firebase 網站設定的 API 金鑰無效，請檢查網站設定。',
    'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'Firebase 網站設定的 API 金鑰無效，請至 Firebase 專案設定核對 Web App 設定。',
    'auth/app-not-authorized': '此網站未獲得 Firebase API 金鑰授權，請檢查金鑰的網站限制。',
    'auth/web-storage-unsupported': '瀏覽器無法儲存登入狀態，請改用一般瀏覽模式並允許網站儲存資料。',
    'auth/operation-not-supported-in-this-environment': '此瀏覽環境不支援登入，請在 Safari 或 Chrome 直接開啟預覽網址。',
    'auth/account-exists-with-different-credential': '此帳號已使用其他登入方式，請檢查 Firebase 使用者的登入方式。',
    'auth/user-disabled': '此帳號已在 Firebase 停用，請檢查使用者設定。',
    'auth/too-many-requests': '登入嘗試過於頻繁，請稍後再試。',
    'auth/internal-error': '登入服務發生內部錯誤，需要根據錯誤代碼進一步檢查。'
  })[code] || '無法完成登入，請提供下方錯誤代碼以便檢查。';
  return `${message}（${code || browserCode}）`;
}
function addAccount(auth, user) {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'account-button';
  button.className = 'account-button';
  button.textContent = '帳號與同步';
  document.querySelector('.sidebar-foot').append(button);
  // The sidebar footer is hidden on phones; keep the existing account control reachable.
  const mobile=matchMedia('(max-width:640px)');
  const place=()=>{if(button.isConnected)(mobile.matches?document.querySelector('.workspace-controls'):document.querySelector('.sidebar-foot'))?.append(button);};
  place();mobile.addEventListener('change',place);
  const stop=window.i3Runtime?.subscribe(state=>{if(state.status==='signedOut'){mobile.removeEventListener('change',place);stop?.();}});
  const panel = dialog('<h2>帳號與同步</h2><p id="account-email"></p><label for="account-uid">Firebase UID</label><input id="account-uid" readonly><p class="account-help">資料庫規則須允許這個 UID，才能同步既有學習紀錄。</p><div class="account-actions"><button type="button" id="copy-uid">複製 UID</button><button type="button" id="sign-out">登出</button><button type="button" id="close-account">關閉</button></div><p id="account-status" role="status"></p>');
  panel.querySelector('#account-email').textContent = user.email || user.displayName || '已登入';
  panel.querySelector('#account-uid').value = user.uid;
  button.onclick = () => panel.showModal();
  panel.querySelector('#close-account').onclick = () => panel.close();
  panel.querySelector('#copy-uid').onclick = async () => {
    try { await navigator.clipboard.writeText(user.uid); panel.querySelector('#account-status').textContent = 'UID 已複製。'; }
    catch { panel.querySelector('#account-uid').select(); panel.querySelector('#account-status').textContent = '請複製選取的 UID。'; }
  };
  panel.querySelector('#sign-out').onclick = async () => {
    try { await auth.signOut(); } catch { panel.querySelector('#account-status').textContent = '登出失敗，請重試。'; }
  };
}
if (window.workspaceLocalOnly) {
  window.becomingStorage.bind('local-demo');await startLearning();
  // Explicit local Store initialization completed; this is not a Firebase ready signal.
  const epoch=window.i3Runtime.begin({displayName:'本機示範（未連線）'});
  for(const path of REQUIRED_PATHS)window.i3Runtime.lifecycle.success(path,epoch);
} else {
  const login = dialog('<h2>登入 Becoming</h2><p>使用 Google 帳號，安全同步你的學習進度。</p><button type="button" id="google-sign-in" disabled>使用 Google 登入</button><p id="auth-status" role="status">正在連線至登入服務…</p><div id="owner-setup" hidden><label for="setup-uid">你的 Firebase UID</label><input id="setup-uid" readonly><p>請將此 UID 提供給網站維護者，完成個人帳號限制設定。</p></div>');
  login.addEventListener('cancel', event => event.preventDefault());
  login.showModal();
  const status = login.querySelector('#auth-status');
  const button = login.querySelector('#google-sign-in');
  try {
    if (!window.firebase?.auth) throw new Error('Auth SDK unavailable');
    if (!firebase.apps.length) firebase.initializeApp(window.examFirebaseConfig);
    const auth = firebase.auth();
    let accessMessage = '';
    button.onclick = async () => {
      let stage = '建立登入提供者';
      accessMessage = '';
      login.querySelector('#owner-setup').hidden = true;
      button.disabled = true;
      status.textContent = '請在登入視窗選擇你的 Google 帳號。';
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        stage = '設定 Google 帳號選擇';
        provider.setCustomParameters?.({prompt: 'select_account'});
        stage = 'Google 登入驗證';
        await auth.signInWithPopup(provider);
      }
      catch (error) { status.textContent = `${authMessage(error)} · ${stage}`; }
      finally { button.disabled = false; }
    };
    auth.onAuthStateChanged(async user => {
      if(user&&started&&activeUID===user.uid&&window.authenticatedUser?.uid===user.uid&&window.i3Runtime?.read().status!=='signedOut')return;
      const epoch=++authEpoch;
      if (!user) {
        window.lifeSession?.close();
        window.becomingStorage?.unbind();window.authenticatedUser=null;window.i3Runtime?.stop();
        if (started) { window.learningDB?.goOffline?.(); location.reload(); return; }
        status.textContent = accessMessage || '此工作台僅供擁有者使用，請登入你的 Google 帳號。';
        button.disabled = false;
        return;
      }
      if (!OWNER_UID || user.uid !== OWNER_UID) {
        window.becomingStorage?.unbind();window.authenticatedUser=null;window.i3Runtime?.stop();
        accessMessage = OWNER_UID ? '此帳號沒有使用權限，請改用擁有者的 Google 帳號。' : '尚未設定擁有者 UID，學習介面與雲端同步均未啟動。';
        status.textContent = accessMessage;
        if (!OWNER_UID) {
          login.querySelector('#owner-setup').hidden = false;
          login.querySelector('#setup-uid').value = user.uid;
        }
        button.disabled = true;
        try { await auth.signOut(); button.disabled = false; }
        catch { status.textContent = accessMessage + ' 無法登出，請重新整理後重試。'; }
        return;
      }
      if(started&&activeUID!==user.uid){window.becomingStorage?.unbind();window.authenticatedUser=null;window.i3Runtime?.stop();location.reload();return;}
      if(started&&window.i3Runtime?.read().status==='signedOut'){location.reload();return;}
      if(started&&activeUID===user.uid)return;
      activeUID=user.uid;window.becomingStorage.bind(user.uid);window.i3Runtime?.begin(user);
      window.authenticatedUser = user;
      login.close();
      try { await startLearning(()=>epoch===authEpoch&&activeUID===user.uid&&window.authenticatedUser?.uid===user.uid); if(epoch!==authEpoch||activeUID!==user.uid)return;addAccount(auth, user); }
      catch { if(epoch!==authEpoch)return;window.lifeSession?.close();window.i3Runtime?.lifecycle.fail('life/start-failed');status.textContent = '資料區尚未就緒或本機保存失敗，請重新整理後重試。'; login.showModal(); }
    }, error => { window.becomingStorage?.unbind();window.authenticatedUser=null;window.i3Runtime?.stop();status.textContent = authMessage(error); button.disabled = false; });
  } catch {
    status.textContent = '登入服務未載入，請檢查網路後重新整理。';
  }
}
