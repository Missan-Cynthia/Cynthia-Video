# Cynthia Video

線上使用：https://missan-cynthia.github.io/Cynthia-Video/

GitHub Pages 首頁會自動開啟 public/ 的 Firebase 影片介面。請由家長登入後讀取雲端片庫；此模式僅支援線上播放。若出現授權網域錯誤，請在 Firebase Authentication 設定加入 missan-cynthia.github.io；Storage CORS 的來源也須允許 https://missan-cynthia.github.io。

以下包含舊版 Node 本機模式文件；其中離線下載與本機上傳說明不適用於 Firebase 模式。

# KidsTube 小小放映室

> 目前預設已升級為 Firebase 線上模式。請先閱讀 **[Firebase 本機串接指南](FIREBASE-SETUP.md)**；下方原 Node 硬碟後端說明保留作為歷史參考，不能當作新版的必要設定。新版直接 `node server.mjs`，不需要 ADMIN_PASSWORD_HASH。

## 介面更新：YouTube 式平板版

白色介面、紅色播放標誌、頂部片名搜尋、左側導覽、影片縮圖網格；手機改為底部導覽。沒有 Shorts 或外部推薦。收藏存於本裝置；分類列提供全部、最新上傳與已下載，搜尋僅查找目前家長片庫。

首頁縮圖在卡片接近畫面時，從 MP4 約第 1 秒擷取並快取，同時最多處理兩部。載入／編碼失敗時顯示中性播放圖示；影片本身仍可點選播放。縮圖擷取會讀取部分影片資料，建議 faststart MP4。沒有附影片，因此初次啟動為空片庫，不顯示假影片或假觀看次數。

播放視窗提供片庫內推薦及收藏。片單底部持續顯示「影片加載中」與旋轉動畫，這是依需求固定的介面狀態，不會發出輪詢請求。沒有搜尋結果或空片庫時顯示對應提示，不顯示此載入圈。原有家長登入、下載與同步機制保留。

Service Worker 殼版本已更新為 kt-shell-v2。舊版已安裝裝置需連線開啟一次取得更新，再關閉所有 KidsTube 視窗重新開啟；下載的影片保留。

可自行部署的家庭 MP4 PWA，繁體中文介面；Node.js 22 以上（此專案以 Node 24 驗證），不需 npm 第三方套件。附 Android / iPad 安裝資訊、家長管理、上傳／下架、線上同步、首頁洗牌、離線下載與 Range 串流。未附任何影片或第三方授權內容。

## 本機啟動（Windows PowerShell）

1. 解壓縮，進入本資料夾，先產生密碼雜湊：

```powershell
node password.mjs
```

輸入至少 12 字元的強密碼，再按 Enter。此簡易終端機輸入可能顯示在畫面上，請在私密環境操作。最後輸出 `salt:hash`；不要使用範例密碼。

2. 在同一個 PowerShell 設定：

```powershell
$env:ADMIN_PASSWORD_HASH='貼上剛才產生的 salt:hash'
$env:PUBLIC_ORIGIN='http://localhost:3000'
node server.mjs
```

3. 瀏覽 `http://localhost:3000`，進入「家長專區」登入，填影片名稱、來源／授權說明，選 MP4 上傳。預設伺服器上傳限制 512 MiB；可透過 `MAX_UPLOAD_BYTES` 修改。單部離線下載上限 200 MiB，避免平板記憶體壓力。支援 MP4 容器基本檢查，並不驗證解碼能力；建議 H.264 視訊 + AAC 音訊、720p、faststart。

4. `node --test test.mjs` 執行 HTTP 與 Range 自動測試。`localhost` 可測 PWA；其他裝置使用區網的普通 HTTP IP 無法正常啟用 Service Worker。平板請用正式 HTTPS 網域測試。

## 部署：Linux VM + Docker Compose + Caddy HTTPS

此 Node 伺服器需要持久磁碟，不適合直接放到 GitHub Pages 或其他純靜態主機。

