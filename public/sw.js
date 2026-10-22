importScripts('./firebase-shared.js','./firebase-stream.js');
const BASE = new URL('./', self.location.href).pathname;
self.addEventListener('message',event=>{if(event.data?.type==='KIDSTUBE_ACTIVATE_UPDATE')event.waitUntil(self.skipWaiting());});
const SHELL='kt-shell-firebase-v14',ASSETS=['/','/app.js','/style.css','/manifest.webmanifest','/icon-192.png','/icon-512.png','/firebase-shared.js','/firebase-client.js','/firebase-stream.js','/firebase-catalog.js'].map(path => BASE + path.slice(1));
self.addEventListener('install',e=>{e.waitUntil(caches.open(SHELL).then(c=>c.addAll(ASSETS.map(url=>new Request(url,{cache:"reload"})))));});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('kt-shell-')&&k!==SHELL)await caches.delete(k);await self.clients.claim();})());});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.origin!==self.location.origin||e.request.method!=='GET')return;
 if(u.pathname.startsWith(BASE + '_firebase/media/')) { e.respondWith(KidsTubeStream.stream(e)); return; }
 // 設定永遠讀網路，API 與雲端媒體永遠不快取。舊本機快取保留在磁碟但 Firebase UI 不讀取。
 if(u.pathname===BASE + 'firebase-settings.js')return;
 if(u.pathname.startsWith(BASE + 'api/'))return;
 if(u.pathname.startsWith(BASE + 'media/')){e.respondWith(new Response('本次僅支援登入後的雲端影片',{status:403,headers:{'Cache-Control':'no-store'}}));return;}
 if(ASSETS.includes(u.pathname))e.respondWith(caches.open(SHELL).then(async c=>(await c.match(u.pathname))||fetch(e.request)));
});



