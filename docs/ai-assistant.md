# 個人 BYOK Python 助教

從頂端「AI 助教」或選單進入 `#/assistant`。學生可選提示、解釋、除錯、協助寫程式；教師可選教學設計、練習題、常見錯誤、示範程式。這是教學偏好，不是登入或權限隔離。教師參考解答沒有保密機制。

## 開始使用

1. 開啟「設定自己的 API Key」，選 OpenAI、OpenAI 相容服務或 Gemini。
2. 填入自己的金鑰，再按「取得模型清單」並選擇模型，也可直接手動填模型 ID。相容服務填 **API Base URL**，如 `http://192.168.1.20:11434/v1`，再選供應商支援的 Chat Completions 或 Responses API；支援任意 HTTP／HTTPS 主機、連接埠與路徑前綴，免驗證服務可不填金鑰。網址變動或切換服務會清除金鑰。
3. 選擇學習程度與任務。決定是否附上目前程式、最近主編輯器執行的文字／錯誤；預設附程式，不附執行紀錄。
4. 輸入問題，按「預覽送出內容」檢查實際 API 內容，再按「送出」。只有送出才會產生回答；「取得模型清單」只呼叫供應商的模型資料 GET API，不附帶程式或對話。其他設定、範例問題與預覽都不會呼叫 API。
5. AI 完整 Python 圍欄可複製、只檢查語法、另存新檔，或比較原程式後確認取代。沒有自動執行。如果詢問後原檔已修改或切換，停用取代，仍可另存。

未預設付費模型，以免模型權限、價格或供應商名稱變動造成誤導。輸出 tokens 上限不是總費用上限；思考 tokens 也可能消耗輸出預算。若模型只思考而沒有可見文字，可調整上限、問題或模型。相容服務可能要求 `max_tokens` 或 `max_completion_tokens`，設定可切換；不會自動嘗試不同參數而重複計費。

## 可攜式 system 指令

唯一原稿是 [src/ai/python-system.txt](../src/ai/python-system.txt)。`src/ai/policy.ts` 以執行器共用的 `src/python/limits.ts` 填入 30 秒執行、90 秒準備、100,000 字元輸出限制。建置時產出 `public/ai/python-system.txt`，部署後可從 `/ai/python-system.txt` 下載；介面「環境規範」也提供複製／下載。

系統指令涵蓋套件 import、暫存檔案、網路 CORS、print/display、matplotlib Agg、Turtle SVG、input/預設輸入、主編輯器與 Console 的差異，以及方塊表示能力。送出時另加目前模式、任務及程度。不授予 AI 執行 Python、讀取其他檔案或修改工作區的工具；語法檢查不等於執行驗證。

學生範例：「我想用 turtle 畫正方形，請給我一個提示，不要直接給完整解答。」

教師範例：「學生已會 for 迴圈，請設計 30 分鐘 turtle 圖形課：教學目標、三層練習、兩個檢核問題，最後列教師參考。」

可直接執行的格式範例：

```python
import turtle

turtle.set_defaults(canvwidth=500, canvheight=500)
pen = turtle.Turtle()
for _ in range(4):
    pen.forward(80)
    pen.left(90)
turtle.done()
```

```python
name = input("你的暱稱：")
print("你好，" + name)
```

```python
import csv
import io

rows = csv.DictReader(io.StringIO("fruit,count\napple,3\npear,2\n"))
for row in rows:
    print(row["fruit"], int(row["count"]))
```

## 資料流與限制

```text
使用者確認送出
  → system＋目前問題＋勾選資料＋最近三組完整對話
  → 瀏覽器直接 POST 到使用者設定的供應商
  → 文字回覆 → 安全 Markdown → 明確選擇另存／預覽取代
```

