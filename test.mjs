import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {scryptSync} from 'node:crypto';import {start,byteRange} from './server.mjs';
import {readFile} from 'node:fs/promises';import vm from 'node:vm';
test('Firebase Service Worker 不透過舊快取繞過登入讀取影片',async()=>{
 const handlers={},content=new Blob(['0123456789'],{type:'video/mp4'});let exists=true;
 const context={importScripts:()=>{},self:{location:{origin:'https://kids.test',href:'https://kids.test/sw.js'},addEventListener:(type,fn)=>handlers[type]=fn},caches:{open:async()=>({match:async()=>exists?new Response(content):undefined})},URL,Response,fetch:async()=>{throw Error('offline');}};
 vm.runInNewContext(await readFile(new URL('./public/sw.js',import.meta.url),'utf8'),context);
 async function get(range){let response;handlers.fetch({request:{url:'https://kids.test/media/demo.mp4',method:'GET',headers:new Headers(range?{Range:range}:{})},respondWith:p=>response=p});return response;}
 assert.equal((await get()).status,403);assert.equal((await get('bytes=2-4')).status,403);assert.equal((await get('bytes=-3')).status,403);exists=false;assert.equal((await get()).status,403);
});
test('Range 包含 suffix、超界、複數及無效格式',()=>{assert.deepEqual(byteRange('bytes=2-8',6),{start:2,end:5});assert.deepEqual(byteRange('bytes=-2',6),{start:4,end:5});assert.deepEqual(byteRange('bytes=0-',6),{start:0,end:5});for(const v of ['bytes=-0','bytes=6-','bytes=4-2','bytes=0-1,3-4','invalid'])assert.equal(byteRange(v,6),false);});
test('真實 HTTP：管理驗證、CSRF、上傳、串流、下架與登出',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'kidstube-test-'));process.env.KIDSTUBE_MODE='local';process.env.DATA_DIR=dir;process.env.PORT='0';process.env.PUBLIC_ORIGIN='http://localhost:3000';const salt='a'.repeat(32);process.env.ADMIN_PASSWORD_HASH=salt+':'+scryptSync('test-password-123',salt,64).toString('hex');
 const server=await start();if(!server.listening)await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const request=(p,options={})=>fetch(base+p,options);const origin={Origin:'http://localhost:3000'};
 try{
 for(const asset of ['/','/app.js','/style.css','/sw.js','/manifest.webmanifest','/icon-192.png','/icon-512.png']){const r=await request(asset);assert.equal(r.status,200,asset);assert.ok((await r.arrayBuffer()).byteLength>0,asset);}
 assert.equal((await request('/api/admin/videos')).status,401);
 assert.equal((await request('/api/login',{method:'POST',body:'{}'})).status,403);
 const login=await request('/api/login',{method:'POST',headers:origin,body:JSON.stringify({password:'test-password-123'})});assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/HttpOnly/);const cookie=login.headers.get('set-cookie').split(';')[0],{csrf}=await login.json();
 const headers={...origin,Cookie:cookie,'X-CSRF-Token':csrf};
 assert.equal((await request('/api/admin/upload',{method:'POST',headers:{...origin,Cookie:cookie}})).status,403);
 const bytes=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom0000test-video')]);
 const upload=await request('/api/admin/upload',{method:'POST',headers:{...headers,'Content-Type':'video/mp4','X-Title':encodeURIComponent('小小星球'),'X-Rights':encodeURIComponent('本人自製')},body:bytes});assert.equal(upload.status,201);const video=await upload.json();
 const list=await (await request('/api/catalog')).json();assert.equal(list.length,1);assert.equal(list[0].rights,undefined);
 const range=await request('/media/'+video.id+'.mp4',{headers:{Range:'bytes=4-7'}});assert.equal(range.status,206);assert.equal(await range.text(),'ftyp');
 assert.equal((await request('/media/'+video.id+'.mp4',{headers:{Range:'bytes=99999-'}})).status,416);
 assert.equal((await request('/api/admin/videos/'+video.id,{method:'DELETE',headers})).status,200);assert.equal((await request('/media/'+video.id+'.mp4')).status,404);
 assert.equal((await request('/api/admin/logout',{method:'POST',headers})).status,200);assert.equal((await request('/api/admin/videos',{headers:{Cookie:cookie}})).status,401);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
