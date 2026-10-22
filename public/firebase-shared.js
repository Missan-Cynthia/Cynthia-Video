/* 無網路副作用的共用規則：供瀏覽器、Service Worker 與測試使用。 */
(() => {
  const basePath = globalThis.location ? new URL('./', globalThis.location.href).pathname : '/';
  const bucket = 'enlightenment-2.firebasestorage.app';
  const validPath = value => typeof value === 'string' && value.length > 0 && value.length < 1024 &&
    !value.startsWith('/') && !value.endsWith('/') && !value.includes('//') &&
    !value.split('/').some(p => p === '.' || p === '..') && !/[\x00-\x1f\\]/.test(value);
  const isVideo = path => validPath(path) && /\.mp4$/i.test(path);
  const isPoster = path => validPath(path) && /\.(jpg|jpeg|png|webp)$/i.test(path);
  function mediaURL(path, generation = '') {
    if (!isVideo(path) && !isPoster(path)) throw Error('不支援的影片或封面路徑');
    return basePath + '_firebase/media/' + encodeURIComponent(path) + (generation ? '?v=' + encodeURIComponent(generation) : '');
  }
  function parseMediaPath(url) {
    const prefix = basePath + '_firebase/media/';
    if (!url.pathname.startsWith(prefix)) return null;
    let path; try { path = decodeURIComponent(url.pathname.slice(prefix.length)); } catch { return null; }
    return isVideo(path) || isPoster(path) ? path : null;
  }
  function fallbackTitle(path) {
    return path.split('/').pop().replace(/(?:\.pwa)?\.mp4$/i, '').replace(/\s*\[[A-Za-z0-9_-]{11}\]$/, '').trim();
  }
  function itemFromMetadata(metadata, knownPaths) {
    const path = metadata.fullPath;
    if (!isVideo(path)) throw Error('不是 MP4');
    const custom = metadata.customMetadata || {};
    const posterPath = custom.posterPath || path.replace(/\.mp4$/i, '.jpg');
    return {
      id: 'firebase:' + path, path, title: String(custom.title || fallbackTitle(path)).slice(0, 300),
      category: String(custom.category || '').slice(0, 80),
      size: Number(metadata.size) || 0, createdAt: metadata.timeCreated || '',
      generation: String(metadata.generation || ''),
      posterPath: isPoster(posterPath) && knownPaths.has(posterPath) ? posterPath : null,
      durationSeconds: Number(custom.durationSeconds) > 0 ? Number(custom.durationSeconds) : null
    };
  }
  function shuffled(items, random = Math.random) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
    return result;
  }
  globalThis.KidsTubeCloud = Object.freeze({ bucket, validPath, isVideo, isPoster, mediaURL, parseMediaPath, fallbackTitle, itemFromMetadata, shuffled });
})();
