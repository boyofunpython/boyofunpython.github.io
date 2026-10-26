export type Provider = "openai" | "compatible" | "gemini";
export type CompatibleAPI = "chat-completions" | "responses";
export interface AIConfig {
  provider: Provider;
  network?: "local" | "loopback";
  baseURL: string;
  api?: CompatibleAPI;
  model: string;
  key: string;
  tokenLimit: number;
  chatTokenField: "max_tokens" | "max_completion_tokens";
}
export interface Message {
  role: "user" | "assistant";
  content: string;
}
export interface AIReply {
  text: string;
  incomplete: boolean;
  usage: string;
}
export const HISTORY_PAIRS = 3;
export const MAX_CODE = 16000;
export const MAX_OUTPUT = 4000;
export const MAX_QUESTION = 4000;
export const MAX_REQUEST = 80000;
export const AI_TIMEOUT = 90000;

// Match OpenAI-compatible clients: keep the provider base path and append a
// resource path. A leading slash in new URL(resource, base) would discard /v1.
export function compatibleBaseURL(config: AIConfig): string {
  let url: URL;
  try {
    url = new URL(config.baseURL.trim());
  } catch {
    throw new Error(
      "請填寫供應商的 API Base URL，例如 http://localhost:11434/v1。",
    );
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Base URL 需使用 HTTP 或 HTTPS，且不可包含帳密、查詢參數或 #。",
    );
  url.pathname = url.pathname.replace(/\/+$/, "") + "/";
  return url.href;
}
export function usesResponses(config: AIConfig): boolean {
  return (
    config.provider === "openai" ||
    (config.provider === "compatible" && config.api === "responses")
  );
}
export function endpointFor(config: AIConfig) {
  if (config.provider === "openai")
    return "https://api.openai.com/v1/responses";
  if (config.provider === "gemini")
    return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model.trim().replace(/^models\//, ""))}:generateContent`;
  return new URL(
    usesResponses(config) ? "responses" : "chat/completions",
    compatibleBaseURL(config),
  ).href;
}
export const redactKey = (text: string, key: string) =>
  key.trim() ? text.replaceAll(key.trim(), "[已移除 API Key]") : text;

export function prepareRequest(
  config: AIConfig,
  system: string,
  messages: Message[],
) {
  if (!config.model.trim()) throw new Error("請先在連線設定填入模型 ID。");
  if (config.provider !== "compatible" && !config.key.trim())
    throw new Error("請先在連線設定填入自己的 API Key。");
  if (
    config.provider === "gemini" &&
    !/^(models\/)?[a-zA-Z0-9._-]+$/.test(config.model.trim())
  )
    throw new Error("Gemini 模型 ID 格式不正確。");
  const endpoint = endpointFor(config);
  const cleaned = messages.map((m) => ({
    ...m,
    content: redactKey(m.content, config.key),
  }));
  const instructions = redactKey(system, config.key);
  const model = config.model
    .trim()
    .replace(config.provider === "gemini" ? /^models\// : /$^/, "");
  let body: object;
  if (usesResponses(config))
    body = {
      model,
      instructions,
      input: cleaned,
      max_output_tokens: config.tokenLimit,
      store: false,
      stream: false,
    };
  else if (config.provider === "gemini")
    body = {
      systemInstruction: { parts: [{ text: instructions }] },
      contents: cleaned.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: { maxOutputTokens: config.tokenLimit },
      store: false,
    };
  else
    body = {
      model,
      messages: [{ role: "system", content: instructions }, ...cleaned],
      stream: false,
      [config.chatTokenField]: config.tokenLimit,
    };
  const serialized = JSON.stringify(body);
  if (serialized.length > MAX_REQUEST)
    throw new Error("對話內容過長，請清除對話或減少附帶程式後再送出。");
  return { endpoint, body, serialized };
}

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj => (x && typeof x === "object" ? (x as Obj) : {});
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown) => (typeof x === "string" ? x : "");
function usageText(input: unknown, output: unknown) {
  return typeof input === "number" && typeof output === "number"
    ? `輸入 ${input.toLocaleString()}／輸出 ${output.toLocaleString()} tokens（供應商回報）`
    : "供應商未回報用量";
}
export function readReply(
  provider: Provider,
  data: unknown,
  api?: CompatibleAPI,
): AIReply {
  const value = obj(data);
  let text = "",
    incomplete = false,
    usage = "";
  if (
    provider === "openai" ||
    (provider === "compatible" && api === "responses")
  ) {
    text = arr(value.output)
      .flatMap((item) => arr(obj(item).content))
      .map((part) => {
        const p = obj(part);
        return p.type === "output_text"
          ? str(p.text)
          : p.type === "refusal"
            ? str(p.refusal)
            : "";
      })
      .filter(Boolean)
      .join("\n\n");
    incomplete = value.status !== "completed";
    const u = obj(value.usage);
    usage = usageText(u.input_tokens, u.output_tokens);
  } else if (provider === "gemini") {
    const candidate = obj(arr(value.candidates)[0]);
    text = arr(obj(candidate.content).parts)
      .filter((p) => obj(p).thought !== true)
      .map((p) => str(obj(p).text))
      .join("\n");
    incomplete = candidate.finishReason !== "STOP";
    const u = obj(value.usageMetadata);
    usage = usageText(u.promptTokenCount, u.candidatesTokenCount);
  } else {
    const choice = obj(arr(value.choices)[0]);
    const content = obj(choice.message).content;
    text =
      typeof content === "string"
        ? content
        : arr(content)
            .map((p) => str(obj(p).text))
            .join("\n");
    incomplete = choice.finish_reason !== "stop";
    const u = obj(value.usage);
    usage = usageText(u.prompt_tokens, u.completion_tokens);
  }
  if (!text.trim())
    throw new Error(
      "供應商沒有傳回文字（可能遭內容篩選或額度不足）。請調整問題或模型設定。",
    );
  return { text, incomplete, usage };
}

export async function askAI(
  config: AIConfig,
  system: string,
  messages: Message[],
  signal: AbortSignal,
): Promise<AIReply> {
  const request = prepareRequest(config, system, messages);
  const parsed = await requestJSON(
    config,
    request.endpoint,
    signal,
    request.serialized,
  );
  const reply = readReply(config.provider, parsed, config.api);
  return { ...reply, text: redactKey(reply.text, config.key) };
}

async function requestJSON(
  config: AIConfig,
  endpoint: string,
  signal: AbortSignal,
  body?: string,
): Promise<unknown> {
  const headers: Record<string, string> = body
    ? { "Content-Type": "application/json" }
    : {};
  if (config.key.trim())
    headers[config.provider === "gemini" ? "x-goog-api-key" : "Authorization"] =
      config.provider === "gemini"
        ? config.key.trim()
        : `Bearer ${config.key.trim()}`;
  let response: Response;
  try {
    const options: RequestInit & { targetAddressSpace?: "local" | "loopback" } =
      {
        method: body ? "POST" : "GET",
        body,
        headers,
        signal,
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        referrerPolicy: "no-referrer",
      };
    if (config.provider === "compatible" && config.network)
      options.targetAddressSpace = config.network;
    response = await fetch(endpoint, options);
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(
      "無法連線，請檢查 API 網址、CORS 與瀏覽器的區域網路權限。HTTPS 網頁連到 HTTP 服務也可能受到混合內容限制。",
    );
  }
  if (!response.ok) {
    const reason =
      response.status === 401 || response.status === 403
        ? "金鑰、模型權限或來源限制不符"
        : response.status === 429
          ? "額度不足或請求過於頻繁"
          : response.status === 400 || response.status === 404
            ? "模型 ID、API 模式或參數不支援，請依供應商文件檢查設定"
            : response.status >= 500
              ? "供應商暫時無法服務"
              : "請求未被接受";
    throw new Error(`API ${response.status}：${reason}。未自動重送。`);
  }
  // Bound even a faulty compatible server's response without logging its body.
  const reader = response.body?.getReader();
  if (!reader) throw new Error("API 沒有傳回內容。");
  const decoder = new TextDecoder();
  let raw = "",
    size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 1_000_000)
        throw new Error("API 回覆超過 1 MB，請縮小請求範圍。");
      raw += decoder.decode(chunk.value, { stream: true });
    }
    raw += decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "API 回覆不是有效 JSON，請確認使用正確的文字對話 API 路徑。",
    );
  }
  return parsed;
}

