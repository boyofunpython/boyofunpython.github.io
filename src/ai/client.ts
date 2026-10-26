export type Provider = "openai" | "compatible" | "gemini";
export interface AIConfig {
  provider: Provider;
  endpoint: string;
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

export function endpointFor(config: AIConfig) {
  if (config.provider === "openai")
    return "https://api.openai.com/v1/responses";
  if (config.provider === "gemini")
    return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model.trim().replace(/^models\//, ""))}:generateContent`;
  let url: URL;
  try {
    url = new URL(config.endpoint.trim());
  } catch {
    throw new Error("請填寫完整的 Chat Completions API 網址。");
  }
  if (
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "API 網址需使用 HTTPS（本機可用 HTTP），且不可包含帳密、查詢參數或 #。",
    );
  return url.href;
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
  if (config.provider === "openai")
    body = {
      model,
      instructions,
      input: cleaned,
      max_output_tokens: config.tokenLimit,
      store: false,
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
export function readReply(provider: Provider, data: unknown): AIReply {
  const value = obj(data);
  let text = "",
    incomplete = false,
    usage = "";
  if (provider === "openai") {
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
    incomplete = value.status === "incomplete" || value.status === "failed";
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
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.key.trim())
    headers[config.provider === "gemini" ? "x-goog-api-key" : "Authorization"] =
      config.provider === "gemini"
        ? config.key.trim()
        : `Bearer ${config.key.trim()}`;
  let response: Response;
  try {
    response = await fetch(request.endpoint, {
      method: "POST",
      body: request.serialized,
      headers,
      signal,
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(
      "無法連線，請檢查網路、API 網址及供應商是否允許瀏覽器 CORS 請求。請勿使用陌生代理轉送金鑰。",
    );
  }
  if (!response.ok) {
    const reason =
      response.status === 401 || response.status === 403
        ? "金鑰、模型權限或來源限制不符"
        : response.status === 429
          ? "額度不足或請求過於頻繁"
          : response.status === 400 || response.status === 404
            ? "模型 ID、API 路徑或參數不支援；相容服務可調整 token 參數"
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
        throw new Error("API 回覆過大，請降低輸出 tokens 上限。");
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
  const reply = readReply(config.provider, parsed);
  return { ...reply, text: redactKey(reply.text, config.key) };
}
