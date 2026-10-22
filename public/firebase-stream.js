/* 由 sw.js importScripts 載入。只在登入使用者點選影片或讀取小封面時執行。 */
(() => {
  const core = globalThis.KidsTubeCloud;
  const failure = (status, message) => new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  async function getToken(client, force = false) {
    if (!client) throw Error('沒有對應的 App 視窗');
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); reject(Error('登入驗證逾時')); }, 10000);
      channel.port1.onmessage = event => {
        clearTimeout(timer); channel.port1.close();
        const token = event.data?.token;
        if (typeof token === 'string' && token.length > 0) resolve(token); else reject(Error('需要登入'));
      };
      client.postMessage({ type: 'KIDSTUBE_AUTH_TOKEN', force }, [channel.port2]);
    });
  }
  function report(client, status, path, reason = '') { client?.postMessage({ type: 'KIDSTUBE_MEDIA_ERROR', status, kind: core.isPoster(path) ? 'poster' : 'video', reason }); }
  async function stream(event) {
    const url = new URL(event.request.url), path = core.parseMediaPath(url);
    if (!path) return failure(400, '影片路徑不正確');
    const client = event.clientId ? await self.clients.get(event.clientId) : null;
    if (!client || new URL(client.url).origin !== self.location.origin) return failure(401, '請從已登入的 KidsTube 開啟影片');
    let token;
    try { token = await getToken(client); } catch { report(client, 401, path); return failure(401, '請家長重新登入'); }
    const endpoint = 'https://firebasestorage.googleapis.com/v0/b/' + core.bucket + '/o/' + encodeURIComponent(path) + '?alt=media';
    async function request(value) {
      const headers = new Headers({ Authorization: 'Firebase ' + value });
      const range = event.request.headers.get('Range');
      if (range) headers.set('Range', range);
      // 不帶 Firebase download token、不緩衝整部影片、不寫入 Cache Storage。
      return fetch(endpoint, { headers, cache: 'no-store', credentials: 'omit', redirect: 'follow', signal: event.request.signal });
    }
    try {
      let upstream = await request(token);
      if (upstream.status === 401) { await upstream.body?.cancel(); upstream = await request(await getToken(client, true)); }
      if (![200, 206, 416].includes(upstream.status)) {
        await upstream.body?.cancel(); report(client, upstream.status, path);
        return failure(upstream.status, upstream.status === 404 ? '影片已下架，請更新片單' : '這個帳號無權讀取影片');
      }
      const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      for (const name of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag']) {
        const value = upstream.headers.get(name); if (value) headers.set(name, value);
      }
      return new Response(upstream.body, { status: upstream.status, headers });
    } catch (error) {
      if(error.name === 'AbortError' || event.request.signal?.aborted) return failure(499, '已取消載入');
      report(client, 503, path, error.name + ': ' + error.message);
      return failure(503, '雲端檔案讀取失敗，請檢查跨來源設定與連線');
    }
  }
  globalThis.KidsTubeStream = Object.freeze({ stream });
})();
