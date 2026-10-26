import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BookOpen,
  Check,
  Copy,
  Download,
  FileCode2,
  KeyRound,
  LoaderCircle,
  Send,
  Settings2,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import { Dialog } from "./Dialog";
import { parsePython } from "../runtime";
import { PYTHON_SYSTEM } from "../ai/system";
import { INTENTS, teachingPolicy, type TeachingRole } from "../ai/policy";
import {
  AI_TIMEOUT,
  HISTORY_PAIRS,
  MAX_CODE,
  MAX_OUTPUT,
  MAX_QUESTION,
  askAI,
  compatibleBaseURL,
  endpointFor,
  usesResponses,
  listModels,
  modelsEndpointFor,
  MODEL_TIMEOUT,
  type AIModel,
  prepareRequest,
  redactKey,
  type AIConfig,
  type AIReply,
  type Message,
  type Provider,
} from "../ai/client";
import "./ai-assistant.css";

export interface CodeSnapshot {
  id: string;
  name: string;
  code: string;
}
interface Turn {
  id: string;
  question: string;
  sent: string;
  snapshot: CodeSnapshot;
  reply?: AIReply;
  error?: string;
}
type Props = {
  active: boolean;
  getSnapshot(): CodeSnapshot;
  lastOutput: string;
  lastOutputFile: string;
  createFile(code: string): void;
  applyCode(snapshot: CodeSnapshot, code: string): boolean;
};
const INITIAL: AIConfig = {
  provider: "openai",
  baseURL: "",
  api: "chat-completions",
  model: "",
  key: "",
  tokenLimit: 2048,
  chatTokenField: "max_tokens",
};
function download(text: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function PythonCode({
  code,
  incomplete,
  onReview,
  onCreate,
}: {
  code: string;
  incomplete: boolean;
  onReview(): void;
  onCreate(): void;
}) {
  const [status, setStatus] = useState("");
  const [checking, setChecking] = useState(false);
  async function check() {
    setChecking(true);
    setStatus("");
    try {
      const parsed = await parsePython(code);
      setStatus(
        parsed.error
          ? `語法錯誤${parsed.line ? `（第 ${parsed.line} 行）` : ""}：${parsed.error}`
          : "語法可解析，尚未執行。",
      );
    } catch {
      setStatus("無法檢查，請確認 Python 環境可載入。");
    } finally {
      setChecking(false);
    }
  }
  return (
    <section className="ai-python" aria-label="AI 建議 Python 程式">
      <div className="ai-code-label">
        <FileCode2 size={15} /> Python <span>先閱讀，再執行</span>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
      <div className="ai-code-actions">
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setStatus("已複製程式。");
            } catch {
              setStatus("無法複製，請選取程式碼後複製。");
            }
          }}
        >
          <Copy size={14} /> 複製
        </button>
        <button disabled={checking || incomplete} onClick={check}>
          {checking ? (
            <LoaderCircle size={14} className="spin" />
          ) : (
            <Check size={14} />
          )}{" "}
          檢查語法
        </button>
        <button disabled={incomplete} onClick={onCreate}>
          另存新檔
        </button>
        <button disabled={incomplete} onClick={onReview}>
          預覽套用
        </button>
      </div>
      {status && (
        <p className="ai-code-status" role="status">
          {status}
        </p>
      )}
    </section>
  );
}