1. 準備 Linux 主機、Docker Engine / Compose，設定網域 A/AAAA 指向主機。開放 TCP 80、443；3000 不對外發布。
2. 複製專案，將 `.env.example` 複製成 `.env`。填寫 `DOMAIN=實際網域` 及 `ADMIN_PASSWORD_HASH=剛才產生的 salt:hash`。不要提交 `.env`。
3. 在專案資料夾執行：

```sh
docker compose up -d --build
docker compose logs --tail=100
```

4. 開啟 `https://你的網域`。Caddy 自動申請 TLS 憑證；PUBLIC_ORIGIN 必須等於瀏覽器網址的協定與網域，不能有結尾斜線。若出現「來源不符」，先檢查此設定。DNS / 憑證失敗請檢查 80、443 與網域解析。
5. 影片和 catalog.json 存在 `videos` volume，Caddy 憑證存於獨立 volume。**不要執行 `docker compose down -v`，會刪除資料。** 備份時先停止 app，再備份完整 videos volume；還原 catalog.json 與 media 必須同批還原。將 `.env` 另存於安全位置。可先停 app，使用 `docker compose cp app:/app/data ./backup-data` 複製到主機，再啟動；復原時 app 停止，複製回同目錄並確認 node 使用者具有讀寫權。
6. 更新：先備份，再 `docker compose up -d --build`。修改前端時提高 `public/sw.js` 的 SHELL 版本（例如 kt-shell-v2），保持 MEDIA 名稱不變以保留下載。新版預設等待所有舊視窗關閉後啟用，避免播放中途換版。

本機非 Docker 執行，資料預設存 `data/`；可用 `DATA_DIR` 指向持久磁碟。僅啟動單一 app 實例，JSON 片單及記憶體工作階段不支援多程序共同寫入。高併發或多人服務需改資料庫、共享 session 與物件儲存。

## 安裝與操作

- Android：使用支援 PWA 的 Chrome 開啟 HTTPS 網址；可用介面出現的安裝按鈕或瀏覽器選單「安裝應用程式／加入主畫面」。按鈕是否出現由瀏覽器決定。
- iPad：使用 Safari → 分享／更多 → 加入主畫面，若有「開啟為網頁 App」請開啟，再從主畫面圖示啟動。standalone 模式隱藏瀏覽器分頁；仍受系統手勢與多工控制。不是鎖定設備的 kiosk 模式；需要時由家長另外設定 iPad 引導使用模式。
- 家長上傳成功後，其他裝置會在啟動、回到前景、恢復網路或按「更新影片」時讀取片單。持續在前景不會定時輪詢；按更新即可。不在背景推送影片，不自動下載大檔案。
- 初次開啟與從背景回到首頁會 Fisher–Yates 洗牌；播放或管理時不打亂。隨機排序偶爾與上次相同屬正常。影片本身不因排序改變，也不虛構新影片標籤。
- 家長登入後按「下載供離線觀看」，等待下載完成。片單存在本機 localStorage，完整 MP4 存 Cache Storage；播放器透過 Service Worker 讀取本機檔案，支援拖曳進度。中斷下載不標記完成；目前沒有斷點續傳，下次須重新下載。
- 首次成功載入 App 殼、取得片單並完成至少一部下載後，才能離線冷啟動與播放。影片仍在雲端時，離線點選會提示尚未下載。
- 下架影片在伺服器立即不可讀；已連線裝置同步成功時移除本機副本。離線裝置無法收到撤銷通知，必須恢復連線同步。授權到期需要家長主動下架；授權欄位是紀錄，不會自動解析日期或判斷權利。

## iOS / iPadOS PWA 限制（2026-10-21 查核）