- 金鑰、API 設定及對話僅在 React 記憶體；不寫 localStorage、sessionStorage、IndexedDB、URL、日誌或對話下載。工作區程式原本的瀏覽器儲存機制不變，請勿把金鑰寫進程式。重整／關閉分頁後需重填金鑰。清除金鑰不會清除已送給供應商的資料。
- 只有勾選的目前檔與最近一次主編輯器的文字結果／錯誤會送出，沒有其他檔案、Console 歷史、變數、班級資訊、圖片或 SVG。輸出會標示原執行檔名，可能與目前編輯內容不同，使用者需預覽確認。
- 每模式在記憶體顯示最近 20 回合，請求只附最近三組成功且完整的對話；這些歷史仍含先前勾選的資料。取消目前「附上程式」不會移除既有歷史；如需排除舊資料，先清除目前模式對話。失敗或不完整回答不納入後續歷史。
- 問題 4,000、目前程式 16,000、最近文字輸出 4,000 字元上限。超限會拒絕送出並說明，沒有偷偷截斷。序列化 API body 上限 80,000 字元，回覆上限 1 MB。與 Python 自身的 100,000 字元執行輸出限制不同。
- 精確符合目前金鑰的文字會在問題、附帶內容、回覆及對話下載中移除。這不是通用密鑰偵測，仍需自行移除其他密鑰及個資。
- API key 只在 `Authorization: Bearer …` 或 Gemini `x-goog-api-key` 標頭；不用 URL query。官方端點鎖定；自訂支援 HTTP 及 HTTPS（含本機與區域網路），拒絕帳密、query、fragment。禁止跟隨重新導向；不附帶 cookies、referrer，不重試、不替換供應商。服務工作者略過 no-store 或含金鑰標頭的請求。
- 最長等待 90 秒，可停止等待；供應商可能繼續處理並計費。429、401/403、模型／格式錯誤、網路／CORS、空內容、非 JSON 都顯示可處理的訊息，不顯示原始錯誤回應，避免服務端回顯密鑰。
- AI HTML 不執行；外部圖片不載入，只顯示替代文字。連結僅允許 HTTP/HTTPS 並隔離新分頁。程式碼不自動執行；中斷或截斷回覆停用套用及語法檢查，仍可閱讀、複製。
- 瀏覽器個人 BYOK 無法隔離同分頁的第三方腳本或有權讀取頁面的擴充套件。只適合使用者自己的金鑰；學校共用金鑰、集中額度、老師身份驗證與資料治理需要另建後端代理、登入及權限，不能靠學生／教師切換實現。
- 本功能沒有網站後端代理或對話資料庫。API 仍需網路；供應商的留存、訓練與費用規則以其帳號／條款為準。`store: false` 不是所有紀錄零留存的保證。

## 協定與官方依據（2026-10-26）

