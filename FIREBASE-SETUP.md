# KidsTube 本機 Firebase 串接

這是既有 KidsTube 的來源升級，並未重做 UI。未上傳 GitHub、未部署 Netlify，未刪除或搬移本機／雲端 MP4。

## 已確認的連線資料

- 專案：enlightenment-2。
- Bucket：enlightenment-2.firebasestorage.app；us-east1；Blaze。
- 家長提供的影片位置：`gs://enlightenment-2.firebasestorage.app/video`，單數 `video/`。
- 家長提供的授權 UID：`Lb376emYWyR8IHSt80OkoCr7bUh2`。
- Firebase Web App 設定已填入 `public/firebase-settings.js`。此設定不是私鑰，沒有存入密碼或管理員金鑰。
- 電子郵件／密碼登入已由家長在控制台啟用並建立帳號。實際登入與完整 Storage 讀取仍需家長操作後驗證。

## 本機執行

在本專案目錄執行：

```powershell
node server.mjs
```

開啟 `http://localhost:3000/`，點右上「家」→ 家長專區，以你自行建立的 Firebase Email／密碼登入。不需要設定本機管理密碼，不要把密碼貼進程式或對話。不要以 file:// 直接開 HTML。若 3000 已被之前預覽占用，可沿用正在執行的預覽，或先結束該預覽程序。

程式只綁定電腦的 127.0.0.1；平板的 localhost 指向平板自己。此階段僅驗證電腦瀏覽器，平板安裝與播放必須在之後的 HTTPS 部署再做實機驗收。

第一次升級時：先開啟一次頁面取得新版 Service Worker，再關閉所有 KidsTube 視窗後重新開啟。新版本不會在播放途中強制接管。Manifest、名稱、圖示、standalone 模式及原有首頁版面保留。瀏覽器網址列不會因一般網頁瀏覽而自動消失；要先安裝到主畫面。

## 家長需要操作的控制台設定

1. Firebase → Authentication → 使用者：確認上面的 UID 屬於剛建立、要供家人使用的帳號。App 沒有提供註冊、匿名登入或密碼硬編碼；知道公開 API Key 的人即使自行建立其他帳號，仍不在 Storage UID 白名單內。
2. Firebase → Storage → 規則：將本專案 `storage.rules` 的完整內容貼上並發布。它只允許此 UID 列出目錄，並讀取 `video/` 下的 MP4 和 JPG／PNG／WebP 封面；所有用戶端上傳、修改、刪除皆拒絕。規則授權不能由前端白名單代替。
3. 若登入遇到網域相關錯誤，在 Authentication → 設定 → 已授權網域加入 `localhost`。新專案不一定預先包含 localhost。
4. 若片單可見但串流或封面遇到跨來源錯誤，需設定 bucket CORS。以你自己的 Google Cloud Shell 或已登入的 Google Cloud CLI 執行：

```sh
gcloud storage buckets update gs://enlightenment-2.firebasestorage.app --cors-file=cors.local.json
```

先將本專案的 `cors.local.json` 放到該終端機可讀取的位置。此檔僅允許本機 localhost／127.0.0.1 的 GET、HEAD 和分段讀取必要標頭，沒有使用 `*`。CORS 不是使用者授權，不能取代 Security Rules。此步尚未代為執行。

## 串接與流量方式

Firebase 官方 Web SDK 13.0.0（固定版本，官方 gstatic CDN）只載入 App、Auth、Storage。Auth 使用 browserLocalPersistence 保存登入狀態；正常情況不需每次輸入密碼，清除網站資料、隱私模式、停用帳號或平台儲存政策仍可能要求重新登入。關閉管理視窗保留登入；只有按「登出並上鎖」才登出。

每次啟動登入完成後，SDK 先 list 真實根目錄，確認存在的 prefixes，再只掃描已確認的 video/ 子樹，分頁取得 MP4 的 metadata。沒有固定 HTML 片單；沒有定時輪詢、沒有使用舊本機片單當成雲端結果。恢復前景且未播放／管理時、恢復網路、或手動更新時也會同步。同期請求合併，播放中要求同步會延後到關閉播放器；Fisher–Yates 洗牌只變更記憶體中的顯示順序。

點選影片後，播放器讀取同源的 `/_firebase/media/...` 虛擬路徑。Service Worker 向該視窗索取當前 Firebase ID Token，對固定 bucket 的官方下載端點帶 Authorization 及 Range 請求，再直接轉送 Response body。沒有先把影片讀成完整 Blob，沒有用 getDownloadURL，Token 不放在 URL，也不寫入 Cache Storage。每次新請求仍由 Storage Security Rules 授權。401 最多刷新 Token 重試一次；沒有高頻重試。

家長撤銷 UID 後，後續雲端請求會被拒絕，但已傳到裝置的播放緩衝無法遠端收回。授權帳號持有者仍能儲存自己有權讀取的影片，這不是 DRM。Firebase 控制台原本產生或曾分享的 download Token URL 是另一種可分享的存取憑證；本 App 不使用它，但現有 Token 仍可能有效，家長需在控制台撤銷不再使用的下載 Token。勿把它們誤認為受 UID 規則完全保護的私人網址。

