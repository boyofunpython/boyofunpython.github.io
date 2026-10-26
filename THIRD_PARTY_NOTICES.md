# 第三方來源與授權

npm 版本由 `package-lock.json` 鎖定。以下為主要直接依賴；各套件的完整授權與轉接依賴資訊以其發行內容為準。

| 元件                        | 授權                 | 來源                                                                                |
| --------------------------- | -------------------- | ----------------------------------------------------------------------------------- |
| react-markdown / remark-gfm | MIT                  | https://github.com/remarkjs/react-markdown / https://github.com/remarkjs/remark-gfm |
| React / React DOM           | MIT                  | https://github.com/facebook/react                                                   |
| Blockly / multiline input   | Apache-2.0           | https://github.com/google/blockly / https://github.com/google/blockly-samples       |
| CodeMirror 6 / Lezer        | MIT                  | https://github.com/codemirror                                                       |
| Pyodide                     | MPL-2.0              | https://github.com/pyodide/pyodide                                                  |
| CPython 與標準函式庫        | PSF-2.0 及其內含授權 | https://github.com/python/cpython                                                   |
| @xmldom/xmldom              | MIT                  | https://github.com/xmldom/xmldom                                                    |
| PeerJS                      | MIT                  | https://github.com/peers/peerjs                                                     |
| localForage                 | Apache-2.0           | https://github.com/localForage/localForage                                          |
| Lucide                      | ISC                  | https://github.com/lucide-icons/lucide                                              |
| DM Sans                     | OFL-1.1              | https://github.com/googlefonts/dm-fonts                                             |
| Vite                        | MIT                  | https://github.com/vitejs/vite                                                      |
| TypeScript / Playwright     | Apache-2.0           | https://github.com/microsoft/TypeScript / https://github.com/microsoft/playwright   |
| axe-core                    | MPL-2.0              | https://github.com/dequelabs/axe-core                                               |
| Prettier                    | MIT                  | https://github.com/prettier/prettier                                                |

## SVG turtle

`python/boyo_turtle/` 源自本站原有 `custom_turtle_for_Pyodide-1.0-py3-none-any.whl`，內容為 Romain Casati 的 Brython / Basthon turtle 移植，檔頭標示 GPL v3（SVG 工廠標示 v3 或更新版本）。本專案保留作者註記、提供完整可修改原始碼與 [GPL v3 授權](python/boyo_turtle/LICENSE)。

本站維護版本為 1.1.0，修正 SVG 屬性大小寫、支援現代 Python 的 introspection，並由 `python/studio_runtime.py` 整合輸出、`tracer()` 與互動環境。原始碼連同授權會複製到發行網站的 `python/boyo_turtle/`；不再使用預編譯 wheel。

## futurecoder 課文

`public/lessons/futurecoder-pages.json` 保留自本站原有 futurecoder 發行內容。作者 Alex Hall，Copyright (c) 2020，MIT 授權。完整授權位於 [public/lessons/FUTURECODER-LICENSE](public/lessons/FUTURECODER-LICENSE)。上游：https://github.com/alexmojaki/futurecoder 。原編譯程式、舊 Python runtime 與未使用的第三方瀏覽器套件已移除。

發行時仍須保留依賴套件所要求的版權與授權文字；建置產生 `third-party-licenses.json` 收錄已安裝的 production npm 套件授權，Pyodide 的 Python 標準函式庫也內含其授權資料。
