import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.dirname(fileURLToPath(import.meta.url));
const assets = ['diagnostics.html','diagnostics.js','app.js','style.css','sw.js','manifest.webmanifest','icon-192.png','icon-512.png','firebase-settings.js','firebase-shared.js','firebase-client.js','firebase-stream.js','firebase-catalog.js','update.html','update.js'];
export async function startFirebaseDev(options = {}) {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://www.gstatic.com; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://www.gstatic.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebasestorage.googleapis.com; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    let pathname;
    try { pathname = new URL(req.url, 'http://localhost').pathname; } catch { res.writeHead(400); return res.end(); }
    // Firebase 模式完全不暴露舊片單、硬碟 MP4 或本機管理 API。
    if (pathname.startsWith('/api/') || pathname.startsWith('/media/') || pathname.startsWith('/data/')) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' }); return res.end(JSON.stringify({ error: '本機影片 API 已關閉，請登入 Firebase 讀取影片。' }));
    }
    if (pathname.startsWith('/_firebase/media/')) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('串流服務尚未啟用，請關閉所有 KidsTube 視窗後重新開啟。');
    }
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    const name = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (name !== 'index.html' && !assets.includes(name)) { res.writeHead(404); return res.end('找不到頁面'); }
    try {
      const bytes = await readFile(path.join(root, 'public', name));
      const type = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json' }[path.extname(name)];
      res.writeHead(200, { 'Content-Type':type }); res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { res.writeHead(404); res.end('檔案不存在'); }
  });
  server.listen(options.port ?? Number(process.env.PORT || 3000), '127.0.0.1');
  return server;
}