舊本機 API 在 Firebase 模式回 403，原 data/ 及本機快取保留但不在新版 UI 使用。既有離線按鈕保留外觀、設為停用並附提示；本次只支援線上影片，不會預先或自動下載 MP4。純 App 殼可離線開啟並顯示連線提示。原 CSS、圖示、搜尋、收藏、最新上傳、推薦與底部轉圈保留。

## 封面與影片中繼資料

避免為了首頁封面就讀取所有 MP4：可以在影片旁加同檔名 JPG，例如 `video/兒歌.mp4` 搭配 `video/兒歌.jpg`。首頁只在卡片接近畫面時讀取小封面（單張最多 2 MiB）。若沒封面，卡片顯示原有播放圖示；孩子點選播放後，可從已載入畫面擷取本次工作階段的封面，不額外載入另一部影片。

每個 Storage MP4 可選擇設定 custom metadata：

| 欄位 | 用途 |
| --- | --- |
| title | 顯示名稱，未填就從檔名產生 |
| category | 顯示於卡片副標題 |
| posterPath | 封面完整物件路徑，須在 video/ 下且實際存在 |
| durationSeconds | 封面時間標籤，未填不會為探測時長而讀取 MP4 |

設定 custom metadata 可使用 Storage 支援的工具／CLI，不需要新增資料庫或複雜後台。影片主清單仍以 Storage 真實存在的 MP4 為準，metadata 不是人工維護的影片索引。

## 未來新增影片的標準流程

1. 準備 H.264／AAC MP4，建議啟用 Fast Start。
2. 登入 Firebase 控制台 → Storage → 檔案 → 進入 `video`。
3. 上傳 MP4，可選擇一起上傳同名 JPG 封面。
4. 孩子下次開啟 App，取得最新片單並重新排列；也可按「更新影片」。不用改 HTML、打包或部署。
5. 下架用 Firebase 控制台刪除該 MP4，片單下次同步自動移除。不需要從 App 給用戶端寫入權限。

新增在 video/ 內的子資料夾也支援；新增至其他頂層資料夾，需先更新明確的來源範圍與 Storage 規則，不會擅自讀取其他資料。

## 費用

us-east1 標準儲存符合官方 Always Free 區域條件：5 GB-month 儲存、每月 5,000 次 A 類／50,000 次 B 類操作，以及符合目的地條件的每月 100 GB 對外傳輸免費額度。與同帳務適用資源合併計算；不是每個 bucket 獨享一份。Blaze 仍需付款方式，超額依 Google Cloud Storage 計費；預算警示不是硬性停止扣款。本專案不啟用額外 Functions、Firestore、Analytics 或其他計費服務。列表與 metadata 會產生少量操作，主要流量來自實際影片播放；反覆線上播放仍可能重新傳輸影片。

官方資料：https://cloud.google.com/storage/pricing 、https://firebase.google.com/docs/storage/web/list-files 、https://firebase.google.com/docs/auth/web/auth-state-persistence 。

## 本次驗證範圍及待完成項目

已實測：本機伺服器可執行、瀏覽器 Firebase 初始化並呈現已登出登入表單；9 組自動測試通過，包括來源探索、分頁、metadata、洗牌、串流分段轉送及未登入拒絕、本機舊 API 隔離，另保留原版回歸測試。自動串流測試使用模擬 Firebase 回應，不代表真實雲端 Rules 已通過驗收。

仍需家長操作後實測：發布 storage.rules、本人於本機表單登入、SDK 確認 video/ 真實 MP4 清單、檢查 CORS、真實雲端影片播放與拖曳、未授權帳號確實被雲端拒絕、上傳新 MP4 後重新開啟可見。實際 iPad／Android 安裝與線上播放也未驗證。未登入、網路失敗及設定失敗會有文字提示，不會顯示空白頁。

## 未來 GitHub／Netlify 前的必要步驟

- 確認上述真實雲端驗收全部完成，再將 public/ 靜態內容作為部署輸出；不要部署原 Node 硬碟後端或 data/ 影片。
- 設定正式主機 CSP，允許本機伺服器列出的官方 SDK 與 Firebase 端點；目前沒有代為建立 Netlify 設定。
- 將正式 HTTPS 網域加入 Firebase 需要的授權網域／CORS；不要以公開 Storage 規則解決跨來源問題。
- 確認 .gitignore 排除 data/、帳密、服務帳戶、暫存與備份。Web App 公開 config 可以入版控，管理員憑證不可以。
- 檢查已分享的 Storage download Token，發布前完成家庭帳號權限測試與費用警示。
- 兩種平板從 HTTPS 安裝到主畫面，重新驗證 standalone、登入保留、播放和同步。

原始必要程式備份位於此工作區的 work/firebase-upgrade-backup/，未複製／移動 MP4。本機八部原片仍在 data/。
