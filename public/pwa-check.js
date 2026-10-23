(async()=>{
 const result={url:location.href,secureContext:isSecureContext,displayMode:['standalone','fullscreen','minimal-ui'].find(mode=>matchMedia('(display-mode: '+mode+')').matches)||'browser',appleStandalone:navigator.standalone===true,userAgent:navigator.userAgent};
 try{
  result.controller=navigator.serviceWorker?.controller?.scriptURL||null;
  result.registrations=await Promise.all((await navigator.serviceWorker.getRegistrations()).filter(r=>r.scope===new URL('./',location.href).href).map(async r=>({scope:r.scope,active:r.active?.scriptURL,activeState:r.active?.state,waiting:!!r.waiting,installing:!!r.installing})));
  const url=new URL('./manifest.webmanifest',location.href),response=await fetch(url,{cache:'no-store'});
  if(!response.ok)throw Error('manifest HTTP '+response.status);
  const manifest=await response.json();result.manifest={...manifest,resolvedStart:new URL(manifest.start_url,url).href,resolvedScope:new URL(manifest.scope,url).href};
 }catch(error){result.error=error.message;}
 document.getElementById('result').textContent=JSON.stringify(result,null,2);
})();
