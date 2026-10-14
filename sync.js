// Keep unsent item-level edits separate from the legacy learning state.
(() => {
  const learningStorage=window.learningStorage;
  const key = 'med_exam_pending_writes_v1';
  let pending = {};
  try { pending = JSON.parse(learningStorage.getItem(key) || '{}'); } catch {}
  let connected = false;
  let active = false;
  let failed = false;
  const save = () => learningStorage.setItem(key, JSON.stringify(pending));
  const status = () => {
    const el = document.getElementById('sync-status');
    if (el) {
      el.textContent = window.workspaceLocalOnly ? '本機模式' : failed ? '同步失敗 · 可重試' : Object.keys(pending).length ? '待同步' : connected ? '已連線' : '離線 · 本機保存';
      el.title = '本機開發不連接正式 Firebase。雲端寫入失敗時保留待同步項目。';
    }
  };
  window.mergeLearningSnapshot = (path, value) => {
    const result = {...(value || {})};
    for (const [fullPath, v] of Object.entries(pending)) {
      const prefix = path + '/';
      if (fullPath.startsWith(prefix)) {
        const id = fullPath.slice(prefix.length);
        if (v === null) delete result[id]; else result[id] = v;
      }
    }
    return result;
  };
  async function flush() {
    if (active || !connected || !window.learningDB || window.workspaceLocalOnly || !Object.keys(pending).length) return;
    active = true;
    const sent = {...pending};
    try {
      await window.learningDB.ref().update(sent);
      for (const [path,value] of Object.entries(sent)) {
        if (JSON.stringify(pending[path]) === JSON.stringify(value)) delete pending[path];
      }
      failed = false;
      save();
    } catch {
      failed = true;
    } finally {
      active = false;
      status();
      if (!failed && Object.keys(pending).length) void flush();
    }
  }
  window.persistProgress = (path, state, ids) => {
    if(['videos','biochem','physiology','pharmacology'].includes(path))return window.persistCourseChanges(Object.fromEntries(ids.map(id=>[path+'/'+id,state[id]??null])));
    for (const id of ids) {
      if (!window.workspaceLocalOnly) pending[`${path}/${id}`] = state[id] ?? null;
      if (['videos','biochem','physiology','pharmacology'].includes(path)) {
        window.dispatchEvent(new CustomEvent('study-completed', {detail: {path, id: String(id), complete: !!state[id]}}));
      }
    }
    if (!window.workspaceLocalOnly) save();
    status();
    window.dispatchEvent(new Event('learning-change'));
    void flush();
  };
  window.persistCourseChanges = changes => {
    for(const [path,value] of Object.entries(changes)){if(!window.workspaceLocalOnly)pending[path]=value;const slash=path.indexOf('/');window.dispatchEvent(new CustomEvent('study-completed',{detail:{path:path.slice(0,slash),id:path.slice(slash+1),complete:value===true}}));}
    if(!window.workspaceLocalOnly)save();status();window.dispatchEvent(new Event('learning-change'));void flush();
  };
  window.attachLearningDB = database => {
    if(window.i3Runtime)database=window.i3Runtime.wrap(database);
    window.learningDB = database;
    if (database) database.ref('.info/connected').on('value', snap => {
      connected = snap.val() === true;
      status();
      if (connected) void flush();
    }, () => { failed = true; status(); });
    status();
  };
  window.retryLearningSync = () => { failed = false; void flush(); status(); };
  window.reportSyncError = () => { failed = true; status(); };
})();
