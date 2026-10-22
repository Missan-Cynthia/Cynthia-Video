import './firebase-shared.js';
import {scanStorageTree,catalogFromPaths} from './firebase-catalog.js';
const core = globalThis.KidsTubeCloud;
const SDK = 'https://www.gstatic.com/firebasejs/13.0.0/';
export function friendlyError(error) {
  const code = error?.code || '';
  if (code === 'kidstube/config') return '尚未填入 Firebase Web App 設定，請家長查看 FIREBASE-SETUP.md。';
  if (code === 'storage/unauthorized') return error.kidstubeStage==='metadata' ? '已找到雲端影片，但讀取影片資料被規則擋住；請家長更新 Storage 規則。' : '無法讀取雲端片單，請家長確認 UID 白名單及已發布的 Storage 規則。';
  if (code === 'storage/object-not-found') return '這部影片已移除，請更新影片清單。';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(code)) return '登入資料不正確，請家長重新輸入。';
  if (code === 'auth/user-disabled') return '這個帳號已停用，請聯絡家長。';
  if (code === 'auth/too-many-requests') return '嘗試次數過多，請稍後再登入。';
  if (code === 'auth/operation-not-allowed') return '請先在 Firebase Authentication 啟用電子郵件／密碼登入。';
  if (code === 'auth/unauthorized-domain') return '請在 Firebase Authentication 授權網域加入 localhost。';
  if (code === 'auth/no-current-user') return '請家長先登入這台裝置。';
  if (code === 'kidstube/limit') return '檔案數量超過此次安全掃描上限，請家長確認儲存空間內容。';
  if (code === 'storage/retry-limit-exceeded' || code === 'auth/network-request-failed' || error instanceof TypeError) return '目前連不上雲端，請檢查網路後再試。';
  return '無法載入影片，請確認網路、登入狀態及 Firebase 設定後再試。';
}
export async function createFirebaseClient(settings, onState) {
  const config = settings?.firebaseConfig || {};
  if (!config.apiKey || !config.appId || !config.authDomain || config.projectId !== 'enlightenment-2' || config.storageBucket !== core.bucket) {
    throw Object.assign(Error('Missing Firebase Web App config'), { code: 'kidstube/config' });
  }
  // 官方模組只載入 App、Auth、Storage；不啟用 Analytics、Firestore 或其他計費服務。
  const [appSDK, authSDK, storageSDK] = await Promise.all([
    import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-storage.js')
  ]);
  const app = appSDK.initializeApp(config);
  const auth = authSDK.getAuth(app), storage = storageSDK.getStorage(app, 'gs://' + core.bucket);
  storage.maxOperationRetryTime = 15000;
  await authSDK.setPersistence(auth, authSDK.browserLocalPersistence);
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const unsubscribe = authSDK.onAuthStateChanged(auth, user => { resolveReady(); onState(user); });
  let inventory = [], scanCount = 0;
  async function token(force = false) {
    await ready;
    if (!auth.currentUser) throw Object.assign(Error('not signed in'), { code: 'auth/no-current-user' });
    return auth.currentUser.getIdToken(force);
  }
  async function discover() {
    await token();
    inventory = await scanStorageTree(async(folder,pageToken)=>{
      const page=await storageSDK.list(storageSDK.ref(storage,folder),{maxResults:200,...(pageToken?{pageToken}:{})});
      return {items:page.items.map(item=>item.fullPath),prefixes:page.prefixes.map(prefix=>prefix.fullPath),nextPageToken:page.nextPageToken};
    },{prefixes:settings.videoPrefixes||null});scanCount++;
    return [...inventory];
  }
  async function catalog() {
    return catalogFromPaths(await discover(),path=>storageSDK.getMetadata(storageSDK.ref(storage,path)));
  }
  return {
    ready, token, catalog, discover,
    // 封面是小檔案，交由官方 SDK 帶登入憑證讀取，避免和影片串流混用。
    async poster(path){
      await token();
      if(!core.isPoster(path))throw Error('不支援的封面路徑');
      const reference=storageSDK.ref(storage,path),metadata=await storageSDK.getMetadata(reference);
      if(Number(metadata.size)>2*1024*1024)throw Object.assign(Error('封面超過 2 MiB'),{code:'kidstube/poster-too-large'});
      const blob=await storageSDK.getBlob(reference,2*1024*1024);
      const type=metadata.contentType||blob.type||(/\.png$/i.test(path)?'image/png':/\.webp$/i.test(path)?'image/webp':'image/jpeg');
      return blob.slice(0,blob.size,type);
    },
    get user() { return auth.currentUser; }, get inventory() { return [...inventory]; }, get scanCount() { return scanCount; },
    login: (email, password) => authSDK.signInWithEmailAndPassword(auth, email.trim(), password),
    logout: () => authSDK.signOut(auth), dispose: unsubscribe
  };
}