export interface AIModel {
  id: string;
  label: string;
}
export const MODEL_TIMEOUT = 20_000;
export function modelsEndpointFor(config: AIConfig): string {
  if (config.provider === "openai") return "https://api.openai.com/v1/models";
  if (config.provider === "gemini")
    return "https://generativelanguage.googleapis.com/v1beta/models";
  return new URL("models", compatibleBaseURL(config)).href;
}
export async function listModels(
  config: AIConfig,
  signal: AbortSignal,
): Promise<AIModel[]> {
  if (config.provider !== "compatible" && !config.key.trim())
    throw new Error("請先填入自己的 API Key 再取得模型清單。");
  const endpoint = modelsEndpointFor(config);
  const models = new Map<string, AIModel>();
  const seenTokens = new Set<string>();
  let pageToken = "";
  for (let page = 0; page < 10; page++) {
    const url = new URL(endpoint);
    if (config.provider === "gemini") {
      url.searchParams.set("pageSize", "1000");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
    }
    const data = obj(await requestJSON(config, url.href, signal));
    const entries = config.provider === "gemini" ? data.models : data.data;
    if (!Array.isArray(entries))
      throw new Error(
        "模型清單格式不符；服務可能未提供標準 models API，可改為手動輸入模型 ID。",
      );
    for (const entry of entries) {
      const model = obj(entry);
      if (
        config.provider === "gemini" &&
        !arr(model.supportedGenerationMethods).includes("generateContent")
      )
        continue;
      const id = str(config.provider === "gemini" ? model.name : model.id)
        .trim()
        .replace(config.provider === "gemini" ? /^models\// : /$^/, "");
      if (
        !id ||
        id.length > 512 ||
        (config.key.trim() && id.includes(config.key.trim()))
      )
        continue;
      const name = redactKey(str(model.displayName).slice(0, 200), config.key);
      models.set(id, {
        id,
        label: name && name !== id ? `${name} · ${id}` : id,
      });
    }
    const next = config.provider === "gemini" ? str(data.nextPageToken) : "";
    if (config.provider !== "gemini" && data.has_more === true)
      throw new Error(
        "此相容服務的模型清單需要非標準分頁，請手動輸入模型 ID。",
      );
    if (!next) {
      if (!models.size)
        throw new Error(
          "沒有取得可用模型；請確認帳號權限，或手動輸入模型 ID。Gemini 僅列出支援 generateContent 的模型。",
        );
      return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
    }
    if (seenTokens.has(next) || page === 9)
      throw new Error("模型分頁未能完整取得，請稍後重試或手動輸入模型 ID。");
    seenTokens.add(next);
    pageToken = next;
  }
  return [];
}
