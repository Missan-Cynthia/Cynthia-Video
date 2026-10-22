import http from 'node:http';
import {randomBytes,randomUUID,scryptSync,timingSafeEqual} from 'node:crypto';
import {promises as fs,createReadStream,createWriteStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {startFirebaseDev} from './firebase-dev.mjs';
export function byteRange(header,size){
 if(!header)return null;const m=/^bytes=(\d*)-(\d*)$/.exec(header);if(!m||(!m[1]&&!m[2]))return false;
 let start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2]));let end=m[1]?(m[2]?Number(m[2]):size-1):size-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return false;
 return {start,end:Math.min(end,size-1)};
}
export async function start(){
if(process.env.KIDSTUBE_MODE !== 'local') return startFirebaseDev();
const root=path.dirname(fileURLToPath(import.meta.url)),data=path.resolve(process.env.DATA_DIR||path.join(root,'data'));
const origin=process.env.PUBLIC_ORIGIN||'http://localhost:3000',secure=origin.startsWith('https://');
const hash=process.env.ADMIN_PASSWORD_HASH||'';
if(!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash))throw Error('請先設定 ADMIN_PASSWORD_HASH，執行 npm run password 產生');
if(!secure&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))throw Error('遠端部署必須 HTTPS');
await fs.mkdir(path.join(data,'media'),{recursive:true});
const catalogFile=path.join(data,'catalog.json');let catalog;
try{catalog=JSON.parse(await fs.readFile(catalogFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;catalog=[];}
const sessions=new Map();let attempts=0,windowStart=Date.now(),busy=false;
const save=async()=>{await fs.writeFile(catalogFile+'.tmp',JSON.stringify(catalog,null,2));await fs.rename(catalogFile+'.tmp',catalogFile);};
const server=http.createServer(async(req,res)=>{
res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
res.setHeader('Cache-Control','no-store');
const json=(status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(obj));};
try{
const url=new URL(req.url,origin),p=url.pathname;
if(['POST','DELETE','PATCH'].includes(req.method)&&req.headers.origin!==origin)return json(403,{error:'來源不符'});
const sid=/\bkt_session=([a-f0-9]+)\b/.exec(req.headers.cookie||'')?.[1];const session=sessions.get(sid);
const authed=session&&session.expires>Date.now();
if(req.method==='POST'&&p==='/api/login'){
 if(Date.now()-windowStart>900000){attempts=0;windowStart=Date.now();}if(++attempts>10)return json(429,{error:'嘗試過多，請 15 分鐘後再試'});
 let body='';for await(const c of req){body+=c;if(body.length>2048)return json(413,{error:'資料過大'});}
 const password=JSON.parse(body).password;if(typeof password!=='string'||password.length>256)return json(400,{error:'密碼格式錯誤'});
 const [salt,expected]=hash.split(':');if(!timingSafeEqual(scryptSync(password,salt,64),Buffer.from(expected,'hex')))return json(401,{error:'密碼錯誤'});
 for(const [k,v] of sessions)if(v.expires<Date.now())sessions.delete(k);
 const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');sessions.set(token,{csrf,expires:Date.now()+900000});
 res.setHeader('Set-Cookie',`kt_session=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=900${secure?'; Secure':''}`);return json(200,{csrf});
}
if(p.startsWith('/api/admin')){
 if(!authed)return json(401,{error:'請家長重新登入'});
 if(req.method!=='GET'&&req.headers['x-csrf-token']!==session.csrf)return json(403,{error:'驗證失敗'});
 if(p==='/api/admin/logout'&&req.method==='POST'){sessions.delete(sid);res.setHeader('Set-Cookie','kt_session=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0');return json(200,{ok:true});}
 if(p==='/api/admin/videos'&&req.method==='GET')return json(200,catalog);
 if(busy)return json(409,{error:'另一個管理操作進行中，請稍後再試'});
 if(p==='/api/admin/upload'&&req.method==='POST'){
  const title=decodeURIComponent(req.headers['x-title']||'').trim(),rights=decodeURIComponent(req.headers['x-rights']||'').trim();
  if(!title||title.length>100||!rights||rights.length>500||req.headers['content-type']!=='video/mp4')return json(400,{error:'請提供標題、授權說明及 MP4'});
  busy=true;const id=randomUUID(),file=path.join(data,'media',id+'.mp4'),temp=file+'.part';let size=0,head=Buffer.alloc(0);
  try{
   const limit=Number(process.env.MAX_UPLOAD_BYTES||536870912);
   const check=new Transform({transform(chunk,enc,cb){size+=chunk.length;if(head.length<64)head=Buffer.concat([head,chunk]).subarray(0,64);cb(size>limit?Error('影片超過上傳上限'):null,chunk);}});
   await pipeline(req,check,createWriteStream(temp,{flags:'wx'}));
   if(head.length<12||head.toString('ascii',4,8)!=='ftyp')throw Error('不是支援的 MP4 容器');
   await fs.rename(temp,file);const item={id,title,rights,size,createdAt:new Date().toISOString()};catalog.push(item);
   try{await save();}catch(e){catalog.pop();await fs.rm(file,{force:true});throw e;}
   return json(201,item);
  }finally{busy=false;await fs.rm(temp,{force:true});}
 }
 const id=p.split('/').pop();if(req.method==='DELETE'&&p.startsWith('/api/admin/videos/')){
  const old=catalog;catalog=catalog.filter(v=>v.id!==id);if(old.length===catalog.length)return json(404,{error:'找不到影片'});busy=true;
  try{await save();}catch(e){catalog=old;throw e;}finally{busy=false;}
  await fs.rm(path.join(data,'media',id+'.mp4'),{force:true});return json(200,{ok:true});
 }
 return json(404,{error:'找不到操作'});
}
if(p==='/api/catalog'&&req.method==='GET')return json(200,catalog.map(({rights,...v})=>v));
if(/^\/media\/[a-f0-9-]+\.mp4$/.test(p)&&['GET','HEAD'].includes(req.method)){
 const id=path.basename(p,'.mp4');if(!catalog.some(v=>v.id===id))return json(404,{error:'影片已下架'});
 const file=path.join(data,'media',id+'.mp4'),stat=await fs.stat(file),range=byteRange(req.headers.range,stat.size);
 if(range===false){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});return res.end();}
 const start=range?.start||0,end=range?.end??stat.size-1;
 res.writeHead(range?206:200,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':end-start+1,...(range?{'Content-Range':`bytes ${start}-${end}/${stat.size}`}:{})});
 if(req.method==='HEAD')return res.end();const stream=createReadStream(file,{start,end});res.on('close',()=>stream.destroy());stream.on('error',()=>res.destroy());return stream.pipe(res);
}
if(!['GET','HEAD'].includes(req.method))return json(405,{error:'方法不支援'});
const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/sw.js':'sw.js','/manifest.webmanifest':'manifest.webmanifest','/icon-192.png':'icon-192.png','/icon-512.png':'icon-512.png'};
if(!files[p])return json(404,{error:'找不到頁面'});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.webmanifest':'application/manifest+json','.png':'image/png'};
const bytes=await fs.readFile(path.join(root,'public',files[p]));res.writeHead(200,{'Content-Type':types[path.extname(files[p])]});res.end(req.method==='HEAD'?undefined:bytes);
}catch(e){console.error(e.message);if(!res.headersSent)json(400,{error:'操作失敗，請檢查檔案、網路與伺服器紀錄'});else res.destroy();}
});
server.requestTimeout=15*60*1000;server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1');return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url))await start();

