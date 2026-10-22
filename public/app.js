const cloudMode=globalThis.KIDSTUBE_SETTINGS?.mode!=='local';
let firebaseClient=null,firebaseReady=false,cloudErrorText=()=> '雲端連線失敗，請檢查設定與網路。',syncing=null,pendingSync=false,authEpoch=0;
let cloudCatalogError='',cloudCatalogLoading=false;
const cloudPosters=new Map();
const $=id=>document.getElementById(id),MEDIA='kt-media-v1';let videos=[],downloaded=new Set(),onlyOffline=false,csrf='',installEvent,uploading=false,downloading=false;
const say=t=>$('status').textContent=t,adminSay=t=>$('adminStatus').textContent=t;
async function api(url,options={}){const r=await fetch(url,{...options,headers:{...options.headers,...(csrf?{'X-CSRF-Token':csrf}:{})}});const data=await r.json();if(!r.ok){if(r.status===401)lock();throw Error(data.error||'操作失敗');}return data;}
function shuffle(items){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
async function refreshDownloads(){const cache=await caches.open(MEDIA);downloaded=new Set((await cache.keys()).map(r=>new URL(r.url).pathname));}
const media=v=>cloudMode?KidsTubeCloud.mediaURL(v.path,v.generation):`/media/${v.id}.mp4`;
let fallbackPlaybackURL=null;
let view='home',query='',recent=false,currentVideo=null;
let favorites=new Set();try{favorites=new Set(JSON.parse(localStorage.getItem('kt-favorites')||'[]'));}catch{}
const paths={home:'M3 10 12 3l9 7v11h-6v-7H9v7H3Z',heart:'M12 21 3 12C-3 5 7-1 12 6 17-1 27 5 21 12Z',download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',refresh:'M20 7a9 9 0 1 0 1 9M20 2v6h-6',plus:'M12 4v16M4 12h16',play:'m9 5 11 7-11 7Z'};
function icon(name){const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('aria-hidden','true');const p=document.createElementNS(s.namespaceURI,'path');p.setAttribute('d',paths[name]);s.append(p);return s;}
document.querySelectorAll('[data-icon]').forEach(el=>el.append(icon(el.dataset.icon)));
function toggleFavorite(v){if(favorites.has(v.id))favorites.delete(v.id);else favorites.add(v.id);try{localStorage.setItem('kt-favorites',JSON.stringify([...favorites]));}catch{say('無法保存收藏，請檢查裝置空間');}render();if(currentVideo)$('favoritePlaying').textContent=favorites.has(currentVideo.id)?'已收藏 ✓':'收藏影片';}
const thumbCache='kt-thumbnails-v1',thumbQueue=[];let thumbActive=0;const objectURLs=new Set();
function thumbKey(v){return '/thumbnail/'+v.id;}
async function makeThumbnail(v){
 const epoch=authEpoch;
 let cache,thumbnailSource=null;
 if(cloudMode){
  const poster=await cloudThumbnail(v);if(poster)return poster;
  if(!firebaseClient?.user||!navigator.onLine)return null;
  try{const blob=await firebaseClient.videoBlob(v.path,true);if(epoch!==authEpoch)return null;thumbnailSource=URL.createObjectURL(blob);}catch{return null;}
 }else{
  cache=await caches.open(thumbCache);const hit=await cache.match(thumbKey(v));if(hit)return hit;
  if(!navigator.onLine&&!downloaded.has(media(v)))return null;
 }
 const result=await new Promise(resolve=>{const video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='metadata';let finished=false;const timer=setTimeout(()=>finish(null),12000);
  function finish(data){if(finished)return;finished=true;clearTimeout(timer);video.removeAttribute('src');video.load();if(thumbnailSource)URL.revokeObjectURL(thumbnailSource);resolve(data);}
  video.onloadedmetadata=()=>{if((cloudMode&&epoch!==authEpoch)||!Number.isFinite(video.duration)||!video.duration){finish(null);return;}video.currentTime=Math.min(1,video.duration/3);};
  video.onseeked=()=>{try{const canvas=document.createElement('canvas');canvas.width=480;canvas.height=Math.round(480*video.videoHeight/video.videoWidth)||270;canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);const duration=Math.floor(video.duration);canvas.toBlob(blob=>finish(blob?{blob,duration}:null),'image/jpeg',.8);}catch{finish(null);}};
  video.onerror=()=>finish(null);video.src=thumbnailSource||media(v);
 });
 if(!result||(cloudMode&&epoch!==authEpoch))return null;
 const response=new Response(result.blob,{headers:{'Content-Type':'image/jpeg','X-Duration':String(result.duration)}});
 if(cloudMode)cloudPosters.set(v.id+':'+v.generation,response.clone());
 else try{await cache.put(thumbKey(v),response.clone());}catch{}
 return response;
}
function pumpThumbs(){while(thumbActive<2&&thumbQueue.length){const job=thumbQueue.shift();if(!job.target.isConnected)continue;thumbActive++;makeThumbnail(job.video).then(async response=>{if(!response||!job.target.isConnected)return;const url=URL.createObjectURL(await response.blob());objectURLs.add(url);const image=document.createElement('img');image.alt='';image.src=url;job.target.querySelector('.thumb-placeholder')?.replaceWith(image);const seconds=Number(response.headers.get('X-Duration'));if(Number.isFinite(seconds)&&seconds>0){const time=document.createElement('span');time.className='duration';time.textContent=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');job.target.append(time);}}).catch(()=>{}).finally(()=>{thumbActive--;pumpThumbs();});}}
const thumbObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){thumbObserver.unobserve(entry.target);thumbQueue.push({target:entry.target,video:entry.target.videoData});pumpThumbs();}},{rootMargin:'150px'});
function createCard(v){const card=document.createElement('article');card.className='card';const thumb=document.createElement('button');thumb.className='thumbnail';thumb.setAttribute('aria-label','播放 '+v.title);const placeholder=document.createElement('span');placeholder.className='thumb-placeholder';placeholder.append(icon('play'));thumb.append(placeholder);thumb.onclick=()=>playVideo(v);thumb.videoData=v;thumbObserver.observe(thumb);
 const info=document.createElement('div');info.className='card-info';const avatar=document.createElement('span');avatar.className='channel-avatar';avatar.textContent='K';avatar.setAttribute('aria-hidden','true');const copy=document.createElement('div');copy.className='card-copy';const title=document.createElement('button');title.className='title-button';title.textContent=v.title;title.onclick=()=>playVideo(v);const meta=document.createElement('div');meta.className='meta';meta.textContent=v.category||'家庭頻道';meta.append(document.createElement('br'),document.createTextNode(downloaded.has(media(v))?'已下載 · 可離線播放':'家長精選'));const save=document.createElement('button');save.className='save-button'+(favorites.has(v.id)?' saved':'');save.textContent=favorites.has(v.id)?'★':'☆';save.setAttribute('aria-label',(favorites.has(v.id)?'取消收藏 ':'收藏 ')+v.title);save.setAttribute('aria-pressed',String(favorites.has(v.id)));save.onclick=()=>toggleFavorite(v);copy.append(title,meta);info.append(avatar,copy,save);card.append(thumb,info);return card;
}
function render(reorder=false){if(reorder)videos=shuffle(videos);thumbObserver.disconnect();thumbQueue.length=0;for(const url of objectURLs)URL.revokeObjectURL(url);objectURLs.clear();$('grid').replaceChildren();
 $('all').classList.toggle('selected',!onlyOffline&&!recent);$('offline').classList.toggle('selected',onlyOffline);$('recent').classList.toggle('selected',recent);for(const name of ['home','favorites','downloads'])$(name).classList.toggle('active',view===name);
 const visible=videos.filter(v=>(!onlyOffline||downloaded.has(media(v)))&&(view!=='favorites'||favorites.has(v.id))&&v.title.toLocaleLowerCase().includes(query));if(recent)visible.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
 $('viewTitle').textContent=query?'搜尋結果':view==='favorites'?'收藏影片':onlyOffline?'已下載':'推薦影片';
 if(!visible.length){const p=document.createElement('p');p.className='empty';p.textContent=cloudMode&&!firebaseClient?.user?'請家長登入，開啟你的私人片庫。':cloudMode&&cloudCatalogError?cloudCatalogError:cloudMode&&cloudCatalogLoading?'正在讀取雲端影片…':query?'找不到符合的影片。':view==='favorites'?'按影片旁的 ☆，收藏喜歡的影片。':onlyOffline?'還沒有離線影片。請家長到管理區下載。':cloudMode?'雲端 video/ 資料夾尚未找到 MP4。':'尚未加入影片，請家長先上傳 MP4。';$('grid').append(p);}
 visible.forEach(v=>$('grid').append(createCard(v)));$('endLoader').hidden=visible.length===0;
}
async function localSync(reorder=false){
 try{const fresh=await api('/api/catalog');localStorage.setItem('kt-catalog',JSON.stringify(fresh));videos=fresh;
  const cache=await caches.open(MEDIA),valid=new Set(fresh.map(media));for(const r of await cache.keys())if(!valid.has(new URL(r.url).pathname))await cache.delete(r);
  const thumbs=await caches.open(thumbCache),validThumbs=new Set(fresh.map(thumbKey));for(const r of await thumbs.keys())if(!validThumbs.has(new URL(r.url).pathname))await thumbs.delete(r);
  say('');
 }catch{try{videos=JSON.parse(localStorage.getItem('kt-catalog')||'[]');}catch{videos=[];}say('目前無法連線 · 已下載影片仍可播放');}
 try{await refreshDownloads();}catch{say('此瀏覽器無法使用離線儲存，請使用一般模式與 HTTPS');}render(reorder);
}
async function sync(reorder=false){
 if(!cloudMode)return localSync(reorder);
 if($('player').open){pendingSync=true;return;}
 if(syncing)return syncing;
 if(!firebaseClient?.user){say('請家長登入這台裝置，再開啟影片。');return;}
 const epoch=authEpoch;
 syncing=(async()=>{cloudCatalogError='';cloudCatalogLoading=true;if(!videos.length)render();say('正在同步雲端影片…');try{
  const fresh=await firebaseClient.catalog();
  if(epoch!==authEpoch)return;
  cloudCatalogLoading=false;videos=fresh;downloaded.clear();render(reorder);updateCloudManagement();
  say(fresh.length?'':'雲端尚未找到 MP4，請家長確認實際上傳路徑與讀取規則。');
 }catch(error){if(epoch!==authEpoch)return;cloudCatalogLoading=false;cloudCatalogError=cloudErrorText(error);if(error.code==='storage/unauthorized')videos=[];render();say(cloudCatalogError);adminSay(cloudCatalogError);updateCloudManagement();}
 })().finally(()=>{syncing=null;});return syncing;
}
async function playVideo(v){
 if(cloudMode){if(!navigator.onLine){say('目前離線；這次雲端版本僅支援線上播放。');return;}if(!firebaseClient?.user){say('請家長先登入。');return;}if(!navigator.serviceWorker.controller){say('播放服務準備中，請關閉所有 KidsTube 視窗後重新開啟。');return;} }
if(!navigator.onLine&&!downloaded.has(media(v))){say('這部尚未下載，連上網路後再觀看。');return;}
 stop();currentVideo=v;$('favoritePlaying').textContent=favorites.has(v.id)?'已收藏 ✓':'收藏影片';$('recommendations').replaceChildren();videos.filter(item=>item.id!==v.id).slice(0,8).forEach(item=>$('recommendations').append(createCard(item)));$('playing').textContent=v.title;$('playStatus').textContent='';if(!$('player').open)$('player').showModal();
 if(cloudMode){
  try{
   const probe=await fetch(media(v),{headers:{Range:'bytes=0-0'},cache:'no-store'});
   if(!probe.ok){
    const detail=await probe.text();
    if(probe.status!==503){$('playStatus').textContent='影片讀取失敗（HTTP '+probe.status+'）：'+detail.slice(0,180);return;}
    $('playStatus').textContent='串流連線失敗，正在透過 Firebase SDK 載入影片…';
    const epoch=authEpoch,blob=await firebaseClient.videoBlob(v.path);
    if(epoch!==authEpoch||currentVideo!==v||!$('player').open)return;
    if(fallbackPlaybackURL)URL.revokeObjectURL(fallbackPlaybackURL);
    fallbackPlaybackURL=URL.createObjectURL(blob);$('video').src=fallbackPlaybackURL;$('playStatus').textContent='';
    await $('video').play();return;
   }
   await probe.body?.cancel();
  }catch(error){$('playStatus').textContent='影片讀取失敗：'+(error.code||error.name)+': '+error.message;return;}
  if(currentVideo!==v||!$('player').open)return;
 }
 $('video').src=media(v);try{await $('video').play();}catch{if(!$('playStatus').textContent)$('playStatus').textContent='請按播放器的播放鍵；若仍失敗，請提供下方錯誤訊息。';}}
function stop(){$('video').pause();$('video').removeAttribute('src');$('video').load();if(fallbackPlaybackURL){URL.revokeObjectURL(fallbackPlaybackURL);fallbackPlaybackURL=null;}}
$('closePlayer').onclick=()=>$('player').close();$('player').addEventListener('close',()=>{stop();if(pendingSync){pendingSync=false;sync(true);}});$('video').onerror=()=>{if($('playStatus').textContent.includes('HTTP '))return;$('playStatus').textContent=cloudMode?'影片解碼失敗（MediaError '+($('video').error?.code||'未知')+'）：'+($('video').error?.message||'請確認影片使用 H.264／AAC 編碼。'):'播放失敗。請確認影片已完整下載，或連線重試。建議使用 H.264 + AAC MP4。';};
function selectView(name){view=name;onlyOffline=name==='downloads';recent=false;query='';$('search').value='';render();window.scrollTo({top:0,behavior:'smooth'});}
$('home').onclick=()=>selectView('home');$('favorites').onclick=()=>selectView('favorites');$('downloads').onclick=()=>selectView('downloads');$('menu').onclick=()=>document.body.classList.toggle('compact');
$('all').onclick=()=>{onlyOffline=false;recent=false;render();};$('offline').onclick=()=>{onlyOffline=true;recent=false;render();};$('recent').onclick=()=>{recent=true;onlyOffline=false;render();};$('sync').onclick=()=>sync(true);
$('searchForm').onsubmit=e=>{e.preventDefault();query=$('search').value.trim().toLocaleLowerCase();render();};$('search').addEventListener('input',()=>{query=$('search').value.trim().toLocaleLowerCase();render();});$('favoritePlaying').onclick=()=>{if(currentVideo)toggleFavorite(currentVideo);};
function lock(){csrf='';$('management').hidden=true;$('login').hidden=false;$('password').value='';$('adminList').replaceChildren();}
async function logout(){try{await api('/api/admin/logout',{method:'POST'});}catch{}lock();}
$('parent').onclick=()=>{if(cloudMode)updateCloudManagement();$('admin').showModal();(cloudMode?$('email'):$('password')).focus();};$('closeAdmin').onclick=()=>$('admin').close();$('admin').addEventListener('close',()=>{if(!cloudMode&&csrf)logout();});$('logout').onclick=()=>cloudMode?firebaseClient?.logout():logout();
$('login').onsubmit=async e=>{e.preventDefault();if(cloudMode){
 const button=$('login').querySelector('button');button.disabled=true;
 try{if(!firebaseClient)throw Error('尚未完成設定');await firebaseClient.login($('email').value,$('password').value);$('password').value='';adminSay('登入成功，這台裝置將保留登入狀態。');}
 catch(error){adminSay(firebaseClient?cloudErrorText(error):'請先補上 Firebase Web App 設定，再重新整理。');}finally{button.disabled=false;}return;
 }try{const result=await api('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('password').value})});csrf=result.csrf;$('password').value='';$('management').hidden=false;$('login').hidden=true;adminSay('管理已解鎖，15 分鐘後需重新登入。');await adminList();}catch(err){adminSay(err.message);}};
async function adminList(){const items=await api('/api/admin/videos');await refreshDownloads();$('adminList').replaceChildren();
 for(const v of items){const row=document.createElement('article'),h=document.createElement('strong'),p=document.createElement('p'),dl=document.createElement('button'),del=document.createElement('button');h.textContent=v.title;p.textContent=v.rights;dl.textContent=downloaded.has(media(v))?'移除本機下載':'下載供離線觀看';dl.onclick=async()=>{if(downloading)return;downloading=true;dl.disabled=true;try{
 const cache=await caches.open(MEDIA);if(downloaded.has(media(v))){await cache.delete(media(v));adminSay('已移除本機下載');}else{
  if(!navigator.serviceWorker.controller)throw Error('離線功能準備中，請重新開啟 App 後下載');
  await api('/api/admin/videos'); // 驗證家長工作階段仍有效
  if(v.size>200*1048576)throw Error('本機下載上限為每部 200 MB，請先壓縮影片');
  await navigator.storage?.persist?.();const estimate=await navigator.storage?.estimate?.();if(estimate?.quota&&estimate.quota-(estimate.usage||0)<v.size*1.2)throw Error('裝置空間不足，請先移除其他下載');
  adminSay('下載中，請保持 App 在前景…');const response=await fetch(media(v));if(!response.ok||response.status!==200)throw Error('下載失敗');
  const blob=await response.blob();if(blob.size!==v.size)throw Error('下載不完整，請重試');await cache.put(media(v),new Response(blob,{headers:{'Content-Type':'video/mp4','Content-Length':String(blob.size)}}));adminSay('下載完成，請用飛航模式測試播放');
 }await refreshDownloads();render();await adminList();}catch(err){adminSay(err.message||'儲存失敗，可能空間不足');}finally{downloading=false;dl.disabled=false;}};
 del.textContent='下架並刪除伺服器影片';del.onclick=async()=>{if(!confirm(`刪除「${v.title}」？其他裝置離線副本須待連線同步才會移除。`))return;try{await api('/api/admin/videos/'+v.id,{method:'DELETE'});await sync();await adminList();adminSay('影片已刪除');}catch(err){adminSay(err.message);}};row.append(h,p,dl,del);$('adminList').append(row);}
 const s=await navigator.storage?.estimate?.();$('storage').textContent=s?`本網站約使用 ${(s.usage/1048576).toFixed(0)} MB；瀏覽器配額約 ${(s.quota/1048576).toFixed(0)} MB（不是可保證的磁碟空間）。`:'';
}
$('upload').onsubmit=e=>{e.preventDefault();if(uploading)return;const file=$('file').files[0];if(!file)return;uploading=true;$('uploadButton').disabled=true;$('progress').hidden=false;
 const xhr=new XMLHttpRequest();xhr.open('POST','/api/admin/upload');xhr.timeout=14*60*1000;xhr.setRequestHeader('Content-Type','video/mp4');xhr.setRequestHeader('X-CSRF-Token',csrf);xhr.setRequestHeader('X-Title',encodeURIComponent($('title').value));xhr.setRequestHeader('X-Rights',encodeURIComponent($('rights').value));xhr.upload.onprogress=e=>{if(e.lengthComputable)$('progress').value=e.loaded/e.total*100;};
 xhr.onload=async()=>{try{if(xhr.status!==201)throw Error(JSON.parse(xhr.responseText).error||'上傳失敗');$('upload').reset();adminSay('上傳成功');await sync();await adminList();}catch(err){adminSay(err.message);}finally{done();}};const done=()=>{uploading=false;$('uploadButton').disabled=false;$('progress').hidden=true;};xhr.onerror=xhr.ontimeout=()=>{adminSay('上傳中斷，請檢查網路並重試');done();};xhr.send(file);
};
window.addEventListener('online',()=>sync());window.addEventListener('offline',()=>say(cloudMode?'目前離線；請連上網路後觀看雲端影片。':'離線模式 · 請選擇已下載影片'));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!$('player').open&&!$('admin').open)sync(true);});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;$('install').hidden=false;});$('install').onclick=async()=>{await installEvent?.prompt();$('install').hidden=true;};
async function cloudThumbnail(v){
 const key=v.id+':'+v.generation;
 if(cloudPosters.has(key))return cloudPosters.get(key).clone();
 if(!v.posterPath||!firebaseClient?.user)return null;
 const epoch=authEpoch;let response;
 try{const blob=await firebaseClient.poster(v.posterPath);response=new Response(blob,{headers:{'Content-Type':blob.type}});}
 catch(error){console.warn('KidsTube SDK poster: '+(error.code||error.name));say(error.code==='kidstube/poster-too-large'?'封面圖片太大，請壓縮至 2 MB 以下。':'影片清單已同步，部分封面讀取失敗。');return null;}
 if(!response.ok)return null;
 if(Number(response.headers.get('Content-Length'))>2*1024*1024){await response.body?.cancel();return null;}
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2*1024*1024){await reader.cancel();return null;}chunks.push(value);}}finally{reader.releaseLock();}
 if(epoch!==authEpoch)return null;
 const type=response.headers.get('Content-Type')||'image/jpeg';if(!type.startsWith('image/'))return null;
 const result=new Response(new Blob(chunks,{type}),{headers:{'Content-Type':type,...(v.durationSeconds?{'X-Duration':String(v.durationSeconds)}:{})}});cloudPosters.set(key,result);return result.clone();
}
function updateCloudManagement(){
 if(!cloudMode)return;
 const user=firebaseClient?.user;$('login').hidden=!!user;$('management').hidden=!user;
 if(user){$('cloudAccount').textContent='已登入：'+(user.email||user.uid);$('cloudUid').textContent='UID：'+user.uid;
  const paths=firebaseClient.inventory;$('cloudPaths').textContent=paths.length?paths.join('\n'):'尚未取得路徑；請先檢查 UID 白名單與列舉規則。';
 }
}
async function cloudStateChanged(user){
 const epoch=++authEpoch;pendingSync=false;cloudCatalogError='';cloudCatalogLoading=false;stop();if($('player').open)$('player').close();videos=[];downloaded.clear();cloudPosters.clear();currentVideo=null;render();updateCloudManagement();
 if(user){if(syncing)await syncing;if(epoch===authEpoch)await sync(true);}else{say('請家長登入這台裝置，之後會盡量保持登入。');adminSay('請使用家長建立的授權帳號。');}
}
if(cloudMode){
 for(const id of ['downloads','offline']){$(id).disabled=true;$(id).title='本次雲端版本僅支援線上播放，離線下載尚未啟用';}
 $('emailLabel').hidden=false;$('email').required=true;$('passwordLabel').firstChild.textContent='帳號密碼';$('adminDescription').textContent='使用家長建立的授權帳號登入；影片由 Firebase 控制台管理。關閉視窗不會登出。';$('login').querySelector('button').textContent='登入這台裝置';
 $('upload').hidden=true;$('progress').hidden=true;$('localManagement').hidden=true;$('cloudManagement').hidden=false;
 $('cloudRefresh').onclick=()=>sync(true);
 navigator.serviceWorker?.addEventListener('message',async event=>{
  if(!event.source||event.source.scriptURL!==new URL('./sw.js',location.href).href)return;
  if(event.data?.type==='KIDSTUBE_AUTH_TOKEN'){
   const port=event.ports?.[0];if(!port)return;
   try{port.postMessage({token:await firebaseClient?.token(!!event.data.force)});}catch{port.postMessage({error:'auth-required'});}finally{port.close();}
  }
  if(event.data?.type==='KIDSTUBE_MEDIA_ERROR'){
   if(event.data.reason)console.warn('KidsTube '+event.data.kind+' request: '+event.data.reason);
   if(event.data.kind==='poster'){say('封面暫時無法載入；影片清單已同步，請稍後再試。');return;}
   const messages={401:'登入已失效，請家長重新登入。',403:'這個帳號沒有讀取權限，請家長檢查 UID 白名單。',404:'這部影片已下架，請關閉播放器後更新片單。',503:'網路暫時中斷，請稍後再試。'};
   const message=messages[event.data.status]||'目前無法讀取影片，請稍後再試。';say(message);if($('player').open)$('playStatus').textContent=message;
  }
 });
 // 只在孩子已點選並載入影片後擷取現有畫面；不另行請求 MP4。
 $('video').addEventListener('loadeddata',()=>{const item=currentVideo,epoch=authEpoch;if(!item||!cloudMode)return;try{
  const el=$('video'),canvas=document.createElement('canvas');if(!el.videoWidth)return;canvas.width=480;canvas.height=Math.round(480*el.videoHeight/el.videoWidth);canvas.getContext('2d').drawImage(el,0,0,canvas.width,canvas.height);
  canvas.toBlob(blob=>{if(blob&&epoch===authEpoch)cloudPosters.set(item.id+':'+item.generation,new Response(blob,{headers:{'Content-Type':'image/jpeg','X-Duration':String(Math.floor(el.duration)||0)}}));},'image/jpeg',.8);
 }catch{} });
}
async function boot(){
 render();
 try{if(!('serviceWorker'in navigator))throw Error('不支援');await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;}
 catch{say('無法啟用播放服務，請使用 HTTPS 或 localhost 的一般瀏覽模式。');return;}
 if(!cloudMode){await sync(true);return;}
 try{const module=await import('./firebase-client.js');cloudErrorText=module.friendlyError;firebaseClient=await module.createFirebaseClient(globalThis.KIDSTUBE_SETTINGS,user=>{if(firebaseReady)cloudStateChanged(user);});await firebaseClient.ready;firebaseReady=true;await cloudStateChanged(firebaseClient.user);}
 catch(error){const message=cloudErrorText(error);say(message);adminSay(message);render();}
}
boot();
