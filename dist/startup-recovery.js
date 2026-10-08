// Keep startup failures recoverable without treating unrelated injected errors
// as application failures. Do not preventDefault: browser diagnostics stay intact.
(() => {
  // The module graph can still be awaiting its embedded fonts. Keep the
  // already-visible skip button responsive before scene.js installs handlers.
  const initialLoading=document.querySelector('#loading');
  initialLoading?.addEventListener?.('click',event=>{
    const button=event.target?.closest?.('[data-entrance-skip]');
    if(!button||initialLoading.dataset.state!=='loading')return;
    initialLoading.dataset.skipRequested='true';
    button.textContent='准备好后直接进入';button.disabled=true;
    event.preventDefault();
  });
  let ready=false,generatedMessage=null;
  const recoveryNodes=[];
  const appBase=new URL('.',document.currentScript?.src||location.href);
  function localURL(value){
    if(typeof value!=='string'||!value.trim())return false;
    try{const url=new URL(value,appBase);return url.origin===appBase.origin&&url.pathname.startsWith(appBase.pathname);}catch{return false;}
  }
  function ownScript(value){
    if(!localURL(value))return false;
    try{return /\.(?:m?js|html?)$/i.test(new URL(value,appBase).pathname);}catch{return false;}
  }
  function logUnrelated(event){console.warn('Ignored an unrelated error during room startup.',event.error||event.reason||event);}
  function belongsToRoom(event){
    if(event.type==='unhandledrejection'){
      const reason=event.reason,stack=typeof reason?.stack==='string'?reason.stack:'';
      const file=reason?.fileName||reason?.filename;
      const urls=[...(file?[String(file)]:[]),...(stack.match(/(?:https?:\/\/|(?:chrome|moz|safari)-extension:\/\/|file:\/\/|blob:https?:\/\/)[^\s<>"']+/g)||[])]
        .map(url=>url.replace(/[),;]+$/,'').replace(/:\d+(?::\d+)?$/,''));
      if(urls.some(ownScript))return true;
      if(urls.length){logUnrelated(event);return false;}
      // A rejection with no attributable URL could still be a real application
      // error (for example a failed fetch). Keep a conservative recovery path.
      console.warn('Unattributed rejection during room startup.',reason);
      return true;
    }
    const target=event.target,tag=String(target?.tagName||'').toUpperCase();
    if(tag==='SCRIPT'||tag==='LINK'){
      const url=tag==='SCRIPT'?target.src:target.href;
      if(localURL(url))return true;
      logUnrelated(event);return false;
    }
    if(ownScript(event.filename))return true;
    logUnrelated(event);return false;
  }
  function failed(event){
    if(ready||!belongsToRoom(event))return;
    const loading=document.querySelector('#loading'),panel=document.querySelector('#error');
    if(!panel)return;
    if(loading)loading.hidden=true;
    // Preserve any specific explanation already supplied by scene.js,
    // including the hardware-acceleration/WebGL message.
    if(!panel.textContent.trim()){
      generatedMessage=navigator.onLine?'房间没有完整载入，请重试。':'网络已断开。连接网络后，再打开房间。';
      panel.textContent=generatedMessage;
    }
    panel.hidden=false;
    if(!panel.querySelector('button')){
      const retry=document.createElement('button'),br=document.createElement('br');retry.textContent='重新打开房间';
      retry.addEventListener('click',()=>location.reload());panel.append(br,retry);recoveryNodes.push(br,retry);
    }
  }
  function roomReady(){
    ready=true;removeEventListener('error',failed,true);removeEventListener('unhandledrejection',failed);
    for(const node of recoveryNodes)node.remove();recoveryNodes.length=0;
    const panel=document.querySelector('#error');
    // Clear only the exact generic text this script wrote. Do not erase a later
    // specific application diagnosis, nor an existing WebGL explanation.
    if(panel&&generatedMessage!==null&&panel.textContent.trim()===generatedMessage){panel.textContent='';panel.hidden=true;}
    generatedMessage=null;
  }
  addEventListener('error',failed,true);
  addEventListener('unhandledrejection',failed);
  addEventListener('room-ready',roomReady,{once:true});
})();
