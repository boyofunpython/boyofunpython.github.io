import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import {
  AI_TIMEOUT,
  askAI,
  endpointFor,
  prepareRequest,
  readReply,
  listModels,
  modelsEndpointFor,
  MODEL_TIMEOUT,
  type AIConfig,
  type Provider,
} from "../src/ai/client";
import { formatPolicy } from "../src/ai/policy";

const FAKE_KEY = "test-only-not-a-real-api-key";
const config: AIConfig = {
  provider: "openai",
  key: FAKE_KEY,
  model: "mock-model",
  endpoint: "",
  tokenLimit: 2048,
  chatTokenField: "max_tokens",
};
const source = "print('original')\n";
const pythonAnswer =
  "先讀懂迴圈，再試試。\n\n```python\nprint('AI example')\n```";
const openaiReply = (text = pythonAnswer) => ({
  status: "completed",
  output: [
    { type: "reasoning", summary: [] },
    { type: "message", content: [{ type: "output_text", text }] },
  ],
  usage: { input_tokens: 80, output_tokens: 30 },
});

test("model discovery preserves gateway paths, handles Gemini pages, and rejects invalid results", async () => {
  for (const endpoint of [
    "http://192.168.1.20:11434/v1/chat/completions",
    "http://llm.local:8000/api/v1/chat/completions/",
    "http://10.0.0.5/v1/chat/completions",
    "http://[fd00::1234]:8000/v1/chat/completions",
  ]) {
    expect(endpointFor({ ...config, provider: "compatible", endpoint })).toBe(
      new URL(endpoint).href,
    );
    expect(
      modelsEndpointFor({ ...config, provider: "compatible", endpoint }),
    ).toBe(
      new URL(endpoint).href.replace(/\/chat\/completions\/?$/, "/models"),
    );
  }
  expect(modelsEndpointFor(config)).toBe("https://api.openai.com/v1/models");
  const original = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = async (url, options) => {
      expect(String(url)).toContain(
        "https://generativelanguage.googleapis.com/v1beta/models?",
      );
      expect(String(url)).not.toContain(FAKE_KEY);
      expect(options).toMatchObject({
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        headers: { "x-goog-api-key": FAKE_KEY },
      });
      if (calls++ === 0)
        return Response.json({
          models: [
            {
              name: "models/mock-b",
              displayName: "Model B",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/embed",
              supportedGenerationMethods: ["embedContent"],
            },
          ],
          nextPageToken: "page 2 & next",
        });
      expect(new URL(String(url)).searchParams.get("pageToken")).toBe(
        "page 2 & next",
      );
      return Response.json({
        models: [
          {
            name: "models/mock-a",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/mock-b",
            supportedGenerationMethods: ["generateContent"],
          },
        ],
      });
    };
    expect(
      (
        await listModels(
          { ...config, provider: "gemini", model: "" },
          new AbortController().signal,
        )
      ).map((m) => m.id),
    ).toEqual(["mock-a", "mock-b"]);
    expect(calls).toBe(2);
    globalThis.fetch = async () => Response.json({ data: [] });
    await expect(
      listModels(config, new AbortController().signal),
    ).rejects.toThrow(/沒有取得可用模型/);
    globalThis.fetch = async () => Response.json({ unrelated: [] });
    await expect(
      listModels(config, new AbortController().signal),
    ).rejects.toThrow(/格式不符/);
    globalThis.fetch = async () =>
      Response.json({ models: [], nextPageToken: "same-token" });
    await expect(
      listModels(
        { ...config, provider: "gemini" },
        new AbortController().signal,
      ),
    ).rejects.toThrow(/分頁/);
    await expect(
      listModels({ ...config, key: "" }, new AbortController().signal),
    ).rejects.toThrow(/API Key/);
  } finally {
    globalThis.fetch = original;
  }
});

