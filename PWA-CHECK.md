# KidsTube 平板 PWA 檢查與交付（2026-10-23）

## 結論與證據

本機及正式網站入口、public 首頁、manifest、sw.js 已讀取核對，正式 URL 回應皆為 HTTP 200。現有正式 Worker 為 kt-shell-firebase-v15。工作目錄原先乾淨，remote 為 Missan-Cynthia/Cynthia-Video。未查得專案內 GitHub Actions 部署工作流程；未驗證 GitHub 後台 Pages 分支設定，亦未推送或部署本次修改。

manifest 位於 https://missan-cynthia.github.io/Cynthia-Video/public/manifest.webmanifest 。id、start_url、scope 都是 ./，解析後均為 /Cynthia-Video/public/；display 為 standalone。name / short_name 為 Youtube，符合現有畫面與已安裝名稱，本次保留。兩張 PNG 實際寬高已檢查，分別為 192×192、512×512。無錯誤的網站根目錄絕對路徑。Worker 從 ./sw.js 註冊、updateViaCache 為 none，預設控制 public/，與 manifest 啟動位置一致。

確定的缺口：

- /Cynthia-Video/ 是 meta refresh 轉址頁，原先沒有 manifest。補上同一份 manifest 的連結可讓入口頁也宣告同一 App；仍建議從 public/ 完整首頁安裝。這不是 Android 故障的已證實根因。
- Worker 已能將 app.js?v=15 等查詢變體命中無查詢的快取，但未處理 public/index.html 啟動別名。新增別名後會回傳已快取的 public/ 殼。這項修正處理殼的離線導覽，不會恢復 Firebase 離線影片。
- app.js 原先即在 cloudMode 停用 downloads/offline、離線播放提前返回；firebase-stream.js 使用登入 Token 串流並回傳 no-store。README 也記載 Firebase 模式僅支援線上。不能將「保留既有程式」誤報為「目前具備 Firebase 離線播放」。此次不改此架構、不讀取舊影片繞過驗證、不刪除本機影片。

Android 的「已安裝」表示 Chrome 有相關安裝判斷／紀錄，無法單憑這段文字確認桌面點到的圖示正是該安裝。可能同時存在舊 WebAPK 與一般捷徑，或圖示對應已失效的啟動目標。網址列也可能來自 browser 模式或 scope 外導覽。現有原始碼不能確認哪種發生；「無法開啟應用程式」需裝置 Android/Chrome 版本、App 資訊及安裝紀錄。沒有硬體效能不足的證據。

## 本次修改

- index.html：轉址入口加入 ./public/manifest.webmanifest。
- public/sw.js：殼版本升為 kt-shell-firebase-v16；index.html（含 query）映射至已快取的目錄首頁。保留既有更新等待行為、受保護串流、媒體快取名稱與清理規則。
- public/pwa-check.html、public/pwa-check.js：獨立只讀診斷頁，列出目前視窗 display-mode、實際 URL、控制 Worker、相符 scope 的 active/waiting 狀態與解析後 manifest。沒有刪除、更新、取消註冊或登入資料讀取操作。診斷頁自身不是離線預載資源。
- pwa.test.mjs、package.json：將路徑、圖示尺寸、離線啟動別名、更新保留非殼快取測試納入 npm test。

未修改 UI、配色、Firebase 結構、登入保護、影片清單或影片。manifest 內容及 Apple Web App meta/icon 設定原樣保留。

## 部署與更新

需要依原有 GitHub Pages 流程重新部署修改檔案，保持 /Cynthia-Video/ → public/ 的位置；不用改 Firebase 或部署路徑。本次僅修改本機，尚未發布。

部署後連線開啟 public/，讓 Worker 下載 v16；關閉所有 KidsTube 視窗，再重新開啟。新 Worker 不強制中斷播放。診斷頁 active 與 waiting 可協助判斷更新是否尚待啟用。畫面仍顯示 v15 是因本次保留 UI 原樣，Worker 版本請以 DevTools Sources 或網路檔案確認。不要把 update.html 當成必要的第一步，該舊工具會取消註冊及重建殼；本次一般更新不需要這樣做。

