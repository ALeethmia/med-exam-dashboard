// Called before importing Auth, account storage, the learning runtime, or any writer.
export function showMaintenance(document){
 document.title='Becoming — 系統維護中';
 const style=document.createElement('style');
 style.textContent='body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,sans-serif}#maintenance{box-sizing:border-box;max-width:38rem;margin:12vh auto;padding:2rem;line-height:1.8}#maintenance h1{font-size:1.7rem}#maintenance p{color:#cbd5e1}';
 const main=document.createElement('main');main.id='maintenance';main.tabIndex=-1;
 const heading=document.createElement('h1');heading.textContent='系統維護中';
 const message=document.createElement('p');message.textContent='Becoming 暫停使用，請稍後再回來。你的資料不會因維護模式而被清除。';
 main.append(heading,message);document.head.append(style);document.body.replaceChildren(main);main.focus();
}
