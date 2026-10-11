// Keep the existing classic-script globals intact; start learning only after authentication.
let started = false;
async function startLearning() {
  if (started) return;
  started = true;
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
  return ({
    'auth/unauthorized-domain': '此網址尚未授權。請在 Firebase Authentication 的授權網域加入目前的網站網域。',
    'auth/popup-blocked': '瀏覽器阻擋了登入視窗，請允許此網站開啟彈出式視窗後重試。',
    'auth/popup-closed-by-user': '登入視窗已關閉，可以再次登入。',
    'auth/network-request-failed': '無法連線至登入服務，請檢查網路後重試。',
    'auth/operation-not-allowed': '請先在 Firebase Authentication 啟用 Google 登入。'
  })[error?.code] || '無法完成登入，請稍後重試。';
}
function addAccount(auth, user) {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'account-button';
  button.className = 'account-button';
  button.textContent = '帳號與同步';
  document.querySelector('.sidebar-foot').append(button);
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
  await startLearning();
} else {
  const login = dialog('<h2>登入國考準備</h2><p>使用 Google 帳號，安全同步你的學習進度。</p><button type="button" id="google-sign-in" disabled>使用 Google 登入</button><p id="auth-status" role="status">正在連線至登入服務…</p>');
  login.addEventListener('cancel', event => event.preventDefault());
  login.showModal();
  const status = login.querySelector('#auth-status');
  const button = login.querySelector('#google-sign-in');
  try {
    if (!window.firebase?.auth) throw new Error('Auth SDK unavailable');
    if (!firebase.apps.length) firebase.initializeApp(window.examFirebaseConfig);
    const auth = firebase.auth();
    button.onclick = async () => {
      button.disabled = true;
      status.textContent = '請在登入視窗選擇你的 Google 帳號。';
      try { await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
      catch (error) { status.textContent = authMessage(error); }
      finally { button.disabled = false; }
    };
    auth.onAuthStateChanged(async user => {
      if (!user) {
        if (started) { window.learningDB?.goOffline?.(); location.reload(); return; }
        status.textContent = '登入後即可使用；既有紀錄會保留。';
        button.disabled = false;
        return;
      }
      window.authenticatedUser = user;
      login.close();
      try { await startLearning(); addAccount(auth, user); }
      catch { status.textContent = '介面載入失敗，請重新整理後重試。'; login.showModal(); }
    }, error => { status.textContent = authMessage(error); button.disabled = false; });
  } catch {
    status.textContent = '登入服務未載入，請檢查網路後重新整理。';
  }
}
