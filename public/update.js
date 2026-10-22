const button=document.getElementById('update'),status=document.getElementById('updateStatus');
button.onclick=async()=>{button.disabled=true;status.textContent='正在取得更新…';try{
 const registration=await navigator.serviceWorker.register('./sw.js');await registration.update();
 const activate=()=>{if(registration.waiting){status.textContent='正在啟用更新…';registration.waiting.postMessage({type:'KIDSTUBE_ACTIVATE_UPDATE'});return true;}return false;};
 navigator.serviceWorker.addEventListener('controllerchange',()=>location.replace('./'),{once:true});
 if(activate())return;
 if(registration.installing){registration.installing.addEventListener('statechange',()=>activate());return;}
 location.replace('./');
}catch{status.textContent='更新失敗，請確認本機伺服器仍在執行。';button.disabled=false;}};
