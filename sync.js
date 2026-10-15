// Keep unsent item-level edits separate from the legacy learning state.
(() => {
  const learningStorage=window.learningStorage, key='med_exam_pending_writes_v1';
  let pending={};
  try { pending=JSON.parse(learningStorage.getItem(key)||'{}'); } catch {}
  // Persisted/interruptible Boolean writes have no server revision. Never replay them blindly.
  const review=new Set(Object.keys(pending)), conflicts=new Map();
  const owner=window.becomingStorage?.capture();
  let connected=false,active=false,failed=false,requested=false,epoch=null,connectionRef=null,connectionCallback=null;
  const valid=()=> (!owner||owner.valid()) && (epoch===null||window.i3Runtime?.read().epoch===epoch&&window.i3Runtime.read().status!=='signedOut');
  const ready=()=>valid()&&connected&&(!window.i3Runtime||window.i3Runtime.read().status==='ready');
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const save=()=>{if(valid())learningStorage.setItem(key,JSON.stringify(pending));};
  function status(){
    if(!valid())return;
    const el=document.getElementById('sync-status');
    if(el){el.textContent=window.workspaceLocalOnly?'本機模式':failed?'同步失敗 · 可重試':conflicts.size?'離線變更待確認':Object.keys(pending).length?'待同步':connected?'已連線':'離線 · 本機保存';el.title='課程完成與首次日期分別同步。離線或失敗的變更會先核對雲端，差異需確認後才套用。';}
    window.SubjectUI?.refreshDates?.();
    if(!document.createElement||!el?.parentElement)return;
    let panel=document.getElementById('learning-sync-conflicts');
    if(!panel){panel=document.createElement('details');panel.id='learning-sync-conflicts';panel.className='workspace-note';panel.style.maxWidth='100%';panel.style.overflowWrap='anywhere';el.parentElement.append(panel);}
    panel.hidden=!conflicts.size;panel.replaceChildren();
    if(!conflicts.size)return;
    const summary=document.createElement('summary');summary.textContent=`${conflicts.size} 筆離線變更待確認`;panel.append(summary);
    const note=document.createElement('p');note.textContent='雲端與本機不同，已暫停自動重播。課程只有完成狀態，無法確認哪份較新；首次完成日期另行同步。';panel.append(note);
    for(const [path,entry] of conflicts){
      const row=document.createElement('p');row.append(document.createTextNode(`${path} · 本機：${JSON.stringify(entry.local)} · 雲端：${JSON.stringify(entry.remote)} `));
      for(const [label,keep] of [['採用雲端',false],['重新套用本機',true]]){const button=document.createElement('button');button.type='button';button.className='workspace-link';button.textContent=label;button.disabled=!ready();button.onclick=()=>{if(keep&&!window.confirm('這會以本機變更覆寫目前的雲端紀錄。無法自動判斷其他裝置的修改先後，確定重新套用？'))return;void window.resolveLearningSync(path,keep);};row.append(button);}
      panel.append(row);
    }
  }
  window.mergeLearningSnapshot=(path,value)=>{
    const result={...(value||{})};
    for(const [fullPath,v] of Object.entries(pending)){const prefix=path+'/';if(fullPath.startsWith(prefix)){const id=fullPath.slice(prefix.length);if(v===null)delete result[id];else result[id]=v;}}
    return result;
  };
  function pause(){for(const path of Object.keys(pending))review.add(path);}
  async function flush(){
    if(active){requested=true;return;}
    if(!ready()||!window.learningDB||window.workspaceLocalOnly||!Object.keys(pending).length)return;
    active=true;requested=false;
    try{
      // Matching server values acknowledge an uncertain write without submitting it again.
      for(const path of [...review]){
        if(!Object.hasOwn(pending,path)){review.delete(path);continue;}
        const local=pending[path],snap=await window.learningDB.ref(path).once('value');
        if(!ready())return;
        if(!same(local,pending[path]))continue;
        const remote=snap.val();
        if(same(remote,local)){delete pending[path];review.delete(path);conflicts.delete(path);save();}
        else conflicts.set(path,{local,remote});
      }
      if(!ready())return;
      const sent=Object.fromEntries(Object.entries(pending).filter(([path])=>!review.has(path)));
      if(Object.keys(sent).length){
        await window.learningDB.ref().update(sent);
        if(!valid())return;
        for(const [path,value] of Object.entries(sent))if(same(pending[path],value)){delete pending[path];review.delete(path);conflicts.delete(path);}
        save();
      }
      failed=false;
    }catch{
      if(valid()){failed=true;pause();}
    }finally{
      active=false;status();
      // A ready notification may arrive while the rejected/old attempt is still settling.
      if(valid()&&ready()&&(requested||!failed&&Object.keys(pending).some(path=>!review.has(path)))){requested=false;void flush();}
    }
  }
  function queue(changes){
    if(!valid())return;
    for(const [path,value] of Object.entries(changes)){
      if(!window.workspaceLocalOnly){pending[path]=value;if(!ready()||review.has(path))review.add(path);conflicts.delete(path);}
    }
    if(!window.workspaceLocalOnly)save();status();window.dispatchEvent(new Event('learning-change'));void flush();
  }
  window.persistProgress=(path,state,ids)=>{
    if(['videos','biochem','physiology','pharmacology'].includes(path))return window.persistCourseChanges(Object.fromEntries(ids.map(id=>[path+'/'+id,state[id]??null])));
    queue(Object.fromEntries(ids.map(id=>[path+'/'+id,state[id]??null])));
  };
  window.persistCourseChanges=changes=>{
    if(!valid())return;
    // Save the Boolean intent before the independently retried first-date listener runs.
    queue(changes);
    for(const [path,value] of Object.entries(changes)){const slash=path.indexOf('/');window.dispatchEvent(new CustomEvent('study-completed',{detail:{path:path.slice(0,slash),id:path.slice(slash+1),complete:value===true}}));}
  };
  window.learningSyncStatus=path=>({pending:Object.hasOwn(pending,path),review:review.has(path),failed});
  window.resolveLearningSync=async(path,keepLocal)=>{
    const entry=conflicts.get(path);if(!ready()||!entry||!same(entry.local,pending[path]))return;
    if(keepLocal){review.delete(path);conflicts.delete(path);failed=false;void flush();}
    else{
      // Explicitly discard this local intent only; refresh existing subscriptions to replace overlays.
      delete pending[path];review.delete(path);conflicts.delete(path);save();window.i3Runtime?.retry();
    }
    status();window.dispatchEvent(new Event('learning-change'));
  };
  window.attachLearningDB=database=>{
    if(owner&&!owner.valid())return;
    if(window.workspaceLocalOnly)database=null;
    connectionRef?.off?.('value',connectionCallback);
    epoch=window.i3Runtime?.read().epoch??null;connected=false;
    if(window.i3Runtime)database=window.i3Runtime.wrap(database);
    window.learningDB=database;
    if(database){connectionRef=database.ref('.info/connected');connectionCallback=snap=>{if(!valid())return;connected=snap.val()===true;if(!connected)pause();status();if(connected)void flush();};connectionRef.on('value',connectionCallback,()=>{if(valid()){failed=true;pause();status();}});}
    status();
  };
  window.retryLearningSync=()=>{if(!valid())return;failed=false;void flush();status();};
  window.reportSyncError=()=>{if(valid()){failed=true;pause();status();}};
  let previousStatus=window.i3Runtime?.read().status;
  window.i3Runtime?.subscribe(state=>{
    if(!valid()){connectionRef?.off?.('value',connectionCallback);document.getElementById('learning-sync-conflicts')?.remove?.();return;}
    const becameReady=state.status==='ready'&&previousStatus!=='ready';previousStatus=state.status;
    if(state.status!=='ready')pause();else if(becameReady)window.retryLearningSync();
  });
})();
