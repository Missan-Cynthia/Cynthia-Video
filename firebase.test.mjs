import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';import {MessageChannel} from 'node:worker_threads';
import './public/firebase-shared.js';import {scanStorageTree,catalogFromPaths} from './public/firebase-catalog.js';import {startFirebaseDev} from './firebase-dev.mjs';
import {generateRules} from './tools/generate-storage-rules.mjs';
const core=globalThis.KidsTubeCloud;
test('Rules 型別回歸：遞迴 wildcard 是 Path，不得呼叫字串 matches()',async()=>{
 for(const rules of [await readFile(new URL('./storage.rules',import.meta.url),'utf8'),generateRules({uids:['test-uid'],prefixes:['video']})]){
  const pathVariables=[...rules.matchAll(/\{(\w+)=\*\*\}/g)].map(m=>m[1]);
  for(const variable of pathVariables)assert.doesNotMatch(rules,new RegExp('\\b'+variable+'\\.matches\\s*\\('));
  assert.match(rules,/resource\.name\.matches/);
 }
});
test('SDK 目錄探索：根目錄、單數 video、分頁與其他資料夾隔離',async()=>{
 const calls=[];const result=await scanStorageTree(async(folder,token)=>{calls.push([folder,token]);if(folder==='')return {items:['root.mp4'],prefixes:['video','private'],nextPageToken:null};if(folder==='video'&&!token)return {items:['video/一.mp4'],prefixes:['video/child'],nextPageToken:'next'};if(folder==='video')return {items:['video/二.MP4'],prefixes:[],nextPageToken:null};if(folder==='video/child')return {items:['video/child/三.mp4'],prefixes:[],nextPageToken:null};throw Error('不應讀取其他資料夾');},{prefixes:['video']});
 assert.deepEqual(result,['video/child/三.mp4','video/一.mp4','video/二.MP4'].sort());assert.equal(calls.length,4);assert.equal(calls.some(([folder])=>folder==='private'),false);
 await assert.rejects(scanStorageTree(async()=>({items:[],prefixes:['loop'],nextPageToken:'again'}),{maxPages:2}),{code:'kidstube/limit'});
});
test('片單只讀 metadata；新檔自動加入、刪除競態、標題與封面保留',async()=>{
 const metadataCalls=[];const files=['video/兒歌.pwa.mp4','video/新片.mp4','video/已刪.mp4','video/兒歌.pwa.jpg','video/note.txt'];
 const items=await catalogFromPaths(files,async path=>{metadataCalls.push(path);if(path.includes('已刪'))throw Object.assign(Error('gone'),{code:'storage/object-not-found'});return {fullPath:path,size:123,generation:'5',customMetadata:path.includes('兒歌')?{title:'我的兒歌',category:'唱跳'}:{}};});
 assert.equal(metadataCalls.length,3);assert.equal(items.length,2);assert.equal(items.find(v=>v.title==='我的兒歌').posterPath,'video/兒歌.pwa.jpg');assert.ok(items.some(v=>v.title==='新片'));
 await assert.rejects(catalogFromPaths(['video/a.mp4'],async()=>{throw Object.assign(Error('denied'),{code:'storage/unauthorized'});}),{code:'storage/unauthorized'});
});
test('虛擬影片路徑支援中文與 #，拒絕 traversal，洗牌不改原片單',()=>{
 const path='video/巧虎 #唱跳.mp4';assert.equal(core.parseMediaPath(new URL(core.mediaURL(path,'1'),'https://kids.test')),path);
 for(const p of ['../secret.mp4','video/../secret.mp4','video//a.mp4','/video/a.mp4','video/file.json'])assert.throws(()=>core.mediaURL(p));
 const original=['a','b','c'];assert.deepEqual(core.shuffled(original,()=>0),['b','c','a']);assert.deepEqual(original,['a','b','c']);
});
async function makeStream({signedIn=true,clientPresent=true,upstreamStatus=206,transportError=null,objectPath='video/測試 #.mp4'}={}){
 const requests=[],messages=[];const client={url:'https://kids.test/',postMessage(message,ports){messages.push(message);if(ports){ports[0].postMessage(signedIn?{token:'test-id-token'}:{error:'not-signed-in'});ports[0].close();}}};
 const context={MessageChannel,Response,Headers,URL,setTimeout,clearTimeout,KidsTubeCloud:core,self:{location:{origin:'https://kids.test'},clients:{get:async()=>clientPresent?client:null}},fetch:async(url,options)=>{requests.push({url,options});if(transportError)throw transportError;return new Response('234',{status:upstreamStatus,headers:{'Content-Type':'video/mp4','Content-Range':'bytes 2-4/10','Content-Length':'3'}});}};
 vm.runInNewContext(await readFile(new URL('./public/firebase-stream.js',import.meta.url),'utf8'),context);
 const response=await context.KidsTubeStream.stream({clientId:'test-client',request:new Request('https://kids.test'+core.mediaURL(objectPath),{headers:{Range:'bytes=2-4'}})});
 return {response,requests,messages};
}
test('受保護串流：保留 Range、只往固定 bucket、憑證不放 URL、不快取影片',async()=>{
 const {response,requests}=await makeStream();assert.equal(response.status,206);assert.equal(await response.text(),'234');assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('Content-Range'),'bytes 2-4/10');
 assert.equal(requests.length,1);assert.match(requests[0].url,/enlightenment-2[.]firebasestorage[.]app/);assert.doesNotMatch(requests[0].url,/token=/);assert.equal(requests[0].options.headers.get('Authorization'),'Firebase test-id-token');assert.equal(requests[0].options.headers.get('Range'),'bytes=2-4');assert.equal(requests[0].options.cache,undefined);assert.equal(requests[0].options.headers.has('Cache-Control'),false);assert.equal(requests[0].options.headers.has('Pragma'),false);
});
test('受保護串流：未登入、不存在視窗、拒絕讀取及缺檔皆失敗關閉',async()=>{
 for(const options of [{signedIn:false},{clientPresent:false}]){const r=await makeStream(options);assert.equal(r.response.status,401);assert.equal(r.requests.length,0);}
 assert.equal((await makeStream({upstreamStatus:403})).response.status,403);assert.equal((await makeStream({upstreamStatus:404})).response.status,404);
});
test('取消封面讀取不誤報斷網，封面錯誤與影片錯誤分開',async()=>{
 const aborted=await makeStream({transportError:Object.assign(Error('cancelled'),{name:'AbortError'}),objectPath:'video/a.jpg'});
 assert.equal(aborted.response.status,499);assert.equal(aborted.messages.some(message=>message.type==='KIDSTUBE_MEDIA_ERROR'),false);
 const failed=await makeStream({transportError:TypeError('Failed to fetch'),objectPath:'video/a.jpg'});
 assert.equal(failed.response.status,503);const error=failed.messages.find(message=>message.type==='KIDSTUBE_MEDIA_ERROR');assert.equal(error.kind,'poster');assert.match(error.reason,/Failed to fetch/);
});
test('Firebase 本機伺服器不暴露原始 MP4、舊片單或本機管理 API',async()=>{
 const server=await startFirebaseDev({port:0});if(!server.listening)await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
 try{for(const p of ['/media/test.mp4','/api/catalog','/api/admin/videos','/data/catalog.json'])assert.equal((await fetch(base+p)).status,403);
 for(const p of ['/','/firebase-client.js','/firebase-settings.js','/firebase-shared.js','/firebase-catalog.js','/firebase-stream.js']){const r=await fetch(base+p);assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');}
 assert.equal((await fetch(base+'/_firebase/media/video%2Ffile.mp4')).status,503);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('GitHub Pages 子目錄：媒體路徑及 Worker 快取使用網站範圍',async()=>{
 const source=await readFile(new URL('./public/firebase-shared.js',import.meta.url),'utf8');
 const context={URL,location:{href:'https://kids.test/Cynthia-Video/public/'}};
 vm.runInNewContext(source,context);
 const cloud=context.KidsTubeCloud;
 const media=cloud.mediaURL('video/中文 #.mp4');
 assert.ok(media.startsWith('/Cynthia-Video/public/_firebase/media/'));
 assert.equal(cloud.parseMediaPath(new URL(media,'https://kids.test')),'video/中文 #.mp4');
 assert.equal(cloud.parseMediaPath(new URL('https://kids.test/_firebase/media/a.mp4')),null);
 const handlers={},cached=[];let streamed=false;
 const sw={URL,Response,importScripts:()=>{},self:{location:{href:'https://kids.test/Cynthia-Video/public/sw.js',origin:'https://kids.test'},addEventListener:(name,fn)=>handlers[name]=fn},caches:{open:async()=>({addAll:async assets=>cached.push(...assets)})},KidsTubeStream:{stream:()=>{streamed=true;return new Response('ok');}}};
 vm.runInNewContext(await readFile(new URL('./public/sw.js',import.meta.url),'utf8'),sw);
 await new Promise((resolve,reject)=>handlers.install({waitUntil:p=>p.then(resolve,reject)}));
 assert.ok(cached.length>5);assert.ok(cached.every(path=>path.startsWith('/Cynthia-Video/public/')));
 let response;handlers.fetch({request:{url:'https://kids.test'+media,method:'GET'},respondWith:r=>response=r});
 assert.equal(streamed,true);assert.equal(await response.text(),'ok');
});

test('雲端缺少封面時擷取影片畫面，保留登入範圍且重用記憶體縮圖',async()=>{
 const source=await readFile(new URL('./public/app.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('async function makeThumbnail('),source.indexOf('function pumpThumbs('));
 let created=0;const posters=new Map();
 const context={Response,URL,cloudMode:true,authEpoch:1,cloudPosters:posters,firebaseClient:{user:{uid:'test'},videoBlob:async(path,thumbnail)=>{assert.equal(thumbnail,true);return new Blob(['video']);}},navigator:{onLine:true,serviceWorker:{controller:{}}},cloudThumbnail:async v=>posters.get(v.id+':'+v.generation)?.clone()||null,media:()=>'/Cynthia-Video/public/_firebase/media/test.mp4',setTimeout,clearTimeout,document:{createElement(type){
  if(type==='canvas')return {getContext:()=>({drawImage(){}}),toBlob:callback=>callback(new Blob(['jpeg'],{type:'image/jpeg'}))};
  created++;return {duration:12,videoWidth:640,videoHeight:360,removeAttribute(){},load(){},set src(value){queueMicrotask(()=>this.onloadedmetadata());},set currentTime(value){queueMicrotask(()=>this.onseeked());}};
 }}};
 vm.runInNewContext(fn,context);const item={id:'firebase:test',generation:'1'};
 const result=await context.makeThumbnail(item);assert.equal(result.headers.get('Content-Type'),'image/jpeg');assert.equal(result.headers.get('X-Duration'),'12');
 assert.equal(await (await context.makeThumbnail(item)).text(),'jpeg');assert.equal(created,1);
 posters.clear();context.firebaseClient.user=null;assert.equal(await context.makeThumbnail(item),null);assert.equal(created,1);
});

test('串流 503 轉用 SDK Blob 播放，401/403 不繞過授權',async()=>{
 const source=await readFile(new URL('./public/app.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('async function playVideo('),source.indexOf('function stop('));
 for(const status of [503,403]){
  const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,{textContent:'',open:false,replaceChildren(){},showModal(){this.open=true;},play:async()=>{}});return elements.get(id);};
  let reads=0;const v={id:'test',path:'video/a.mp4',title:'test'};
  const context={cloudMode:true,navigator:{onLine:true,serviceWorker:{controller:{}}},firebaseClient:{user:{uid:'test'},videoBlob:async()=>{reads++;return new Blob(['video']);}},say(){},stop(){},media:()=>'/media',favorites:new Set(),videos:[v],currentVideo:null,authEpoch:1,fallbackPlaybackURL:null,URL,fetch:async()=>new Response('failure',{status}),$:el};
  vm.runInNewContext(fn,context);await context.playVideo(v);
  assert.equal(reads,status===503?1:0);
  if(status===503)URL.revokeObjectURL(context.fallbackPlaybackURL);else assert.match(el('playStatus').textContent,/HTTP 403/);
 }
});