test("provider model selection sends only GET metadata and handles key changes, failures and timeout", async ({
  page,
}) => {
  await start(page);
  await settings(page);
  await page.getByRole("button", { name: "連線設定", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "AI 連線設定" });
  let calls = 0;
  await page.route("https://api.openai.com/v1/models", async (route) => {
    calls++;
    expect(route.request().method()).toBe("GET");
    expect(route.request().postData()).toBeNull();
    expect(route.request().headers().authorization).toBe(`Bearer ${FAKE_KEY}`);
    await route.fulfill(
      calls === 1
        ? {
            json: {
              data: [{ id: "mock-b" }, { id: "mock-a" }, { id: "mock-a" }],
            },
          }
        : { status: 401, json: { error: FAKE_KEY } },
    );
  });
  await dialog
    .getByRole("button", { name: "取得模型清單", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("2 個模型");
  await expect(dialog.getByLabel("模型 ID", { exact: true })).toHaveValue(
    "mock-model",
  );
  await dialog
    .getByRole("combobox", { name: "選擇供應商模型" })
    .selectOption("mock-a");
  await expect(dialog.getByLabel("模型 ID", { exact: true })).toHaveValue(
    "mock-a",
  );
  const scan = await new AxeBuilder({ page }).include(".ai-settings").analyze();
  expect(scan.violations).toEqual([]);
  await page.screenshot({ path: "artifacts/ai-provider-model-list.png" });
  await dialog
    .getByRole("button", { name: "取得模型清單", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("API 401");
  await expect(dialog.getByRole("alert")).not.toContainText(FAKE_KEY);
  await expect(dialog.getByLabel("模型 ID", { exact: true })).toHaveValue(
    "mock-a",
  );
  expect(calls).toBe(2);
  await page.unroute("https://api.openai.com/v1/models");
  await page.route("https://api.openai.com/v1/models", async (route) => {
    await new Promise((r) => setTimeout(r, 400));
    await route
      .fulfill({ json: { data: [{ id: "stale-model" }] } })
      .catch(() => {});
  });
  await dialog
    .getByRole("button", { name: "取得模型清單", exact: true })
    .click();
  await dialog.getByLabel("API Key", { exact: false }).fill("changed-test-key");
  await expect(
    dialog.getByRole("combobox", { name: "選擇供應商模型" }),
  ).toHaveCount(0);
  // A late response from the old key must not repopulate the list.
  await expect(
    dialog.getByRole("button", { name: "取得模型清單", exact: true }),
  ).toBeEnabled();
  await page.clock.install();
  await dialog
    .getByRole("button", { name: "取得模型清單", exact: true })
    .click();
  await page.clock.fastForward(MODEL_TIMEOUT + 1);
  await expect(dialog.getByRole("alert")).toContainText("超過 20 秒");
  await expect(
    dialog.getByRole("combobox", { name: "選擇供應商模型" }),
  ).toHaveCount(0);
});

test("Gemini UI lists paginated generateContent models without choosing a model automatically", async ({
  page,
}) => {
  await start(page);
  await settings(page, "gemini");
  await page.getByRole("button", { name: "連線設定", exact: true }).click();
  await page.route(
    "https://generativelanguage.googleapis.com/v1beta/models?*",
    async (route) => {
      const next = new URL(route.request().url()).searchParams.get("pageToken");
      expect(route.request().headers()["x-goog-api-key"]).toBe(FAKE_KEY);
      await route.fulfill({
        json: next
          ? {
              models: [
                {
                  name: "models/mock-second",
                  displayName: "Second",
                  supportedGenerationMethods: ["generateContent"],
                },
              ],
            }
          : {
              models: [
                {
                  name: "models/embed-only",
                  supportedGenerationMethods: ["embedContent"],
                },
                {
                  name: "models/mock-first",
                  supportedGenerationMethods: ["generateContent"],
                },
              ],
              nextPageToken: "next",
            },
      });
    },
  );
  const dialog = page.getByRole("dialog", { name: "AI 連線設定" });
  await dialog
    .getByRole("button", { name: "取得模型清單", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("2 個模型");
  await expect(dialog.getByRole("option", { name: "embed-only" })).toHaveCount(
    0,
  );
  await dialog
    .getByRole("combobox", { name: "選擇供應商模型" })
    .selectOption("mock-second");
  await expect(dialog.getByLabel("模型 ID", { exact: true })).toHaveValue(
    "mock-second",
  );
});

test("a real local HTTP provider lists models and accepts chat without an API key", async ({
  page,
}) => {
  const requests: { method: string; url: string; authorization?: string }[] =
    [];
  const server = createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:4187");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    requests.push({
      method: req.method!,
      url: req.url!,
      authorization: req.headers.authorization,
    });
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify(
        req.method === "GET"
          ? { data: [{ id: "local-python-model" }] }
          : {
              choices: [
                {
                  message: { content: "本機 HTTP 模型已回覆。" },
                  finish_reason: "stop",
                },
              ],
            },
      ),
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    const address = server.address();
    if (!address || typeof address === "string")
      throw Error("missing server port");
    await start(page);
    await page
      .getByRole("button", { name: "設定自己的 API Key", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "AI 連線設定" });
    await dialog
      .getByRole("combobox", { name: "AI 服務", exact: true })
      .selectOption("compatible");
    await dialog
      .getByLabel("完整 API 網址", { exact: false })
      .fill(`http://127.0.0.1:${address.port}/gateway/v1/chat/completions`);
    await dialog
      .getByRole("combobox", { name: "服務位置", exact: true })
      .selectOption("loopback");
    await dialog
      .getByRole("button", { name: "取得模型清單", exact: true })
      .click();
    await dialog
      .getByRole("combobox", { name: "選擇供應商模型" })
      .selectOption("local-python-model");
    await dialog.getByRole("button", { name: "完成設定", exact: true }).click();
    await question(page).fill("本機測試");
    await send(page);
    await expect(page.locator(".ai-answer")).toContainText(
      "本機 HTTP 模型已回覆。",
    );
    expect(requests).toEqual([
      { method: "GET", url: "/gateway/v1/models", authorization: undefined },
      {
        method: "POST",
        url: "/gateway/v1/chat/completions",
        authorization: undefined,
      },
    ]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});
async function start(page: Page) {
  await page.addInitScript(
    ({ source }) => {
      localStorage.setItem(
        "boyo-studio-v1",
        JSON.stringify({
          activeId: "main",
          files: [
            { id: "main", name: "main.py", code: source },
            {
              id: "private",
              name: "unshared.py",
              code: "PRIVATE_UNSHARED_FILE",
            },
          ],
        }),
      );
    },
    { source },
  );
  await page.goto("/#/assistant");
  await expect(
    page.getByRole("heading", { name: "AI 助教", exact: true }),
  ).toBeVisible();
}
async function settings(page: Page, provider: Provider = "openai") {
  await page
    .getByRole("button", { name: /連線設定|設定自己的 API Key/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "AI 連線設定", exact: true });
  await dialog
    .getByRole("combobox", { name: "AI 服務", exact: true })
    .selectOption(provider);
  if (provider === "compatible")
    await dialog
      .getByLabel("完整 API 網址", { exact: false })
      .fill("https://ai.example.test/v1/chat/completions");
  await dialog.getByLabel("模型 ID", { exact: true }).fill("mock-model");
  await dialog.getByLabel("API Key", { exact: false }).fill(FAKE_KEY);
  await dialog.getByRole("button", { name: "完成設定", exact: true }).click();
}
const question = (page: Page) =>
  page.getByRole("textbox", { name: "問題或教學需求", exact: true });
const send = (page: Page) =>
  page.getByRole("button", { name: "送出", exact: true }).click();

test("API contracts, endpoint restrictions, response parsing and portable policy", async () => {
  const messages = [{ role: "user" as const, content: `help ${FAKE_KEY}` }];
  const openai = prepareRequest(config, "rules", messages);
  expect(openai.body).toMatchObject({
    model: "mock-model",
    instructions: "rules",
    store: false,
    max_output_tokens: 2048,
    input: [{ role: "user", content: "help [已移除 API Key]" }],
  });
  expect(openai.serialized).not.toContain(FAKE_KEY);
  expect(readReply("openai", openaiReply()).text).toBe(pythonAnswer);
  expect(
    readReply("openai", { ...openaiReply(), status: "incomplete" }).incomplete,
  ).toBe(true);
  expect(
    readReply("openai", {
      status: "completed",
      output: [{ content: [{ type: "refusal", refusal: "無法提供" }] }],
    }).text,
  ).toBe("無法提供");
  const compatible = prepareRequest(
    {
      ...config,
      provider: "compatible",
      endpoint: "https://ai.example.test/v1/chat/completions",
      chatTokenField: "max_completion_tokens",
    },
    "rules",
    messages,
  );
  expect(compatible.body).toMatchObject({
    max_completion_tokens: 2048,
    messages: [
      { role: "system", content: "rules" },
      { role: "user", content: "help [已移除 API Key]" },
    ],
  });
  expect(
    readReply("compatible", {
      choices: [{ message: { content: "partial" }, finish_reason: "length" }],
    }).incomplete,
  ).toBe(true);
  const gemini = prepareRequest(
    { ...config, provider: "gemini", model: "models/mock-model" },
    "rules",
    [
      ...messages,
      { role: "assistant", content: "previous" },
      { role: "user", content: "next" },
    ],
  );
  expect(gemini.endpoint).toBe(
    "https://generativelanguage.googleapis.com/v1beta/models/mock-model:generateContent",
  );
  expect(gemini.body).toMatchObject({
    store: false,
    systemInstruction: { parts: [{ text: "rules" }] },
    generationConfig: { maxOutputTokens: 2048 },
    contents: [{ role: "user" }, { role: "model" }, { role: "user" }],
  });
  expect(
    readReply("gemini", {
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [{ thought: true, text: "internal" }, { text: "visible" }],
          },
        },
      ],
    }).text,
  ).toBe("visible");
  expect(() =>
    readReply("gemini", { promptFeedback: { blockReason: "SAFETY" } }),
  ).toThrow(/沒有傳回文字/);
  expect(() =>
    prepareRequest(config, "r", [{ role: "user", content: "a".repeat(80001) }]),
  ).toThrow(/過長/);
  for (const endpoint of [
    "https://user:pass@example.com/v1",
    "https://example.com/v1?key=x",
    "https://example.com/v1#x",
    "file:///tmp/a",
    "javascript:alert(1)",
  ])
    expect(() =>
      endpointFor({ ...config, provider: "compatible", endpoint }),
    ).toThrow();
  expect(
    endpointFor({
      ...config,
      provider: "compatible",
      endpoint: "http://127.0.0.1:11434/v1/chat/completions",
    }),
  ).toContain("127.0.0.1");
  const template = await readFile("src/ai/python-system.txt", "utf8");
  const generated = await readFile("dist/ai/python-system.txt", "utf8");
  expect(generated).toBe(formatPolicy(template));
  expect(generated).not.toContain("{{");
  for (const rule of [
    "30 秒",
    "90 秒",
    "100,000",
    "display",
    "plt.show()",
    "turtle.done()",
    "input()",
    "頂層 await",
    "CORS",
    "PyPI",
    "import",
  ])
    expect(generated).toContain(rule);
});

test("OpenAI request is opt-in, preview is exact, keys stay in memory, code can be reviewed and applied", async ({
  page,
}) => {
  await start(page);
  let calls = 0;
  await page.route("https://api.openai.com/v1/responses", async (route) => {
    calls++;
    expect(route.request().headers().authorization).toBe(`Bearer ${FAKE_KEY}`);
    const body = route.request().postDataJSON();
    expect(body.store).toBe(false);
    expect(body.instructions).toContain("給我提示");
    expect(body.input.at(-1).content).toContain(source.trim());
    expect(route.request().postData()).not.toContain(FAKE_KEY);
    expect(route.request().postData()).not.toContain("PRIVATE_UNSHARED_FILE");
    await route.fulfill({ json: openaiReply() });
  });
  await settings(page);
  expect(calls).toBe(0);
  await question(page).fill(`請提示我 ${FAKE_KEY}`);
  await page.getByRole("button", { name: "預覽送出內容", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "預覽實際送出內容" });
  await expect(preview).toContainText("store");
  await expect(preview).toContainText("[已移除 API Key]");
  await expect(preview).not.toContainText(FAKE_KEY);
  expect(calls).toBe(0);
  await preview.getByRole("button", { name: "關閉視窗", exact: true }).click();
  await send(page);
  await expect(
    page.getByText("先讀懂迴圈，再試試。", { exact: true }),
  ).toBeVisible();
  expect(calls).toBe(1);
  await expect(page.locator(".ai-usage")).toContainText("80");
  const stored = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  );
  expect(stored).not.toContain(FAKE_KEY);
  expect(stored).not.toContain("請提示我");
  expect(stored).toContain("original");
  await page.getByRole("button", { name: "檢查語法", exact: true }).click();
  await expect(
    page.getByText("語法可解析，尚未執行。", { exact: true }),
  ).toBeVisible({ timeout: 90000 });
  await page.getByRole("button", { name: "預覽套用", exact: true }).click();
  const review = page.getByRole("dialog", { name: "預覽套用 AI 程式" });
  await expect(review).toContainText("original");
  await expect(review).toContainText("AI example");
  await review
    .getByRole("button", { name: "確認取代目前檔案", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Python 程式碼", exact: true }),
  ).toContainText("AI example");
  await expect(
    page.getByRole("dialog", { name: "執行結果", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "AI 助教", exact: true }).click();
  await expect(page.locator(".ai-answer")).toContainText("先讀懂");
  await page.reload();
  await expect(page.locator(".ai-answer")).toHaveCount(0);
  await page
    .getByRole("button", { name: "設定自己的 API Key", exact: true })
    .click();
  await expect(page.getByLabel("API Key", { exact: false })).toHaveValue("");
});

test("Gemini teacher request, isolated modes, new-file workflow and safe Markdown", async ({
  page,
}) => {
  await start(page);
  let body: Record<string, unknown> = {};
  let calls = 0;
  await page.route(
    "https://generativelanguage.googleapis.com/**",
    async (route) => {
      calls++;
      body = route.request().postDataJSON();
      expect(route.request().headers()["x-goog-api-key"]).toBe(FAKE_KEY);
      expect(route.request().url()).not.toContain(FAKE_KEY);
      expect(route.request().headers().authorization).toBeUndefined();
      await route.fulfill({
        json: {
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  {
                    text: `教師參考\n\n${pythonAnswer}\n\n<script>window.aiUnsafe=1</script>\n\n[危險](javascript:alert(1))\n\n![追蹤](https://tracking.example/pixel)`,
                  },
                ],
              },
            },
          ],
          usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 60 },
        },
      });
    },
  );
  await settings(page, "gemini");
  await page.getByRole("button", { name: "我是教師", exact: true }).click();
  await page.getByLabel("附上目前程式", { exact: true }).uncheck();
  await question(page).fill("設計一堂課");
  await send(page);
  await expect(page.locator(".ai-answer")).toContainText("教師參考");
  expect(JSON.stringify(body)).toContain("教學目標");
  expect(JSON.stringify(body)).not.toContain("original");
  expect(JSON.stringify(body)).not.toContain("PRIVATE_UNSHARED_FILE");
  expect(calls).toBe(1);
  await expect(
    page.locator(".ai-answer script, .ai-answer img, .ai-answer iframe"),
  ).toHaveCount(0);
  expect(await page.evaluate(() => "aiUnsafe" in window)).toBe(false);
  expect(await page.locator(".ai-answer a").getAttribute("href")).toBe("");
  await page.getByRole("button", { name: "我是學生", exact: true }).click();
  await expect(page.locator(".ai-answer")).toHaveCount(0);
  await page.getByRole("button", { name: "我是教師", exact: true }).click();
  await expect(page.locator(".ai-answer")).toHaveCount(1);
  await page.getByRole("button", { name: "另存新檔", exact: true }).click();
  await expect(page.getByLabel("目前檔案", { exact: true })).toContainText(
    "ai_example.py",
  );
  const workspace = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("boyo-studio-v1")!),
  );
  expect(
    workspace.files.find((f: { id: string }) => f.id === "main").code,
  ).toBe(source);
  expect(workspace.files).toHaveLength(3);
});

