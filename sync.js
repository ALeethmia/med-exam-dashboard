// Keep unsent item-level edits separate from the legacy learning state.
(() => {
  const learningStorage=window.learningStorage, key='med_exam_pending_writes_v1';
  let pending={};
  try { pending=JSON.parse(learningStorage.getItem(key)||'{}'); } catch {}
  // Persisted/interruptible Boolean writes have no server revision. Never replay them blindly.
  const review=new Set(Object.keys(pending)), conflicts=new Map();
  const owner=window.becomingStorage?.capture();
  let connected=false,active=false,failed=false,requested=false,epoch=null,connectionRef=null,connectionCallback=null;
  const valid=()=> (!owner||owner.valid()) && (epoch===null||window.workspaceLocalOnly||window.i3Runtime?.read().epoch===epoch&&window.i3Runtime.read().status!=='signedOut');
  const ready=()=>valid()&&connected&&(!window.i3Runtime||window.i3Runtime.read().status==='ready');
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const courseSync=window.createCourseSync?.({storage:learningStorage,uid:window.becomingStorage.read().uid,valid,ready,localOnly:window.workspaceLocalOnly,locks:window.navigator?.locks,onChange:()=>status(),onProjection:()=>window.refreshStudyStates?.(),prepareDates:changes=>window.prepareCourseDates?.(changes)||{},acceptDates:dates=>window.acceptCourseDates?.(dates)||false});
  window.courseSync=courseSync;
  const save=()=>{if(valid())learningStorage.setItem(key,JSON.stringify(pending));};
  function status(){
    if(!valid())return;
    const el=document.getElementById('sync-status'), course=courseSync?.inspect(), count=Object.keys(pending).length+(course?.pending.length||0);
    for(const [path,entry] of [...conflicts])if(entry.batch)conflicts.delete(path);
    for(const row of course?.pending||[])if(row.phase==='review')for(const [path,local] of Object.entries(row.changes))conflicts.set(path,{local,remote:row.remote?.[path]?.value??null,batch:row.id});
    if(course?.unknown)for(const row of course.pending.filter(row=>row.phase==='sending'))for(const [path,local] of Object.entries(row.changes))conflicts.set(path,{local,remote:null,batch:row.id,unknown:true});
    const differing=[...conflicts.values()].filter(entry=>!same(entry.local,entry.remote)).length;
    const awaiting=conflicts.size-differing;
    const loading=window.i3Runtime?.read().status==='loading';
    if(el){el.textContent=course?.localError?'本機保存失敗 · 請重新操作':course?.error?'同步暫停 · 本機已保存':window.workspaceLocalOnly?'本機模式':failed?'同步失敗 · 本機已保存':conflicts.size?'同步操作待確認':count?'等待同步確認':loading?'正在載入':connected?'已連線':'離線 · 本機保存';el.title='連線狀態不代表每筆寫入已完成。課程完成狀態與首次日期分別同步；目前快照可能包含本機快取。';}
    window.SubjectUI?.refreshDates?.();
    if(!document.createElement||!el?.closest)return;
    const header=el.closest('.workspace-topbar'),toolbar=header?.querySelector('.workspace-toolbar');
    if(!toolbar)return;
    let region=document.getElementById('learning-sync-notice');
    if(!region){
      region=document.createElement('section');region.id='learning-sync-notice';region.className='learning-sync-notice';region.setAttribute('aria-label','學習紀錄同步');
      const overview=document.createElement('p');overview.dataset.syncOverview='';overview.setAttribute('role','status');overview.setAttribute('aria-live','polite');region.append(overview);
      const panel=document.createElement('details');panel.id='learning-sync-conflicts';
      const summary=document.createElement('summary');panel.append(summary);
      const note=document.createElement('p');note.className='workspace-note';note.textContent='目前快照可能來自本機快取，尚不能證明伺服器已確認寫入。以下選擇只處理課程狀態；首次完成日期另行同步。';panel.append(note);
      const list=document.createElement('div');list.dataset.syncRows='';panel.append(list);region.append(panel);toolbar.after(region);
    }
    region.hidden=window.workspaceLocalOnly||(!count&&!failed&&!course?.localError&&!course?.error);
    const overview=region.querySelector('[data-sync-overview]');
    const message=course?.localError?'本機保存失敗，課程進度未變更，請重新操作。':course?.error?course.error:failed?'同步暫時失敗，未確認的操作仍保存在此裝置。可使用「重試同步」。':conflicts.size?`${[awaiting?awaiting+' 筆尚未取得可靠寫入確認':'',differing?differing+' 筆觀察到不同數值':''].filter(Boolean).join('，')}。請展開查看並選擇如何處理。`:!connected?'離線中，操作已保存在此裝置；連線後會核對同步狀態。':loading?'正在重新載入資料，未確認的操作仍保留。':'正在等待寫入確認，操作仍保存在此裝置。';
    if(overview.textContent!==message)overview.textContent=message;
    const panel=region.querySelector('details');panel.hidden=!conflicts.size;
    const summary=panel.querySelector('summary'),label=`${conflicts.size} 筆同步操作待確認 · 查看詳細資料`;
    if(summary.textContent!==label)summary.textContent=label;
    const list=panel.querySelector('[data-sync-rows]');
    const rows=panel.syncRows||(panel.syncRows=new Map());
    for(const [path,row] of rows)if(!conflicts.has(path)){row.remove();rows.delete(path);}
    const describe=value=>value===true?'已完成':value===false?'未完成':value===null?'沒有紀錄':JSON.stringify(value);
    for(const [path,entry] of conflicts){
      let row=rows.get(path);
      if(!row){
        row=document.createElement('article');row.className='learning-sync-item';row.dataset.syncPath=path;
        const title=document.createElement('p');title.dataset.syncTitle='';row.append(title);
        const detail=document.createElement('p');detail.dataset.syncDetail='';detail.className='workspace-note';row.append(detail);
        const actions=document.createElement('div');actions.className='learning-sync-actions';
        for(const [label,keep] of [['採用雲端',false],['重新套用本機',true]]){
          const button=document.createElement('button');button.type='button';button.className='workspace-link';button.textContent=label;
          button.onclick=async()=>{if(keep&&!window.confirm('這會以本機變更覆寫目前的雲端紀錄。無法自動判斷其他裝置的修改先後，確定重新套用？'))return;try{await window.resolveLearningSync(path,keep);}catch{window.alert('本機保存失敗，選擇尚未完成；請重試。');}};actions.append(button);
        }
        row.append(actions);rows.set(path,row);list.append(row);
      }
      const equal=same(entry.local,entry.remote),title=row.querySelector('[data-sync-title]');
      const text=entry.unknown?'寫入結果未知，保留操作並停止重送':equal?'尚未取得可靠寫入確認':'觀察到不同數值，先後尚待確認';
      if(title.textContent!==text)title.textContent=text;
      row.dataset.syncKind=entry.unknown?'unknown':equal?'unconfirmed':'observed-difference';
      const detail=row.querySelector('[data-sync-detail]');
      const [subject,id]=path.split('/'),data=window.studyData||{};
      const courses={physiology:(data.physio||[]).flatMap(c=>c.sections),videos:(data.anatomy||[]).flatMap(c=>c.lectures),biochem:data.biochem||[],pharmacology:(data.pharm||[]).flatMap(c=>c.lectures)};
      const course=courses[subject]?.find(c=>String(c.id)===id);
      const description=(entry.unknown?'請保留此紀錄交由維護者核對；目前沒有可安全套用或捨棄的選項。 ':'')+(entry.batch?'此選擇會套用整批課程。 ':'')+`${course?.title?course.title+'（'+path+'）':path} · 本機操作：${describe(entry.local)}；目前快照：${describe(entry.remote)}（未驗證為伺服器最新值）。`;
      if(detail.textContent!==description)detail.textContent=description;
      for(const button of row.querySelectorAll('button'))button.disabled=!!entry.unknown||!ready();
    }
  }
  window.mergeLearningSnapshot=(path,value)=>{
    const result={...(value||{})};
    for(const [fullPath,v] of Object.entries(pending)){const prefix=path+'/';if(fullPath.startsWith(prefix)){const id=fullPath.slice(prefix.length);if(v===null)delete result[id];else result[id]=v;}}
    return courseSync?courseSync.overlay(path,result):result;
  };
  function pause(){for(const path of Object.keys(pending))review.add(path);}
  async function flush(){
    if(active){requested=true;return;}
    if(!ready()||!window.learningDB||window.workspaceLocalOnly||!Object.keys(pending).length)return;
    active=true;requested=false;
    try{
      // A value callback/once can be SDK cache, not a server write acknowledgement.
      // Unconfirmed intents require a decision even when the observed value matches.
      for(const path of [...review]){
        if(!Object.hasOwn(pending,path)){review.delete(path);continue;}
        const local=pending[path],snap=await window.learningDB.ref(path).once('value');
        if(!ready())return;
        if(!same(local,pending[path]))continue;
        const remote=snap.val();
        conflicts.set(path,{local,remote});
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
    if(!valid())throw Error('登入狀態已改變，未保存操作。');
    if(courseSync){
      if(Object.keys(changes).some(path=>Object.hasOwn(pending,path)))throw Error('此課程有歷史待確認紀錄，請先完成個別核對。');
      return courseSync.enqueue(changes,{baseline:Object.fromEntries(Object.entries(window.readStudyStates?.()||{}).flatMap(([path,state])=>Object.entries(state).map(([id,value])=>[path+'/'+id,value])))});
    }
    // Save the Boolean intent before the independently retried first-date listener runs.
    queue(changes);
    for(const [path,value] of Object.entries(changes)){const slash=path.indexOf('/');window.dispatchEvent(new CustomEvent('study-completed',{detail:{path:path.slice(0,slash),id:path.slice(slash+1),complete:value===true}}));}
    return {saved:true,changes};
  };
  window.learningSyncStatus=path=>courseSync?.status(path).pending?courseSync.status(path):({pending:Object.hasOwn(pending,path),review:review.has(path),failed});
  window.resolveLearningSync=async(path,keepLocal)=>{
    const entry=conflicts.get(path);
    if(entry?.batch){await courseSync.resolve(path,keepLocal);if(!keepLocal)window.i3Runtime?.retry();status();return;}
    if(!ready()||!entry||!same(entry.local,pending[path]))return;
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
    const rawDatabase=database;
    connectionRef?.off?.('value',connectionCallback);
    epoch=window.i3Runtime?.read().epoch??null;connected=false;
    if(window.i3Runtime)database=window.i3Runtime.wrap(database);
    window.learningDB=database;
    if(database){connectionRef=database.ref('.info/connected');connectionCallback=snap=>{if(!valid())return;connected=snap.val()===true;if(!connected)pause();status();if(connected){void flush();void courseSync?.pump();}};connectionRef.on('value',connectionCallback,()=>{if(valid()){failed=true;pause();status();}});}
    courseSync?.attach(rawDatabase);status();
  };
  window.retryLearningSync=()=>{if(!valid())return;failed=false;void flush();void courseSync?.pump();status();};
  window.reportSyncError=()=>{if(valid()){failed=true;pause();status();}};
  let previousStatus=window.i3Runtime?.read().status;
  window.i3Runtime?.subscribe(state=>{
    if(!valid()){courseSync?.close();connectionRef?.off?.('value',connectionCallback);document.getElementById('learning-sync-conflicts')?.remove?.();return;}
    const becameReady=state.status==='ready'&&previousStatus!=='ready';previousStatus=state.status;
    if(state.status!=='ready')pause();else if(becameReady)window.retryLearningSync();
  });
})();
