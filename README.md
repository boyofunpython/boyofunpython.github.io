# 博幼輕鬆學 Python · 程式練習室

繁體中文 Python 學習工作台，以 React、TypeScript、Vite、Blockly 13 與 CodeMirror 6 建構。Python 3.14 在瀏覽器的獨立 Worker 執行，程式檔案存在使用者的瀏覽器。編輯區填滿可用視窗，導覽抽屜預設關閉，執行結果集中於 Modal。

## 本機開發

建議使用 `.node-version` / `.nvmrc` 的 Node.js 26.12.1；也支援 Node.js 24.22.1 LTS，npm 11.20.0 以上。

```sh
npm ci
npm run dev
```

`postinstall` 會從鎖定版本的 npm 套件準備本機 Python 核心與 Blockly 資源。正式建置：

```sh
npm run build
npm run preview
```

發布目標為 `dist/`，約 16 MB。所有網站路徑使用相對網址，支援網域根目錄或子目錄部署。Hash 路由有 `#/`、`#/console`、`#/examples`、`#/classroom`、`#/assistant`；舊 `/course/#ide` 網址會轉到本站 Console。本專案不會在建置時自動部署。

## 編輯與繪圖

- 方塊、程式碼與分割三種模式；基礎工具箱有 11 個分類，完整工具箱有 20 個分類，兩者都提供 35 種 turtle 操作與範例。CPython 的 AST 負責解析，切換模式不會執行程式。
- 方塊支援變數、數值、運算、輸出輸入、條件、迴圈與 turtle。進階語法保留為可編輯的 Python 文字方塊；實際修改方塊前保留原始程式格式，修改後依方塊重新產生程式碼。
- 新增、改名、刪除、匯入與下載 `.py`，自動儲存於本機；首次使用讀取舊 IndexedDB 檔案或 futurecoder 編輯內容，不刪除原資料。
- 文字輸出以純文字呈現，`display()` 支援 SVG、HTML、PNG 與具 `savefig()` 的圖形物件。turtle 使用維護於本專案的 SVG 原始碼版本。
- SVG／SMIL 動畫在禁用指令碼的隔離 iframe 呈現；支援重播，放大結果視窗保留動畫時間軸。SVG 屬性保留大小寫，混合圖形與程式出錯前的繪圖也會保留。
- 執行中可停止；執行上限 30 秒，第一次準備環境另有 90 秒上限，等待 `input()` 的時間不計入執行上限。停止會重設 Python，檔案內容保留。

## 博幼 Python Console

Console 與編輯器使用同一個 Python 環境，可直接執行目前檔案，接著查看或操作該程式的變數。

- `Enter` 執行、`Shift+Enter` 換行；函式、條件與迴圈可逐行輸入，空行結束區塊。
- `↑` / `↓` 查閱最近指令，`Ctrl+Space` 補全，`Ctrl+L` 清空畫面。歷史紀錄最多保留 100 筆於本機，可另行清除。
- 變數面板顯示名稱、型態與簡短預覽；手機以對話框開啟。可下載文字紀錄。
- `input()` 能在函式與迴圈內即時等待輸入，也可送出 EOF。此功能使用 [Pyodide 的 JSPI 支援](https://blog.pyodide.org/posts/jspi/)，需要支援 WebAssembly stack switching 的瀏覽器。
- 系統會偵測支援能力；不支援即時輸入時，使用 Console「預先輸入」，每行對應一次 `input()`。支援即時輸入的瀏覽器也能選用此模式。
- 清空畫面保留變數；重設環境清除變數；離開 Console 會停止尚在執行的程式。

## 離線與連線服務

第一次完整載入後，Service Worker 快取網站與 Python 核心，可離線編輯及執行標準函式庫程式。額外的科學計算套件由固定版本的 Pyodide CDN 按需下載，成功載入後才可離線使用；未下載套件需要網路。瀏覽器清除網站資料或儲存空間不足可能移除快取，請下載重要程式備份。

教室使用原有 PeerJS 服務 `boyofunpython.ddns.net:9000` 與傳輸協定。收到程式須確認，並另存新檔；離開教室即斷線。跨網路 WebRTC 可用性取決於外部服務。CSV 輔助函式保留原遠端資料來源，`loadCSV()` 使用 JSPI，`await aloadCSV()` 可用於非同步程式。

原有 futurecoder 課文資料與 MIT 授權保留於 `public/lessons/`，供後續整合；舊版完整課程介面與其 Python 執行器已移除，Console 不提供逐課評分功能。

## 驗證

```sh
npx playwright install chromium
npm run format:check
npm run build
npm run test:toolbox
npm test
npm audit --audit-level=moderate
```

Playwright 預設使用套件配對的 Chromium，headless 測試 production build。可用 `PLAYWRIGHT_CHANNEL=chrome npm test` 改測本機 Chrome。CI 在 Node 24 / 26 執行同樣驗證，Linux 需先執行 `npx playwright install --with-deps chromium`。

測試涵蓋執行、錯誤、中止、逾時、方塊雙向同步、資料移轉、檔案操作、Console 多行／補全／歷史／變數／真實輸入、SVG 動畫／重播／混合輸出、離線、七種視窗尺寸與自動無障礙掃描。教室測試使用模擬傳輸，不接觸正式服務。截圖及量測存在 `artifacts/`，失敗 trace 存在 `test-results/`。

## 原始碼

- `src/components/Editor.tsx`、`src/editor/blocks.ts`、`python/ast_blocks.py`：CodeMirror、Blockly 與 AST 橋接。
- `src/runtime.ts`、`src/python/worker.ts`、`python/studio_runtime.py`：Python 執行、串流輸出、互動輸入與逾時。
- `src/components/PythonConsole.tsx`：本站 Console。
- `src/components/ResultsDialog.tsx`、`Graphics.tsx`、`Dialog.tsx`：結果、繪圖隔離與焦點管理。
- `python/boyo_turtle/`、`src/python/svg-document.ts`：SVG turtle 與最小 XML 文件介面。
- `src/storage.ts`、`src/legacy.ts`：儲存與舊資料讀取。
- `scripts/prepare-vendor.mjs`、`scripts/build-static.mjs`、`src/sw-template.js`：可重建的靜態資源與離線快取。

版本差異見 [升級紀錄](docs/version-upgrades.md)，第三方授權見 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

工具箱選項與舊版功能對照見 [工具箱相容性](docs/toolbox-compatibility.md)。

## BYOK AI 助教

學生與教師可使用自己的 OpenAI、OpenAI 相容服務或 Gemini API Key，選擇提示、除錯、寫程式、備課與出題。送出前可預覽系統指令與附帶內容；回覆的 Python 可檢查語法、另存或預覽取代，不會自動執行。金鑰與對話只留本分頁記憶體，AI 請求不進離線快取。

環境 system 指令可從介面複製／下載，部署檔為 `ai/python-system.txt`。操作、資料流、限制與官方 API 依據見 [AI 助教設計](docs/ai-assistant.md)。測試使用攔截 API 與假金鑰，不產生模型費用。