- 必須由使用者加入主畫面；不保證有 Android 同樣的安裝提示。安裝後應在該主畫面 App 內重新登入及下載，勿假設 Safari 分頁的所有資料會共用。
- 不依賴 Background Sync / Background Fetch。App 關閉、鎖屏、切到背景時下載可能被暫停或終止。請保持前景，完成後再離線。
- 瀏覽器配額、磁碟不足、使用者清除網站資料、系統回收，都可能令影片消失。`navigator.storage.persist()` 僅為盡力請求，不能保證永久保存。介面每次讀取快取確認下載狀態。不同版本與設備配額不同，不以固定 GB 承諾容量。
- 下載並非存到「照片」或一般「檔案」App，而是此網站受瀏覽器管理的儲存空間。移除網站資料後需重新下載。
- 播放由使用者點擊觸發；不保證有聲自動播放。用 H.264 + AAC 增加跨裝置相容性。MP4 並不代表所有內部編碼都能播放。
- 離線不是 DRM：無法保證授權到期即刪除、無法遠端即時撤銷離線檔。若授權要求這些條件，這個 PWA 方案不適合直接使用。

官方來源：[Apple iPad 安裝網頁 App](https://support.apple.com/en-sg/guide/ipad/ipad8f1f7a29/ipados)、[WebKit 儲存政策與回收](https://webkit.org/blog/14403/updates-to-storage-policy/)、[WebKit Safari 17 的永久儲存說明](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/)。

## 管理端安全與適用範圍

- 家長密碼只儲存加鹽 scrypt 雜湊，由伺服器驗證；前端沒有固定密碼或假驗證 PIN。啟動時未設定合法雜湊就拒絕啟動。
- 隨機 session 存伺服器記憶體，15 分鐘有效，重啟會失效；正式 HTTPS cookie 為 HttpOnly、Secure、SameSite=Strict。關閉家長視窗會登出；前端 CSRF token 只留記憶體。
- 修改操作同時檢查精確 Origin、session 及 CSRF token。登入也檢查 Origin。沒有開啟跨來源 CORS。所有管理端 API 都在伺服器檢查授權，隱藏按鈕不作為安全邊界。
- 登入每 15 分鐘全站最多 10 次嘗試（成功也計數）；這是單家庭基礎防護，攻擊者可能耗盡額度。正式對外運作建議另加防火牆、VPN / 身分閘道或反向代理速率限制。此專案沒有 MFA、帳號復原、多人角色或持久審計日誌。
- 上傳串流寫入暫存檔，限制大小，檢查 MP4 ftyp；儲存檔名由 UUID 產生。拒絕執行上傳內容；片名與授權文字以 textContent 呈現，CSP 禁止外部腳本與嵌入頁面。容器以非 root 執行。
- 這是**單家庭、可信觀看者的影片庫**：兒童首頁、片單與 MP4 觀看網址是公開讀取，家長登入只保護管理操作。任何可連到網域的人都可能看影片；UUID 不是觀看授權。如果影片不能公開，務必先將整站放到家庭 VPN 或具裝置登入的存取閘道後方，並測試離線。此範例沒有實作私人家庭帳號隔離。
- 裝置本機下載按鈕需家長登入；但影片可被觀看者透過網路／開發工具存取，無法防複製。離線快取可被裝置使用者讀取。授權必須涵蓋實際部署方式、觀看對象及離線複製，不能以「合法取得一份 MP4」直接推定具有公開傳播權。
- 家長若忘記密碼，於主機重新產生雜湊、更新環境變數並重啟 app。密碼更改立即清除舊 session；請備份內容並保護主機權限。

## 實機驗收清單

自動測試不能取代真實平板驗證。正式使用前在 Android 與 iPad 各測一次：

1. HTTPS 安裝到主畫面，關閉瀏覽器後從圖示啟動，確認無分頁列。
2. 未登入呼叫管理 API 回 401；錯密碼失敗；管理視窗關閉後重新要求登入。
3. 上傳一部真正 H.264/AAC MP4，另一台按更新即出現，播放與拖曳正常。
4. 前景下載完成；開飛航模式，關閉全部 App 視窗再重新啟動；影片能播放與拖曳，未下載影片有提示。
5. 下載中斷網／切換背景後，失敗影片不標記完成；恢復網路可以重試。
6. 線上新增、刪除，另一台重新同步即更新；離線副本待連線移除。
7. 低儲存空間、清除網站資料後，UI 正確回報未下載且可重新取得。

目前測試範圍見 TESTING.md。此交付沒有代為購買網域、上傳實際兒童影片或啟動公開服務。

