# 驗證紀錄

2026-10-22 封面下載診斷：真實 Firebase 片單可列出 MP4 及已上傳 JPG，原 Service Worker fetch 實測 TypeError: Failed to fetch；改為官方 SDK getMetadata + getBlob（2 MiB 上限）後仍遇到 storage/retry-limit-exceeded。公開 OPTIONS 檢查為 HTTP 200 並允許 Authorization，這只能確認預檢回應，不能證明實際已授權二進位 GET 的 CORS 完整可用。尚未修改雲端 CORS，也尚未驗證封面成功顯示，不將灰底標記為已修好。

本機已修正取消請求不誤報斷網、封面與影片錯誤分流、封面使用官方 SDK，不顯示一般「網路中斷」作為所有封面錯誤的結論。新增回歸測試，共 11 組通過。手動更新頁 /update.html 可在先關閉播放器後啟用新版；不清除帳號登入或 MP4。

後續真實雲端診斷：使用者已於本機成功登入，UI 確認 UID 與白名單相同；SDK 已從 Storage 列出 video/ 下八部 MP4。檔案 metadata 被 get 規則拒絕，查明先前把遞迴 wildcard（Path 型別）當字串呼叫 matches()。已將規則及產生器改為 resource.name.matches()，新增型別回歸檢查；目前共 10 組本機測試通過。家長需重新發布修正版規則後，才能繼續真實影片讀取與播放驗證。Rules 回歸檢查不是 Firebase 規則引擎／Emulator 的執行測試。

Firebase 升級：`node --test test.mjs firebase.test.mjs` 共 9 組通過。新增 6 組涵蓋真實目錄／分頁探索的模擬、只讀 metadata 的片單、路徑編碼／洗牌、串流 Range 與登入拒絕、本機資料隔離。瀏覽器已成功初始化 Firebase 並呈現登入表單。家長尚未於本機登入及發布雲端規則，因此真實授權／未授權帳號、Cloud Storage 清單與串流未完成驗證。UID 與 video/ 路徑由使用者提供，尚未當成已實測結果。

最新實際影片驗證：使用者提供三部 `.pwa.mp4` 已替換本機片庫，均確認 `avc1`（H.264）與 `mp4a` 音軌，moov 位於 mdat 前（Fast Start）。在桌面內建瀏覽器逐部點選播放，三部皆 readyState=4、paused=false、currentTime 持續前進且沒有 media error。火車嘟嘟嘟為 640×360／約 169 秒，捏泥巴為 640×360／約 153 秒，卡加布列島為 1920×1080／約 158 秒。尚未在真實 iPad 或 Android 驗證。

實際畫面檢查發現縮圖 Blob URL 被 CSP 擋下，已在 img-src 精確加入 blob:，更新 Service Worker 殼至 kt-shell-v4。重新啟用後，三張縮圖均 complete=true 且 naturalWidth=480。新版影片使用新 UUID，避免舊版本下載與縮圖被誤用。原始檔保留，影片僅存本機 data/；通用程式 ZIP 不包含影片。

介面第二版更新後，重新執行三組既有測試全部通過，app.js 語法檢查通過，本機首頁 HTTP 200。新增搜尋、收藏、影片擷取縮圖、推薦清單與底部動畫尚未完成瀏覽器互動驗證；平板實機驗收仍必須執行。

驗證環境：Windows、Node.js v24.19.0。執行 `node --test test.mjs`，3 組測試通過。

- 真實 HTTP 端對端測試：全部 PWA 靜態資源可讀取、管理未登入 401、來源錯誤 403、登入 cookie、CSRF 阻擋、上傳片單、授權欄位不暴露於公開片單、MP4 分段 206、超界 416、刪除後 404、登出後 401。
- Range 函式：正常、開放結尾、suffix、超界、反向範圍與不支援的多區段請求。
- Service Worker 在隔離 JavaScript 環境模擬：完整快取讀取、206 分段及 Content-Range、suffix、416、離線缺檔 503。
- server.mjs、app.js、sw.js 語法檢查通過。

HTTP 上傳測試使用具有 ftyp 標頭的合成資料，只驗證容器檢查與資料傳輸，並非可播放影片。沒有附帶實際授權影片。模擬 Service Worker 測試並非真實 Safari / Chrome 離線測試。

本機瀏覽器預覽工具回報 `Tab 1 is not part of browser session`，因此沒有完成視覺 QA、真實影片解碼、安裝、實機離線冷啟動、容量耗盡及背景中斷驗證。正式採用前，請依 README 的實機驗收清單在實際 Android、iPad 執行。未執行 Docker 建置、HTTPS 網域部署或 TLS 憑證申請。

此環境沒有 npm 命令；所有執行與驗證均可直接使用 Node，不需安裝依賴。
