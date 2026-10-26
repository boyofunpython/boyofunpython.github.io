# 2.0.0 版本升級紀錄

查核日期：2026-10-26。先以六筆功能 commit 保存現代 SPA 基準，再進行依賴與 Console 遷移；沒有部署或修改正式服務。

| 元件              | 升級前                                   | 目前                           |
| ----------------- | ---------------------------------------- | ------------------------------ |
| 應用程式          | 舊靜態頁 / SPA 基準                      | 2.0.0                          |
| React / React DOM | 19.3.1（基準安裝已更新）                 | 19.3.1                         |
| Vite              | 7.3.7                                    | 8.3.5（Rolldown）              |
| TypeScript        | 5.9.3                                    | 7.0.2                          |
| Blockly           | 3.20200402.1，手動打包                   | 13.4.0，npm                    |
| CodeMirror        | 5，手動打包                              | 6，各模組鎖定版本              |
| Python            | 3.10                                     | 3.14.2                         |
| Pyodide           | 0.22.0-alpha.1                           | 314.0.7，ES module Worker      |
| turtle            | 舊自訂 wheel 1.0                         | 可維護原始碼 1.1.0             |
| PeerJS            | 舊 vendor 檔                             | 1.5.5                          |
| localForage       | 舊 vendor 檔                             | 1.10.0                         |
| Lucide React      | 0.x                                      | 1.61.0                         |
| XML 文件介面      | 完整 jsdom bundle                        | @xmldom/xmldom 0.9.12          |
| Playwright        | 1.64.1（基準安裝已更新）                 | 1.64.1，使用配對 Chromium      |
| axe Playwright    | 4.14.0（保留）                           | 4.14.0                         |
| Prettier          | 3.9.10（保留）                           | 3.9.10                         |
| Node.js           | 未釘選                                   | 26.12.1；CI 另驗證 24.22.1 LTS |
| npm               | 未釘選                                   | 11.20.0                        |
| GitHub Actions    | checkout/setup-node/upload-artifact 舊版 | 7.0.1 / 7.1.0 / 7.0.2          |

直接依賴的完整精確版本見 `package.json`，完整依賴樹見 `package-lock.json`，發行網站可查 `versions.json`。保留已是最新版本的 DM Sans 5.3.0、PeerJS 1.5.5 與 localForage 1.10.0。

## 遷移結果

- 移除不再載入的 BlockMirror、Skulpt、CodeMirror 5、Blockly 3、PyScript、jsdom、舊 CPython wheels、重複 worker 與 futurecoder 編譯執行器，避免舊版本繼續隨網站發行。
- Python 核心、Blockly 媒體、本站 Python 原始碼由安裝與建置腳本準備。網站本體約 16 MB；大型科學套件改由固定 Pyodide 發行源按需下載。
- CodeMirror 6 與 Blockly 13 直接整合；CPython AST 保留進階語法為 Python 文字方塊。原始程式直到使用者修改方塊前都不重寫。
- `#/console` 為本站 Console，保留程式環境、變數、歷史、補全、多行、即時輸入與 SVG。舊 `course/#ide` 轉址，舊課文與授權保留；完整舊課程 UI 不再發行。
- 保留本機儲存鍵與舊資料唯讀移轉。師生服務端位址和協定維持原設定，沒有修改外部服務或正式資料。
- 離線快取依建置內容雜湊更新；只清除此專案歷代快取。額外套件首次下載仍需網路。

## 相容性邊界

即時 `input()` 使用 [Pyodide JSPI](https://blog.pyodide.org/posts/jspi/)。不支援的瀏覽器使用預先輸入；`await aloadCSV()` 可避免同步 CSV helper 的 JSPI 需求。SVG turtle 是瀏覽器繪圖子集，事件迴圈、滑鼠鍵盤事件與部分 CPython turtle API 仍沿用原移植版本的未實作提示。

[Pyodide Worker 文件](https://pyodide.org/en/stable/usage/webworker.html)、[下載與自管部署](https://pyodide.org/en/stable/usage/downloading-and-deploying.html)、[Node.js 發行週期](https://nodejs.org/en/about/previous-releases) 為此次相容性查核的主要參考。依賴更新仍須經完整瀏覽器回歸，不應僅修改版本號。