## Android：先保留資料，再檢查／重裝

1. 更新部署後，用同一個 Chrome 設定檔（一般模式）直接開啟 https://missan-cynthia.github.io/Cynthia-Video/public/ ，等首頁載入並連線更新；避免從轉址頁或舊書籤開始安裝。
2. 先長按原桌面圖示查看是否能開啟「應用程式資訊」，並在 Android 設定的應用程式清單尋找 Youtube／KidsTube。記錄 App 名稱、啟動畫面網址、錯誤原文、Android 與 Chrome 版本。只有 Chrome 徽章或沒有獨立 App 資訊可能是捷徑，但啟動器各異，不能單靠外觀定論。
3. 開啟診斷頁 https://missan-cynthia.github.io/Cynthia-Video/public/pwa-check.html 記錄輸出。Chrome 分頁內的 browser 是預期結果；它不能列出 Android 的全部安裝，也不能證明沒有安裝。若需要證明圖示啟動的 display-mode，可由電腦遠端偵錯該啟動視窗，再執行 matchMedia('(display-mode: standalone)').matches。
4. 先嘗試 Chrome 選單的「開啟應用程式」（若有），與原圖示比較。若選單可正常啟動而舊圖示不能，優先只移除舊桌面捷徑，再從已存在 App 放回桌面；務必區分「移除圖示」與「解除安裝」。重新啟動平板可作為不清資料的下一步。
5. 如仍需解除安裝，先盤點本機收藏、登入狀態及下載影片是否有可恢復來源。解除安裝的提示可能提供一併刪除網站資料選項；不同系統處理不同，不能保證保留。資料清除可能失去登入、收藏、快取片單、縮圖與離線影片，且同來源其他 App 可能共用部分儲存空間。不要勾選刪除網站資料，也不要清 Chrome 儲存空間或全部瀏覽資料。如不能確認保留資料，停在此步，先確認備份／重新下載方式。
6. 只有家長確認可接受本機資料影響後，才從 Android App 資訊解除失效安裝；重新以 Chrome 開啟上述 public/ URL，選「安裝應用程式」（或加入主畫面後的安裝選項）。若只出現一般捷徑，不當成安裝成功。若仍顯示已安裝，需檢查同設定檔的其他安裝與裝置端紀錄，勿以清資料作為預設修法。
7. 關閉 Chrome，從新圖示開啟，確認無網址列及分頁；再測片單、播放／拖曳、家長登入、更新與重新啟動。可用桌面 Chrome 的 chrome://inspect/#devices 連接 Android 遠端偵錯，查看 Application > Manifest / Service Workers 與錯誤。依裝置支援情況，chrome://webapks 也可協助檢查 WebAPK 資訊。

## iPad 與驗收限制

iPad 不需要重裝。id/start_url/scope 及 Apple metadata 不變，預期保留其已通過的獨立視窗體驗；本次未取得 iPad 實機，仍須更新後回歸。既有 iPad 首頁、無網址列／分頁、六支影片清單的通過結果來自使用者先前測試，不等於本版全部通過。

自動測試：node --test test.mjs firebase.test.mjs pwa.test.mjs，16/16 通過；涵蓋子路徑、PNG、快取別名、更新僅刪舊殼、既有登入／CSRF／Range 串流。不等於真實 Chrome 安裝成功。

尚待兩台實機驗證：本次更新後圖示啟動、視窗模式、片單、影片播放與拖曳、家長登入／登出、更新後再次啟動。Android 舊安裝根因仍未確定。Firebase 離線影片目前未實作，驗收應列為「既有功能缺口」，不能列通過；若要加入需另行設計有授權的下載／離線播放流程，超出本次最小 PWA 安裝修正。

技術依據：

- https://web.dev/learn/pwa/web-app-manifest
- https://developer.chrome.com/docs/capabilities/pwa-manifest-id
- https://developer.chrome.com/docs/lighthouse/pwa/installable-manifest

manifest 的 identity 與啟動 URL 應保持穩定；符合靜態安裝欄位並不保證某台 Android 的既有安裝／WebAPK 正常。
