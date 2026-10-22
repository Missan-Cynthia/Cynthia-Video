const button=document.getElementById('update'),status=document.getElementById('updateStatus');
button.textContent='更新至 v14 並回到首頁';
button.onclick=async()=>{button.disabled=true;status.textContent='正在重建 v14 播放服務…';try{
 const scope=new URL('./',location.href).href;
 for(const registration of await navigator.serviceWorker.getRegistrations())if(registration.scope===scope)await registration.unregister();
 for(const key of await caches.keys())if(key.startsWith('kt-shell-'))await caches.delete(key);
 location.replace('./?version=14');
}catch(error){status.textContent='更新失敗：'+error.message;button.disabled=false;}};