test("compatible protocol, unchanged-file guard, partial reply and no automatic retry", async ({
  page,
}) => {
  await start(page);
  await settings(page, "compatible");
  let calls = 0;
  await page.route("https://ai.example.test/**", async (route) => {
    calls++;
    const body = route.request().postDataJSON();
    expect(body.messages[0].role).toBe("system");
    expect(body.max_tokens).toBe(2048);
    await route.fulfill(
      calls === 1
        ? {
            json: {
              choices: [
                { message: { content: pythonAnswer }, finish_reason: "stop" },
              ],
            },
          }
        : calls === 2
          ? {
              json: {
                choices: [
                  {
                    message: { content: pythonAnswer },
                    finish_reason: "length",
                  },
                ],
              },
            }
          : { status: 401, json: { error: { message: FAKE_KEY } } },
    );
  });
  await question(page).fill("協助寫程式");
  await send(page);
  await expect(page.locator(".ai-answer")).toHaveCount(1);
  await page.getByRole("link", { name: "返回編輯器", exact: true }).click();
  await page.getByRole("button", { name: "程式碼", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Python 程式碼", exact: true })
    .fill("print('my newer edit')");
  await page.getByRole("link", { name: "AI 助教", exact: true }).click();
  await page.getByRole("button", { name: "預覽套用", exact: true }).click();
  const review = page.getByRole("dialog", { name: "預覽套用 AI 程式" });
  await expect(
    review.getByRole("button", { name: "確認取代目前檔案", exact: true }),
  ).toBeDisabled();
  await expect(review).toContainText("檔案已切換或修改");
  await review.getByRole("button", { name: "關閉視窗", exact: true }).click();
  await question(page).fill("再給一份");
  await send(page);
  await expect(page.locator(".ai-answer")).toHaveCount(2);
  await expect(
    page
      .locator(".ai-answer")
      .last()
      .getByRole("button", { name: "另存新檔", exact: true }),
  ).toBeDisabled();
  await question(page).fill("第三次");
  await send(page);
  await expect(page.getByRole("alert")).toContainText("API 401");
  await expect(page.getByRole("alert")).not.toContainText(FAKE_KEY);
  expect(calls).toBe(3);
  await page.getByRole("button", { name: "編輯後重送", exact: true }).click();
  await expect(question(page)).toHaveValue("第三次");
  expect(calls).toBe(3);
});

test("limits refuse requests, timeout/cancel is explicit, key clears on provider and endpoint changes", async ({
  page,
}) => {
  await start(page);
  await settings(page);
  let calls = 0;
  await page.route("https://api.openai.com/v1/responses", async (route) => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({ json: openaiReply() }).catch(() => {});
  });
  await question(page).fill("x".repeat(4001));
  await send(page);
  await expect(page.getByRole("alert")).toContainText("4,000");
  expect(calls).toBe(0);
  await question(page).fill("等待測試");
  await page.clock.install();
  await send(page);
  await expect(
    page.getByRole("button", { name: "停止等待", exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(AI_TIMEOUT + 1);
  await expect(page.getByRole("alert")).toContainText("超過 90 秒");
  await page.getByRole("button", { name: "連線設定", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "AI 連線設定" });
  await dialog
    .getByRole("combobox", { name: "AI 服務", exact: true })
    .selectOption("compatible");
  await expect(dialog.getByLabel("API Key", { exact: false })).toHaveValue("");
  await dialog.getByLabel("API Key", { exact: false }).fill(FAKE_KEY);
  await dialog
    .getByLabel("完整 API 網址", { exact: false })
    .fill("https://different.example/v1/chat/completions");
  await expect(dialog.getByLabel("API Key", { exact: false })).toHaveValue("");
});

test("AI desktop/mobile layout, accessible controls and downloadable policy stay usable without a key", async ({
  page,
}) => {
  await start(page);
  const violations = await new AxeBuilder({ page })
    .include(".ai-view")
    .analyze();
  expect(violations.violations).toEqual([]);
  await page.screenshot({ path: "artifacts/ai-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "環境規範", exact: true }).click();
  const guide = page.getByRole("dialog", { name: "Python 環境與 AI 系統指令" });
  await expect(guide).toContainText("turtle.done()");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    guide.getByRole("button", { name: "下載系統指令", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("boyo-python-system.txt");
  await guide.getByRole("button", { name: "關閉視窗", exact: true }).click();
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 640 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.getByRole("button", { name: "環境規範", exact: true }).click();
    await expect(guide).toContainText("turtle.done()");
    await guide.getByRole("button", { name: "關閉視窗", exact: true }).click();
    const bounds = await question(page).boundingBox();
    expect(bounds).toBeTruthy();
    expect(bounds!.y + bounds!.height).toBeLessThan(viewport.height);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "模式與附帶資料", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "我是教師", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "模式與附帶資料", exact: true })
      .click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/ai-mobile.png", fullPage: true });
  const mobile = await new AxeBuilder({ page }).include(".ai-view").analyze();
  expect(mobile.violations).toEqual([]);
});

test("adapter refuses malformed replies and safe transport does not use cookies or redirect", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (_input, options) => {
      expect(options).toMatchObject({
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        referrerPolicy: "no-referrer",
      });
      return new Response("not-json", { status: 200 });
    };
    await expect(
      askAI(
        config,
        "rules",
        [{ role: "user", content: "question" }],
        new AbortController().signal,
      ),
    ).rejects.toThrow(/不是有效 JSON/);
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: { message: FAKE_KEY } }), {
        status: 429,
      });
    await expect(
      askAI(
        config,
        "rules",
        [{ role: "user", content: "question" }],
        new AbortController().signal,
      ),
    ).rejects.toThrow(/API 429/);
  } finally {
    globalThis.fetch = original;
  }
});

test("text output is explicitly shared and history keeps at most three complete pairs", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("link", { name: "返回編輯器", exact: true }).click();
  await page.getByRole("button", { name: "執行程式", exact: false }).click();
  await expect(page.locator(".result-text")).toContainText("original", {
    timeout: 90000,
  });
  await page
    .getByRole("dialog", { name: "執行結果", exact: true })
    .getByRole("button", { name: "返回編輯器", exact: true })
    .first()
    .click();
  await page.getByRole("link", { name: "AI 助教", exact: true }).click();
  await settings(page);
  await page.getByLabel("附上目前程式", { exact: true }).uncheck();
  await page.getByLabel("附上最近執行文字／錯誤", { exact: true }).check();
  let calls = 0;
  await page.route("https://api.openai.com/v1/responses", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.input).toHaveLength(1 + 2 * Math.min(calls, 3));
    expect(body.input.at(-1).content).toContain(
      '"lastTextOutput": "original\\n"',
    );
    expect(body.input.at(-1).content).not.toContain('"python":');
    if (calls === 4) expect(body.input[0].content).toContain("第 2 題");
    calls++;
    await route.fulfill({ json: openaiReply(`第 ${calls} 次回答`) });
  });
  for (let i = 1; i <= 5; i++) {
    await question(page).fill(`第 ${i} 題`);
    await send(page);
    await expect(page.locator(".ai-answer").last()).toContainText(
      `第 ${i} 次回答`,
    );
  }
  expect(calls).toBe(5);
  await page
    .getByRole("button", { name: "清除目前模式對話", exact: true })
    .click();
  await expect(page.locator(".ai-answer")).toHaveCount(0);
});

test("service worker never caches authenticated or no-store requests", async ({
  page,
}) => {
  await start(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
  // Real local GETs preserve the browser's Request cache metadata.
  const result = await page.evaluate(async (key) => {
    const urls = ["auth", "google", "no-store"].map(
      (kind) =>
        new URL(`ai/python-system.txt?ai-cache-test-${kind}`, location.href)
          .href,
    );
    const bodies: string[] = [];
    for (const [i, url] of urls.entries()) {
      const response = await fetch(
        url,
        i === 0
          ? { headers: { Authorization: `Bearer ${key}` } }
          : i === 1
            ? { headers: { "x-goog-api-key": key } }
            : { cache: "no-store" },
      );
      bodies.push(await response.text());
    }
    const cached: string[] = [];
    for (const url of urls) if (await caches.match(url)) cached.push(url);
    return { cached, bodies };
  }, FAKE_KEY);
  expect(result.cached).toEqual([]);
  for (const body of result.bodies)
    expect(body).toContain("博幼 Python 練習室");
});
