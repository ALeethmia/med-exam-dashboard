// Build metadata is optional; failure never blocks the learning workspace.
export async function showVersion({fetchInfo=()=>fetch('./public/app-version.json',{cache:'no-store'}),container=document.querySelector('.workspace-main')}={}) {
 const footer=document.createElement('footer');footer.id='app-version';footer.className='app-version workspace-note';container.append(footer);
 try{const response=await fetchInfo();if(!response.ok)throw new Error('Version unavailable');const info=await response.json();
  if(typeof info.version!=='string'||!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.(0|[1-9]\d*))?$/.test(info.version))throw new Error('Invalid version');
  footer.textContent='Becoming v'+info.version;
  if(typeof info.commit==='string'&&/^[a-f0-9]{40}$/i.test(info.commit))footer.textContent+=' · '+info.commit.slice(0,7);
 }catch{footer.textContent='版本資訊暫時無法載入';}
 return footer;
}