export function AIAssistant({
  active,
  getSnapshot,
  lastOutput,
  lastOutputFile,
  createFile,
  applyCode,
}: Props) {
  const [config, setConfig] = useState<AIConfig>(INITIAL);
  const [models, setModels] = useState<AIModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");
  const modelController = useRef<AbortController | null>(null);
  const [role, setRole] = useState<TeachingRole>("student");
  const [intents, setIntents] = useState({
    student: INTENTS.student[0] as string,
    teacher: INTENTS.teacher[0] as string,
  });
  const [level, setLevel] = useState("剛開始學");
  const [question, setQuestion] = useState("");
  const [includeCode, setIncludeCode] = useState(true);
  const [includeOutput, setIncludeOutput] = useState(false);
  const [histories, setHistories] = useState<Record<TeachingRole, Turn[]>>({
    student: [],
    teacher: [],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [settings, setSettings] = useState(false);
  const [guide, setGuide] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [preview, setPreview] = useState("");
  const [review, setReview] = useState<{
    snapshot: CodeSnapshot;
    code: string;
  } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const draft = useRef<HTMLTextAreaElement>(null);
  const turns = histories[role];
  const snapshot = getSnapshot();
  const system = `${PYTHON_SYSTEM}\n\n${teachingPolicy(role, intents[role], level)}`;
  const keyReady =
    config.provider === "compatible" || Boolean(config.key.trim());
  const configured =
    Boolean(config.model.trim()) &&
    keyReady &&
    (config.provider !== "compatible" || Boolean(config.baseURL.trim()));
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (active) end.current?.scrollIntoView({ block: "nearest" });
  }, [turns, busy, active]);

  useEffect(() => {
    modelController.current?.abort();
    modelController.current = null;
    setModels([]);
    setModelsError("");
    setModelsLoading(false);
    return () => {
      modelController.current?.abort();
      modelController.current = null;
    };
  }, [config.provider, config.baseURL, config.key, config.network, settings]);
  async function loadModels() {
    if (modelController.current) return;
    const abort = new AbortController();
    modelController.current = abort;
    setModelsLoading(true);
    setModelsError("");
    setModels([]);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, MODEL_TIMEOUT);
    try {
      const available = await listModels({ ...config }, abort.signal);
      if (modelController.current === abort && !abort.signal.aborted)
        setModels(available);
    } catch (e) {
      if (modelController.current === abort)
        setModelsError(
          abort.signal.aborted
            ? timedOut
              ? "取得模型清單超過 20 秒；可稍後重試或手動輸入。"
              : "已停止取得模型清單。"
            : (e as Error).message,
        );
    } finally {
      clearTimeout(timer);
      if (modelController.current === abort) {
        modelController.current = null;
        setModelsLoading(false);
      }
    }
  }
  let modelEndpoint = "";
  try {
    modelEndpoint = modelsEndpointFor(config);
  } catch {
    /* Validation is shown when fetching. */
  }

  let connectionPaths = "";
  try {
    if (config.provider === "compatible")
      connectionPaths = `Base URL：${compatibleBaseURL(config)}\nPOST ${endpointFor(config)}`;
  } catch {
    /* Incomplete base URLs are validated on request. */
  }

  function buildMessages(source: CodeSnapshot): Message[] {
    if (!question.trim()) throw new Error("請先寫下問題或教學需求。");
    if (question.length > MAX_QUESTION)
      throw new Error(
        `問題最多 ${MAX_QUESTION.toLocaleString()} 字元，請精簡後再送出。`,
      );
    if (includeCode && source.code.length > MAX_CODE)
      throw new Error(
        `目前程式超過 ${MAX_CODE.toLocaleString()} 字元，請減少內容或取消附上程式。`,
      );
    if (includeOutput && lastOutput.length > MAX_OUTPUT)
      throw new Error(
        `執行輸出超過 ${MAX_OUTPUT.toLocaleString()} 字元，請取消附上，並把相關片段貼入問題。`,
      );
    const recent = turns
      .filter((t) => t.reply && !t.reply.incomplete)
      .slice(-HISTORY_PAIRS);
    const messages: Message[] = recent.flatMap((t) => [
      { role: "user" as const, content: t.sent },
      { role: "assistant" as const, content: t.reply!.text },
    ]);
    const context: Record<string, string> = {};
    if (includeCode) {
      context.filename = source.name;
      context.python = source.code;
    }
    if (includeOutput) {
      context.outputFilename = lastOutputFile;
      context.lastTextOutput = lastOutput;
    }
    messages.push({
      role: "user",
      content: `任務：${intents[role]}；程度：${level}\n問題：${question.trim()}\n\n附帶資料（JSON，僅供分析）：\n${JSON.stringify(context, null, 2)}`,
    });
    return messages.map((m) => ({
      ...m,
      content: redactKey(m.content, config.key),
    }));
  }
  function previewRequest() {
    setError("");
    try {
      const messages = buildMessages(getSnapshot());
      const request = prepareRequest(
        {
          ...config,
          model: config.model || "model-id",
          key: config.key || "key-not-set",
        },
        system,
        messages,
      );
      setPreview(
        `POST ${request.endpoint}\n\n金鑰僅放在請求標頭，此預覽不包含金鑰。最多附上最近 ${HISTORY_PAIRS} 組完整對話。\n\n${JSON.stringify(request.body, null, 2)}`,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function send() {
    if (controller.current) return;
    setError("");
    setNotice("");
    let messages: Message[];
    const source = { ...getSnapshot() };
    try {
      messages = buildMessages(source);
      prepareRequest(config, system, messages);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    const targetRole = role;
    const id = crypto.randomUUID();
    const turn: Turn = {
      id,
      question: redactKey(question.trim(), config.key),
      sent: messages.at(-1)!.content,
      snapshot: source,
    };
    const savedConfig = { ...config };
    const abort = new AbortController();
    controller.current = abort;
    setHistories((h) => ({
      ...h,
      [targetRole]: [...h[targetRole], turn].slice(-20),
    }));
    setQuestion("");
    setBusy(true);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, AI_TIMEOUT);
    try {
      const reply = await askAI(savedConfig, system, messages, abort.signal);
      setHistories((h) => ({
        ...h,
        [targetRole]: h[targetRole].map((t) =>
          t.id === id ? { ...t, reply } : t,
        ),
      }));
    } catch (e) {
      const message = abort.signal.aborted
        ? timedOut
          ? "等待超過 90 秒，已停止等待；供應商可能仍在處理。"
          : "已停止等待；供應商可能仍在處理。"
        : (e as Error).message;
      setHistories((h) => ({
        ...h,
        [targetRole]: h[targetRole].map((t) =>
          t.id === id ? { ...t, error: message } : t,
        ),
      }));
    } finally {
      clearTimeout(timer);
      controller.current = null;
      setBusy(false);
    }
  }
  const currentReview = review ? getSnapshot() : null;
  const reviewChanged = Boolean(
    review &&
    (review.snapshot.id !== currentReview?.id ||
      review.snapshot.code !== currentReview?.code),
  );
  return (
    <section hidden={!active} className="ai-view" aria-label="AI 助教">
      <div className="ai-heading">
        <div>
          <span className="eyebrow">LEARN WITH YOUR OWN AI</span>
          <h1>
            <Sparkles size={23} /> AI 助教
          </h1>
          <p>帶著問題來，一起把想法寫成 Python。</p>
        </div>
        <div className="ai-heading-actions">
          <button
            aria-label="環境規範"
            title="環境規範"
            onClick={() => setGuide(true)}
          >
            <BookOpen size={17} /> <span>環境規範</span>
          </button>
          <button
            className={configured ? "" : "primary"}
            onClick={() => setSettings(true)}
            disabled={busy}
          >
            <KeyRound size={17} />{" "}
            {configured ? "連線設定" : "設定自己的 API Key"}
          </button>
        </div>
      </div>
      <div className="ai-layout">
        <aside
          className={`ai-context ${contextOpen ? "is-open" : ""}`}
          aria-label="助教模式與附帶資料"
        >
          <div className="ai-role" role="group" aria-label="教學模式">
            {(["student", "teacher"] as const).map((r) => (
              <button
                key={r}
                aria-pressed={r === role}
                disabled={busy}
                onClick={() => {
                  setRole(r);
                  setError("");
                  setNotice("");
                }}
              >
                {r === "student" ? "我是學生" : "我是教師"}
              </button>
            ))}
          </div>
          <label>
            這次想做什麼
            <select
              aria-label="助教任務"
              value={intents[role]}
              disabled={busy}
              onChange={(e) =>
                setIntents((i) => ({ ...i, [role]: e.target.value }))
              }
            >
              {INTENTS[role].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            學習程度
            <select
              aria-label="學習程度"
              disabled={busy}
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            >
              {["剛開始學", "已會基本語法", "進階應用"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <div className="ai-context-source">
            <span className="eyebrow">送出前，自己決定</span>
            <label className="ai-checkbox">
              <input
                type="checkbox"
                checked={includeCode}
                disabled={busy}
                onChange={(e) => setIncludeCode(e.target.checked)}
              />{" "}
              附上目前程式
            </label>
            <p>
              <FileCode2 size={14} /> {snapshot.name}
              <br />
              {snapshot.code.length.toLocaleString()}／
              {MAX_CODE.toLocaleString()} 字元
            </p>
            <label className="ai-checkbox">
              <input
                type="checkbox"
                checked={includeOutput}
                disabled={busy || !lastOutput}
                onChange={(e) => setIncludeOutput(e.target.checked)}
              />{" "}
              附上最近執行文字／錯誤
            </label>
            <p>
              {lastOutput
                ? `${lastOutputFile} · ${lastOutput.length.toLocaleString()} 字元`
                : "還沒有執行紀錄"}
            </p>
          </div>
          <p className="ai-privacy">
            內容由瀏覽器直接送到你選的服務，可能依其規則留存並計費。請先移除個資與密鑰。金鑰、對話不存入此網站的儲存空間。
            舊對話仍可能含先前的程式；要排除舊資料，請先清除對話。
          </p>
          <p className="ai-small">
            學生與教師的對話分開保留於本分頁；模式是教學偏好，沒有身份權限。重整後金鑰與對話清除。
          </p>
        </aside>
        <div className="ai-conversation">
          <div className="ai-chat-toolbar">
            <button
              className="ai-context-toggle"
              aria-expanded={contextOpen}
              onClick={() => setContextOpen((v) => !v)}
            >
              <Settings2 size={16} /> 模式與附帶資料
            </button>
            <span>
              {role === "student" ? "學生" : "教師"} · {intents[role]}
              {configured ? ` · ${config.model}` : " · 尚未連線"}
            </span>
            <div>
              <button
                aria-label="下載目前對話"
                title="下載目前對話"
                disabled={!turns.length || busy}
                onClick={() =>
                  download(
                    redactKey(
                      turns
                        .map(
                          (t) =>
                            `## 我\n\n${t.question}\n\n## AI\n\n${t.reply?.text ?? t.error ?? ""}`,
                        )
                        .join("\n\n"),
                      config.key,
                    ),
                    `python-${role}-chat.md`,
                  )
                }
              >
                <Download size={16} />
              </button>
              <button
                aria-label="清除目前模式對話"
                title="清除目前模式對話"
                disabled={!turns.length || busy}
                onClick={() => {
                  setHistories((h) => ({ ...h, [role]: [] }));
                  setNotice("已清除目前模式對話。");
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
          <div
            className="ai-messages"
            role="log"
            aria-label="助教對話"
            aria-live="polite"
            aria-busy={busy}
          >
            {!turns.length && (
              <div className="ai-welcome">
                <span className="ai-welcome-icon">
                  <Sparkles size={26} />
                </span>
                <h2>
                  {role === "student"
                    ? "從一個小問題開始。"
                    : "把下一堂課，準備得更清楚。"}
                </h2>
                <p>
                  {role === "student"
                    ? "先說你想做到什麼、試過什麼。助教會給提示，也能協助解釋與除錯。"
                    : "告訴助教學生程度、課程時間與學習目標，一起設計示範、練習與提問。"}
                </p>
                <div className="ai-starters">
                  {(role === "student"
                    ? [
                        "我想用 turtle 畫正方形，第一步該怎麼做？",
                        "請用問題引導我理解目前程式的迴圈。",
                      ]
                    : [
                        "設計一堂 30 分鐘的 turtle 迴圈課，包含三種難度的練習。",
                        "依目前程式出三個理解檢核問題，附教師參考解答。",
                      ]
                  ).map((x) => (
                    <button
                      key={x}
                      onClick={() => {
                        setQuestion(x);
                        draft.current?.focus();
                      }}
                    >
                      {x}
                    </button>
                  ))}
                </div>
                <p className="ai-small">不會自動送出、執行程式或修改檔案。</p>
              </div>
            )}
            {turns.map((t) => (
              <article className="ai-turn" key={t.id}>
                <div className="ai-user">
                  <span>我</span>
                  <p>{t.question}</p>
                  <small>
                    {t.sent.includes('"python":')
                      ? `附程式 · ${t.snapshot.name}`
                      : "未附程式"}
                    {t.sent.includes('"lastTextOutput":')
                      ? " · 附執行文字"
                      : ""}
                  </small>
                </div>
                {t.reply && (
                  <div className="ai-answer">
                    <span className="ai-speaker">
                      <Sparkles size={16} /> AI 助教
                    </span>
                    {t.reply.incomplete && (
                      <p className="ai-warning" role="status">
                        回覆可能未完成或遭中斷，已停用程式套用。請調整問題或提高輸出上限後重新詢問。
                      </p>
                    )}
                    <Markdown
                      remarkPlugins={[remarkGfm]}
                      skipHtml
                      urlTransform={(url) =>
                        /^https?:\/\//i.test(url) ? url : ""
                      }
                      components={{
                        a: ({ children, href }) => (
                          <a href={href} target="_blank" rel="noreferrer">
                            {children}
                          </a>
                        ),
                        img: ({ alt }) => (
                          <span>[圖片：{alt || "已略過"}]</span>
                        ),
                        pre: ({ children }) => (
                          <div className="ai-pre">{children}</div>
                        ),
                        code: ({ className, children }) =>
                          /\blanguage-(python|py|python3)\b/.test(
                            className ?? "",
                          ) ? (
                            <PythonCode
                              code={String(children).replace(/\n$/, "")}
                              incomplete={t.reply!.incomplete}
                              onCreate={() =>
                                createFile(String(children).replace(/\n$/, ""))
                              }
                              onReview={() => {
                                setError("");
                                setReview({
                                  snapshot: t.snapshot,
                                  code: String(children).replace(/\n$/, ""),
                                });
                              }}
                            />
                          ) : (
                            <code className={className}>{children}</code>
                          ),
                      }}
                    >
                      {t.reply.text}
                    </Markdown>
                    <p className="ai-usage">
                      {t.reply.usage} · AI 建議請自行確認
                    </p>
                  </div>
                )}
                {t.error && (
                  <div className="ai-failed">
                    <p role="alert">{t.error}</p>
                    <button
                      onClick={() => {
                        setQuestion(t.question);
                        draft.current?.focus();
                      }}
                    >
                      編輯後重送
                    </button>
                  </div>
                )}
              </article>
            ))}
            {busy && (
              <p className="ai-waiting">
                <LoaderCircle size={17} className="spin" /> 助教正在思考…
              </p>
            )}
            <div ref={end} />
          </div>
          <form
            className="ai-compose"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            {error && (
              <p role="alert" className="ai-warning">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="ai-small">
                {notice}
              </p>
            )}
            <label className="sr-only" htmlFor="ai-question">
              問題或教學需求
            </label>
            <textarea
              ref={draft}
              id="ai-question"
              value={question}
              disabled={busy}
              placeholder={
                role === "student"
                  ? "我想做到…，目前卡在…"
                  : "學生程度、課程時間、教學目標…"
              }
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <div className="ai-compose-footer">
              <span>
                最多附最近 {HISTORY_PAIRS} 組完整對話 ·{" "}
                {question.length.toLocaleString()}／
                {MAX_QUESTION.toLocaleString()} 字元
              </span>
              <div>
                <button
                  type="button"
                  disabled={busy || !question.trim()}
                  onClick={previewRequest}
                >
                  預覽送出內容
                </button>
                {busy ? (
                  <button
                    type="button"
                    onClick={() => controller.current?.abort()}
                  >
                    <Square size={14} /> 停止等待
                  </button>
                ) : (
                  <button
                    className="primary"
                    disabled={!question.trim()}
                    type="submit"
                  >
                    <Send size={15} /> 送出
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
      {settings && (
        <Dialog
          title="AI 連線設定"
          className="ai-settings"
          onClose={() => setSettings(false)}
        >
          <div className="ai-dialog-body">
            <p>
              使用自己的服務帳號與額度。金鑰只留在本分頁記憶體；關閉或重整後需重新填寫。
            </p>
            <label>
              AI 服務
              <select
                value={config.provider}
                onChange={(e) => {
                  setConfig({
                    ...INITIAL,
                    provider: e.target.value as Provider,
                  });
                  setError("");
                }}
              >
                <option value="openai">OpenAI（Responses API）</option>
                <option value="compatible">OpenAI 相容服務</option>
                <option value="gemini">Google Gemini（GenerateContent）</option>
              </select>
            </label>
            {config.provider === "compatible" && (
              <label>
                API Base URL
                <input
                  type="url"
                  autoComplete="off"
                  spellCheck={false}
                  value={config.baseURL}
                  placeholder="http://localhost:11434/v1"
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      baseURL: e.target.value,
                      key: "",
                    }))
                  }
                />
                <small>
                  填供應商文件的 Base URL（含 /v1 或 /api/v1 等前綴），不需填
                  /chat/completions。支援
                  HTTP／HTTPS；更換網址會清除金鑰，服務須允許 CORS。
                </small>
              </label>
            )}
            {config.provider === "compatible" && (
              <>
                <label>
                  API 模式
                  <select
                    aria-label="API 模式"
                    value={config.api ?? "chat-completions"}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        api: e.target.value as AIConfig["api"],
                      }))
                    }
                  >
                    <option value="chat-completions">Chat Completions</option>
                    <option value="responses">Responses</option>
                  </select>
                  <small>
                    依供應商支援的 API 選擇；失敗時不會自動切換協定或重送。
                  </small>
                </label>
                {connectionPaths && (
                  <p className="ai-small ai-model-endpoint">
                    {connectionPaths}
                  </p>
                )}
              </>
            )}
            <label>
              模型 ID
              <input
                autoComplete="off"
                spellCheck={false}
                value={config.model}
                placeholder="填入此帳號可用的模型 ID"
                onChange={(e) =>
                  setConfig((c) => ({ ...c, model: e.target.value }))
                }
              />
            </label>
            <label>
              API Key
              {config.provider === "compatible" ? "（免驗證服務可留白）" : ""}
              <input
                type="password"
                autoComplete="off"
                name="ai-session-key"
                spellCheck={false}
                value={config.key}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, key: e.target.value }))
                }
              />
            </label>
            {config.provider === "compatible" && (
              <label>
                服務位置
                <select
                  aria-label="服務位置"
                  value={config.network ?? ""}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      network: (e.target.value ||
                        undefined) as AIConfig["network"],
                    }))
                  }
                >
                  <option value="">自動判斷</option>
                  <option value="local">區域網路（含自訂內網網域）</option>
                  <option value="loopback">本機服務</option>
                </select>
                <small>
                  若瀏覽器詢問，請允許區域網路／本機存取；部分瀏覽器仍可能阻擋
                  HTTPS 網頁連到 HTTP 服務。
                </small>
              </label>
            )}
            <div className="ai-model-discovery">
              <div className="ai-code-actions">
                <button
                  disabled={modelsLoading}
                  onClick={() => void loadModels()}
                >
                  {modelsLoading && <LoaderCircle size={14} className="spin" />}
                  取得模型清單
                </button>
                {modelsLoading && (
                  <button onClick={() => modelController.current?.abort()}>
                    停止取得
                  </button>
                )}
              </div>
              {modelEndpoint && (
                <p className="ai-small ai-model-endpoint">
                  GET {modelEndpoint}
                </p>
              )}
              <p className="ai-small">
                只取得模型資料，不送出程式或產生回答。清單不保證每個模型都支援目前文字
                API；服務未提供清單時仍可手動填模型 ID。
              </p>
              {modelsError && (
                <p className="ai-warning" role="alert">
                  {modelsError}
                </p>
              )}
              {models.length > 0 && (
                <>
                  <label>
                    選擇供應商模型
                    <select
                      aria-label="選擇供應商模型"
                      value={
                        models.some((m) => m.id === config.model)
                          ? config.model
                          : ""
                      }
                      onChange={(e) => {
                        if (e.target.value)
                          setConfig((c) => ({ ...c, model: e.target.value }));
                      }}
                    >
                      <option value="">請選擇模型（也可在上方手動輸入）</option>
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p role="status" className="ai-small">
                    已取得 {models.length} 個模型
                    {config.provider === "gemini"
                      ? "（僅含支援 generateContent 的模型）"
                      : ""}
                    ，請自行選擇。
                  </p>
                </>
              )}
            </div>
            <div className="ai-settings-row">
              <label>
                輸出 tokens 上限
                <select
                  value={config.tokenLimit}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      tokenLimit: Number(e.target.value),
                    }))
                  }
                >
                  {[1024, 2048, 4096, 8192].map((n) => (
                    <option key={n} value={n}>
                      {n.toLocaleString()}
                    </option>
                  ))}
                </select>
              </label>
              {config.provider === "compatible" && !usesResponses(config) && (
                <label>
                  上限參數
                  <select
                    value={config.chatTokenField}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        chatTokenField: e.target
                          .value as AIConfig["chatTokenField"],
                      }))
                    }
                  >
                    <option value="max_tokens">max_tokens</option>
                    <option value="max_completion_tokens">
                      max_completion_tokens
                    </option>
                  </select>
                </label>
              )}
            </div>
            <p className="ai-privacy">
              API 費用與資料留存依供應商規則；輸出上限不等於總費用上限。這是個人
              BYOK；共用或學校管理的金鑰應另建後端代理與權限控管，請勿貼入學生端。
            </p>
            <div className="dialog-actions">
              <button
                onClick={() => {
                  setConfig((c) => ({ ...c, key: "" }));
                  setNotice("本分頁的 API Key 已清除。");
                }}
              >
                清除金鑰
              </button>
              <button className="primary" onClick={() => setSettings(false)}>
                完成設定
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {guide && (
        <Dialog
          title="Python 環境與 AI 系統指令"
          className="ai-preview-dialog"
          onClose={() => setGuide(false)}
        >
          <div className="ai-dialog-body">
            <p>
              可直接交給其他 LLM 作為 system
              指令。頁面送出時會再附上目前教學模式與任務。
            </p>
            <div className="ai-code-actions">
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(PYTHON_SYSTEM);
                    setNotice("已複製系統指令。");
                  } catch {
                    setNotice("無法複製，請下載系統指令。");
                  }
                }}
              >
                <Copy size={15} /> 複製系統指令
              </button>
              <button
                onClick={() =>
                  download(PYTHON_SYSTEM, "boyo-python-system.txt")
                }
              >
                <Download size={15} /> 下載系統指令
              </button>
            </div>
            <pre className="ai-policy">{PYTHON_SYSTEM}</pre>
          </div>
        </Dialog>
      )}
      {preview && (
        <Dialog
          title="預覽實際送出內容"
          className="ai-preview-dialog"
          onClose={() => setPreview("")}
        >
          <div className="ai-dialog-body">
            <p>
              只包含此處列出的系統指令、最近對話及勾選的附帶資料；不會傳送其他檔案、圖形或班級資料。關閉後按「送出」才會請求
              API。
            </p>
            <pre className="ai-policy">{preview}</pre>
          </div>
        </Dialog>
      )}
      {review && (
        <Dialog
          title="預覽套用 AI 程式"
          className="ai-review-dialog"
          onClose={() => setReview(null)}
        >
          <div className="ai-dialog-body">
            <p>
              確認後會取代 <strong>{review.snapshot.name}</strong>{" "}
              的全部程式。程式不會自動執行。
            </p>
            {reviewChanged && (
              <p role="alert" className="ai-warning">
                送出問題後檔案已切換或修改，為保留你的編輯，請改用另存新檔。
              </p>
            )}
            <div className="ai-compare">
              <div>
                <h3>送出時的原程式</h3>
                <pre>{review.snapshot.code}</pre>
              </div>
              <div>
                <h3>AI 建議程式</h3>
                <pre>{review.code}</pre>
              </div>
            </div>
            <div className="dialog-actions">
              <button
                onClick={() => {
                  const code = review.code;
                  setReview(null);
                  createFile(code);
                }}
              >
                另存新檔
              </button>
              <button
                className="primary"
                disabled={reviewChanged}
                onClick={() => {
                  if (applyCode(review.snapshot, review.code)) {
                    setReview(null);
                    setNotice("已套用至編輯器，請閱讀後自行執行。");
                  } else setError("檔案已修改，請另存新檔。");
                }}
              >
                確認取代目前檔案
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}
