import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('Pages 子路徑：manifest identity、啟動、scope 與 PNG 實際尺寸',async()=>{
 const base=new URL('https://missan-cynthia.github.io/Cynthia-Video/public/');
 const manifest=JSON.parse(await readFile(new URL('./public/manifest.webmanifest',import.meta.url)));
 for(const key of ['id','scope','start_url'])assert.equal(new URL(manifest[key],base).href,base.href);
 assert.equal(manifest.display,'standalone');
 for(const size of [192,512]){
  const icon=manifest.icons.find(i=>i.sizes===`${size}x${size}`);assert.ok(icon);
  const bytes=await readFile(new URL('./public/'+icon.src,import.meta.url));
  assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);
 }
 assert.match(await readFile(new URL('./index.html',import.meta.url),'utf8'),/href="\.\/public\/manifest.webmanifest"/);
});
test('離線啟動別名、版本查詢與更新只清除 shell，保留影片及其他資料',async()=>{
 const handlers={},base='/Cynthia-Video/public/',deleted=[],matched=[];
 const context={URL,Response,importScripts(){},self:{location:{href:'https://kids.test'+base+'sw.js',origin:'https://kids.test'},clients:{claim:async()=>{}},addEventListener:(key,fn)=>handlers[key]=fn},caches:{keys:async()=>['kt-shell-firebase-v15','kt-shell-firebase-v16','kt-media-v1','kt-thumbs-v1','other'],delete:async key=>deleted.push(key),open:async()=>({match:async key=>{matched.push(key);return new Response('cached shell');}})},fetch:async()=>{throw Error('offline');}};
 vm.runInNewContext(await readFile(new URL('./public/sw.js',import.meta.url),'utf8'),context);
 for(const path of ['','?version=15','index.html','index.html?source=home','app.js?v=15']){
  let response;handlers.fetch({request:{url:'https://kids.test'+base+path,method:'GET'},respondWith:value=>response=value});
  assert.equal(await (await response).text(),'cached shell');
 }
 assert.deepEqual(matched,[base,base,base,base,base+'app.js']);
 let activation;handlers.activate({waitUntil:value=>activation=value});await activation;
 assert.deepEqual(deleted,['kt-shell-firebase-v15']);
});