- OpenAI：`POST /v1/responses`，`instructions`、多回合 `input`、`max_output_tokens`、`store:false`。依序讀取 `output[].content[]` 的 `output_text`／拒絕文字，沒有假設第一個 output 必為可見文字。[文字生成](https://developers.openai.com/api/docs/guides/text)、[資料控制](https://developers.openai.com/api/docs/guides/your-data)。
- OpenAI 相容：以供應商 Base URL 加上資源路徑。Chat Completions 送 system/user/assistant messages、可選 token 上限參數，讀 `choices[0].message.content`；Responses 送 instructions/input/max_output_tokens，依序讀 output 中的文字。兩者明確設定 `stream:false`，協定由使用者選擇，不會自動切換並重複生成。相容程度及 CORS 由服務提供者負責。[OpenAI Chat API](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)。
- Gemini：採用仍提供的 `models.generateContent`，不是 Interactions；`systemInstruction`、user/model contents、`generationConfig.maxOutputTokens`、`store:false`。讀第一候選的非 thought text 與 usageMetadata。[GenerateContent 參考](https://ai.google.dev/api/generate-content)、[金鑰與來源限制](https://ai.google.dev/gemini-api/docs/api-key)。

測試使用假的金鑰與攔截的 API 回覆，不發出付費 AI 請求。供應商帳號權限、付費模型及個別相容服務的實際 CORS 仍須使用者以自己的帳號驗證。

## 模型探索與內網 HTTP（2026-10-26）

- OpenAI 使用 `GET https://api.openai.com/v1/models`，相容服務以 **Base URL** 為共同根目錄，分別附加 `models`、`chat/completions` 或 `responses`；保留主機、連接埠與路徑前綴，不丟掉或重複加 `/v1`。例如 Base URL `http://localhost:1234/gateway/v1` 對應 `/gateway/v1/models`、`/gateway/v1/chat/completions`、`/gateway/v1/responses`。[OpenAI 官方模型 API](https://developers.openai.com/api/reference/resources/models/methods/list)。不猜測模型家族、不自動挑選第一個模型；清單只代表供應商列出的模型，不保證可用於目前文字 API。
- Gemini 使用 `GET https://generativelanguage.googleapis.com/v1beta/models`，依 `nextPageToken` 完成分頁，僅保留 `supportedGenerationMethods` 含 `generateContent` 的模型；移除 ID 的 `models/` 前綴供選擇。[Gemini 官方模型 API](https://ai.google.dev/api/models)。
- 每次取得最多等待 20 秒、每頁回覆上限 1 MB、最多 10 頁。去除重複 ID；失敗、空清單、格式不符或無法完整分頁時顯示錯誤並保留手動輸入。按鈕可停止；切換服務、端點、金鑰、服務位置或關閉設定會取消並清空清單，舊回覆不會覆蓋新設定。模型 ID 不因載入清單而自動改變。
- GET 只傳 API Key 標頭及分頁參數，不送程式／問題／對話；不帶 cookies、referrer、不跟隨轉址、不自動重試、`cache:no-store`，也不寫入網站儲存。相容服務沒有金鑰時不送 Authorization，也不增加不必要的 Content-Type 標頭。
- 「服務位置」預設由瀏覽器判斷；內網自訂 DNS 可選區域網路，本機可選本機服務，分別向支援的瀏覽器傳 `targetAddressSpace: local / loopback`。這不會繞過權限或 CORS；從 GitHub Pages 連到 HTTP 服務時可能出現區域網路／本機權限提示，其他瀏覽器仍可能阻擋混合內容。[Chrome 區域網路存取說明](https://developer.chrome.com/blog/local-network-access)。使用者需允許所選服務的連線，並由服務端開放本站來源的 CORS。
- 自動測試除了攔截的官方模型回應，也啟動自己的 HTTP 測試服務，實際完成 models GET、CORS 與 Chat Completions POST；不連到使用者的真實內網設備或付費模型。

## Base URL 與 API 模式的官方用法

相容服務設定依照 [Ollama 官方 OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility) 及 [LM Studio 官方 OpenAI Compatibility Endpoints](https://lmstudio.ai/docs/developer/openai-compat)。範例 Base URL 為 `http://localhost:11434/v1/`（Ollama）與 `http://localhost:1234/v1`（LM Studio）；前綴若由服務商指定為 `/api/v1` 或其他路徑，完整保留，不自行猜測版本路徑。只有主機的 Base URL 也照填入值附加資源，不自動補 `/v1`。

- Base URL 可有或沒有尾端 `/`；介面顯示正規化後的 Base URL 及實際 POST 路徑。
- Base URL 的路徑完整保留，只統一尾端斜線；不猜測或刪除名為 `models`、`responses` 的前綴。請依供應商文件填 Base URL，不沿用舊介面要求的完整 `/chat/completions` 網址。協定明確選擇，介面顯示實際 POST 網址供確認。
- Chat Completions 使用 `messages`，上限參數可選 `max_tokens` 或 `max_completion_tokens`。OpenAI 官方已將 `max_tokens` 標為棄用，但部分相容服務仍只支援該欄位，依供應商文件選擇；不在錯誤後自動改參數重試。[OpenAI 官方參數](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)。
- Responses 使用 `instructions`、`input`、`max_output_tokens`、`store:false`；不帶 Chat Completions 的 `messages`／token 欄位，不使用伺服器 conversation 或 previous_response_id。官方 OpenAI 預設此模式；相容服務必須明確選擇。[OpenAI 文字生成](https://developers.openai.com/api/docs/guides/text)、[LM Studio Responses](https://lmstudio.ai/docs/developer/openai-compat/responses)。回覆只有 `status:completed` 才允許套用程式；中斷、取消或未完成皆保留文字並停用套用。
- `/models` 與生成協定無關，直接由同一 Base URL 組合。LM Studio 可列出下載但尚未載入的模型，清單不等於保證可生成；仍須依所選模型及供應商的能力決定。[LM Studio 模型 API](https://lmstudio.ai/docs/developer/openai-compat/models)。
- HTTP 測試服務會對未知路徑回 404、錯誤 request schema 回 400，分別測試兩種協定；測試不會僅憑收到任意 POST 就回傳成功。

驗證時另以 npm 最新官方 `openai` SDK 7.43.0，對六種 Base URL（含尾端斜線、閘道前綴及名為 models/responses 的路徑）比對兩種生成 API，十二組請求的路徑及 JSON 均與本站一致。SDK 僅安裝於忽略的驗證目錄，未加入產品依賴；所有請求皆送至自己的 HTTP 測試服務，沒有付費 AI 呼叫。
