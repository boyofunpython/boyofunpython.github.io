# 博幼輕鬆學 Python · 程式練習室

React、TypeScript、Vite 建構的繁體中文 SPA。保留原有 Blockly / BlockMirror、CodeMirror、Pyodide 與 `/course/` 學習平台，重新整理成可在桌面與手機操作的練習工作台。主編輯區填滿視窗，導覽與檔案抽屜預設關閉，執行結果集中在 Modal 顯示。

## 本機開發

需要 Node.js 22.12 以上（或 20.19 以上）。

```sh
npm ci
npm run dev
```

開啟終端顯示的本機網址。使用 hash 路由，`#/`、`#/examples`、`#/classroom` 可直接分享與重新整理，靜態主機不需要 rewrite 設定。

```sh
npm run build
npm run preview
```

`dist/` 為可部署的完整靜態網站，包含原有 Python WASM 與課程檔案（約 300 MB）。建置會複製既有第三方資源，不會重新下載 Python 環境。正式網站應發布 `dist/`，不能直接發布原始碼根目錄。既有 `/course/` 編譯檔使用絕對路徑，因此要完整保留虛擬機器功能，請使用網域根目錄部署，如原有的 `boyofunpython.github.io`。本次工作不會自動發布網站。

## 功能

- 編輯器自動使用工具列以外的全部寬高，視窗縮放、手機直向／橫向及切換頁面後重新量測，不使用固定高度。
- 左側導覽／檔案抽屜預設隱藏，不佔用編輯空間；可用頂部檔案選單直接切換檔案。
- 執行按鈕固定在頂部，結果 Modal 支援中止、複製文字、重新執行與查看上次結果；關閉執行中的視窗會停止程式。SVG 放大時保留同一個 iframe 與動畫進度。
- Modal 與抽屜支援 Escape、背景點擊關閉、Tab 焦點循環及關閉後焦點返回；新增／改名表單開啟後聚焦檔名，避免在背景誤觸執行快捷鍵。
- 方塊、程式碼、分割三種模式，雙向同步，基礎／完整工具箱。
- 在獨立 Web Worker 執行 Python；錯誤可見、可中止、執行 30 秒自動停止。第一次載入環境另有 90 秒上限。
- 文字輸出保留字面值；SVG 與 turtle 動畫在隔離的 iframe 顯示，可重播與放大。修正原套件 SVG 屬性大小寫，`done()` 後接其他程式仍能顯示圖形。
- 新增、重新命名、刪除、匯入／下載 `.py`；自動儲存於本機瀏覽器，不上傳程式。
- 首次啟用時讀取舊版 IndexedDB 檔案；後續以 `boyo-studio-v1` 儲存資料，不再每次重寫 `main.py`。舊版資料不會刪除。
- 六個可搜尋與分類的入門範例，以新檔開啟，保留原練習。
- 保留原有師生傳輸協定與 PeerJS 服務，收到程式先確認再另存新檔。離開教室頁面即斷線。
- 目前程式可帶入原有虛擬機器；需要 `input()` 時使用此功能。
- 支援安裝為 PWA；快取僅限成功的同源 GET，更新時只清理本專案快取。

程式檔案儲存在目前瀏覽器，清除網站資料會移除新版檔案，請下載備份。儲存失敗會顯示提示，記憶體中的編輯內容仍可下載。師生連線依賴原有的 `boyofunpython.ddns.net:9000` 服務；其線上可用性與跨網路 WebRTC 連通性不由這個前端保證。

## 驗證

```sh
npm run typecheck
npm run build
npm test
```

Playwright 預設使用本機已安裝的 Google Chrome，以 headless 模式測試 production build。CI 使用 Playwright Chromium：

```sh
npx playwright install --with-deps chromium
CI=1 npm test
```

測試涵蓋 Python 正常／錯誤輸出、中止後復原、SVG 動畫時間軸與重播、無動畫繪圖、檔案儲存與移轉、範例操作、手機版、虛擬機器交接與師生傳輸協定。教室測試使用模擬傳輸，不會聯絡正式的師生服務。UI／UX 驗證另涵蓋七種視窗尺寸、實際編輯區佔比、鍵盤執行、Modal 焦點與中止流程，以及一般頁面／抽屜／結果視窗的自動無障礙掃描。幾何量測保存在 `artifacts/workspace-geometry.json`，掃描結果保存在 `artifacts/accessibility.json` 與 `artifacts/ux-accessibility.json`。截圖位於 `artifacts/`，失敗時保留 `test-results/` 的截圖與 trace。

## 原始碼分工

- `src/App.tsx`：單頁導覽、工作台與檔案操作。
- `src/components/Editor.tsx`、`src/legacy.ts`：既有編輯器與課程的載入介面。
- `src/storage.ts`：儲存格式檢查與舊資料移轉。
- `src/runtime.ts`、`js/studio-worker.js`：執行生命週期、逾時與中止。
- `python/studio_runtime.py`：Python 文字輸出、turtle SVG 相容處理。
- `src/components/ResultsDialog.tsx`：執行結果、中止／重跑、複製與原地放大。
- `src/components/Dialog.tsx`：共用 Modal、抽屜、焦點循環與返回。
- `src/components/Graphics.tsx`：隔離的圖形呈現、比例與重播。
- `src/components/Classroom.tsx`：教室連線與收件確認。

既有的 `main.js`、`peer.js` 與舊 worker 留作原始實作參照，SPA 不再載入它們。原有第三方資源與授權註記保留於各自目錄。
