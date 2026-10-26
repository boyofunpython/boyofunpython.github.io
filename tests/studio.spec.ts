import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFile } from "node:fs/promises";

async function editor(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "執行程式", exact: false }),
  ).toBeEnabled();
}
async function closeResults(page: Page) {
  const dialog = page.getByRole("dialog", { name: "執行結果", exact: true });
  if (await dialog.count())
    await dialog
      .getByRole("button", { name: "返回編輯器", exact: true })
      .first()
      .click();
}
async function selectFile(page: Page, name: string) {
  await closeResults(page);
  await page
    .getByLabel("目前檔案", { exact: true })
    .selectOption({ label: name });
}
async function fileAction(page: Page, name: string) {
  if (
    !(await page
      .locator(".file-menu")
      .evaluate((element) => (element as HTMLDetailsElement).open))
  )
    await page.getByLabel("檔案操作", { exact: true }).click();
  await page.getByRole("button", { name, exact: true }).click();
}

async function openNav(page: Page) {
  await closeResults(page);
  await page.getByRole("button", { name: "開啟選單", exact: true }).click();
}
async function setCode(page: Page, code: string) {
  await closeResults(page);
  await page.getByRole("button", { name: "程式碼", exact: true }).click();
  const input = page.getByRole("textbox", {
    name: "Python 程式碼",
    exact: true,
  });
  await input.fill(code);
  await expect(page.locator(".cm-content")).toContainText(
    code.split("\n").filter(Boolean).at(-1)!,
  );
}

test("Python executes, reports errors, stops loops and runs after resetting", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await editor(page);
  await page.screenshot({
    path: "artifacts/workspace-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "執行程式", exact: false }).click();
  await expect(page.locator(".result-text")).toContainText("哈囉，世界！", {
    timeout: 90000,
  });
  await setCode(page, 'print("<b>plain text</b>")\nprint(6 * 7)');
  await page.getByRole("button", { name: "執行程式", exact: false }).click();
  await expect(page.locator(".result-text")).toContainText("<b>plain text</b>");
  await expect(page.locator(".result-text")).toContainText("42");
  await setCode(page, "print(1 / 0)");
  await page.getByRole("button", { name: "執行程式", exact: false }).click();
  await expect(page.locator(".result-error")).toContainText(
    "ZeroDivisionError",
  );
  await setCode(page, "while True:\n    pass");
  await page.getByRole("button", { name: "執行程式", exact: false }).click();
  await expect(page.getByText("程式執行中…")).toBeVisible();
  await page.getByRole("button", { name: "停止執行", exact: true }).click();
  await expect(page.locator(".result-error")).toContainText("程式已停止");
  await setCode(page, 'print("recovered")');
  await page.getByRole("button", { name: "執行程式", exact: false }).click();
  await expect(page.locator(".result-text")).toContainText("recovered", {
    timeout: 90000,
  });
  expect(errors).toEqual([]);
});

test("files save across reloads, rename, import, export, and delete", async ({
  page,
}) => {
  await editor(page);
  await setCode(page, 'print("persisted main")');
  await page.getByRole("button", { name: "新增 Python 檔案" }).click();
  await page.getByLabel("檔案名稱").fill("第二支.py");
  await page.getByRole("button", { name: "建立檔案", exact: true }).click();
  await setCode(page, 'print("second file")');
  await selectFile(page, "main.py");
  await expect(page.locator(".cm-content")).toContainText("persisted main");
  await page.reload();
  await expect(page.locator(".cm-content")).toContainText("persisted main");
  await selectFile(page, "第二支.py");
  await expect(page.locator(".cm-content")).toContainText("second file");
  await page.getByLabel("檔案操作").click();
  await fileAction(page, "重新命名");
  await page.getByLabel("檔案名稱").fill("main.py");
  await page.getByRole("button", { name: "儲存名稱", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("這個檔名已經存在");
  await page.getByLabel("檔案名稱").fill("重新命名.py");
  await page.getByRole("button", { name: "儲存名稱", exact: true }).click();
  const download = page.waitForEvent("download");
  await fileAction(page, "下載 .py 檔案");
  expect((await download).suggestedFilename()).toBe("重新命名.py");
  await page.locator("input[type=file]").setInputFiles({
    name: "imported.py",
    mimeType: "text/plain",
    buffer: Buffer.from('print("imported")'),
  });
  await expect(page.locator(".cm-content")).toContainText("imported");
  await fileAction(page, "刪除檔案");
  await page.getByRole("button", { name: "確定刪除", exact: true }).click();
  await expect(
    page
      .getByLabel("目前檔案", { exact: true })
      .locator("option")
      .filter({ hasText: "imported.py" }),
  ).toHaveCount(0);
});

test("examples use client-side navigation, preserve editor, and synchronize blocks", async ({
  page,
}) => {
  await editor(page);
  await setCode(page, 'print("my original")');
  await page.getByRole("link", { name: "靈感範例", exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "從好奇開始，動手試試。" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "迴圈", exact: true }).click();
  await expect(page.locator(".example-card")).toHaveCount(1);
  await page.getByRole("button", { name: "開啟範例", exact: false }).click();
  await expect(page.locator(".cm-content")).toContainText("range(1, 11)");
  await page.getByRole("button", { name: "分割", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit text: range", exact: true }),
  ).toBeVisible({ timeout: 90000 });
  await page.getByRole("button", { name: "方塊", exact: true }).click();
  await expect(page.locator(".blocklySvg").first()).toBeVisible();
  await selectFile(page, "main.py");
  await page.getByRole("button", { name: "程式碼", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("my original");
  await page.getByRole("link", { name: "靈感範例", exact: false }).click();
  await page.screenshot({
    path: "artifacts/examples-desktop.png",
    fullPage: true,
  });
});

test("turtle draws a real SVG and output stays inside a sandbox", async ({
  page,
}) => {
  await editor(page);
  await setCode(
    page,
    'import turtle\npen = turtle.Turtle()\nfor side in range(4):\n    pen.forward(100)\n    pen.right(90)\nturtle.done()\nprint("畫完了")',
  );
  await page.getByRole("button", { name: "執行程式", exact: false }).click();
  await expect(page.locator(".result-label")).toBeVisible({ timeout: 90000 });
  await expect(page.locator(".result-label")).toContainText("執行完成");
  await expect(page.frameLocator("iframe").locator("svg")).toBeVisible();
  await expect(page.locator("iframe")).toHaveAttribute("sandbox", "");
  const svg = page.frameLocator("iframe").locator("svg");
  await expect(svg).toHaveAttribute("viewBox", "0 0 500 500");
  await expect(svg.locator("animate").first()).toHaveAttribute(
    "attributeName",
    "opacity",
  );
  await expect(page.locator(".result-text")).toContainText("畫完了");
  const progress = () =>
    svg.evaluate((element) => {
      const line = element.querySelectorAll("line")[1] as SVGLineElement;
      return line.x2.animVal.value;
    });
  await expect.poll(progress).toBeGreaterThan(99);
  await expect
    .poll(() =>
      svg.evaluate(
        (element) =>
          (element.querySelectorAll("line")[4] as SVGLineElement).y2.animVal
            .value,
      ),
    )
    .toBeLessThan(0.1);
  await page.getByRole("button", { name: "重播繪圖動畫", exact: true }).click();
  await expect.poll(progress).toBeLessThan(80);
  await expect.poll(progress).toBeGreaterThan(99);
  await page.getByRole("button", { name: "放大結果視窗", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "執行結果", exact: true }),
  ).toHaveClass(/is-expanded/);
  await expect(page.locator("iframe")).toHaveCount(1);
  await expect
    .poll(() =>
      svg.evaluate(
        (element) =>
          (element.querySelectorAll("line")[4] as SVGLineElement).y2.animVal
            .value,
      ),
    )
    .toBeLessThan(0.1);
  await page.screenshot({
    path: "artifacts/turtle-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await closeResults(page);
  await setCode(
    page,
    "import turtle\nturtle.tracer(0)\nturtle.forward(80)\nturtle.done()",
  );
  await page.getByRole("button", { name: "執行程式", exact: false }).click();
  await expect(page.frameLocator("iframe").locator("svg")).toBeVisible();
  await expect(page.frameLocator("iframe").locator("svg animate")).toHaveCount(
    0,
  );
});

test("mobile layout, keyboard and dialog interactions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await editor(page);
  await expect(
    page.getByRole("button", { name: "程式碼", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "開啟選單", exact: true }).click();
  await page
    .getByRole("dialog", { name: "選單與檔案" })
    .getByRole("button", { name: "使用小幫手", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "開啟選單", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await page.screenshot({
    path: "artifacts/workspace-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "開啟選單", exact: true }).click();
  await page.getByRole("link", { name: "一起學習", exact: true }).click();
  await page.getByRole("button", { name: "加入教室", exact: false }).click();
  await expect(page.getByRole("alert")).toContainText("請輸入連線 ID");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("accessibility checks for the application views", async ({ page }) => {
  await editor(page);
  await page.getByRole("button", { name: "程式碼", exact: true }).click();
  const report = [];
  for (const hash of ["#/", "#/examples", "#/classroom"]) {
    await page.goto("/" + hash);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    report.push({
      hash,
      violations: result.violations.map((v) => ({
        id: v.id,
        description: v.description,
        nodes: v.nodes.map((n) => ({
          html: n.html,
          summary: n.failureSummary,
        })),
      })),
    });
  }
  await writeFile(
    "artifacts/accessibility.json",
    JSON.stringify(report, null, 2),
  );
  expect(report.flatMap((r) => r.violations)).toEqual([]);
});

test("migrates legacy IndexedDB files without replacing them on another visit", async ({
  page,
}) => {
  await editor(page);
  await page.evaluate(async () => {
    const request = indexedDB.open("indexeddb-fs", 1);
    await new Promise<void>((resolve, reject) => {
      request.onupgradeneeded = () =>
        request.result.createObjectStore("files", { keyPath: "fullPath" });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction("files", "readwrite");
        for (const [name, data] of [
          ["main.py", 'print("legacy main")'],
          ["legacy.py", 'print("legacy second")'],
        ])
          transaction.objectStore("files").put({
            name,
            data,
            fullPath: "root/" + name,
            directory: "root",
            type: "file",
            createdAt: Date.now(),
          });
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
    });
    localStorage.removeItem("boyo-studio-v1");
  });
  await page.reload();
  await expect(
    page
      .getByLabel("目前檔案", { exact: true })
      .locator("option")
      .filter({ hasText: "legacy.py" }),
  ).toHaveCount(1);
  await selectFile(page, "main.py");
  await expect(page.locator(".cm-content")).toContainText("legacy main");
  await setCode(page, 'print("updated after migration")');
  await page.reload();
  await expect(page.locator(".cm-content")).toContainText(
    "updated after migration",
  );
});

test("console handoff carries the current file into the native console", async ({
  page,
}) => {
  await editor(page);
  await setCode(page, 'name = "course handoff"\nprint(name)');
  await fileAction(page, "開啟 Python Console");
  await expect(page).toHaveURL(/#\/console$/);
  await expect(
    page.getByRole("heading", { name: "博幼 Python Console", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "執行目前檔案", exact: true }).click();
  await expect(page.getByRole("log", { name: "Console 紀錄" })).toContainText(
    "course handoff",
    { timeout: 90000 },
  );
  await page
    .getByRole("textbox", { name: "Python Console 指令", exact: true })
    .fill("name");
  await page
    .getByRole("button", { name: "送出 Console 指令", exact: true })
    .click();
  await expect(page.locator(".entry-stdout").last()).toContainText(
    "'course handoff'",
  );
});

test.describe("classroom transport", () => {
  test.use({ serviceWorkers: "block" });
  test("classroom protocol sends current code and receives a separate file", async ({
    page,
  }) => {
    // Exercise the original wire protocol without contacting the production
    // signaling server or exposing any real classroom/student information.
    await page.route("**/assets/classroom-peer-*.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: `
    class Connection {
      constructor() { this.peer = 'test-student'; this.open = true; this.metadata = { name: '測試同學' }; this.handlers = {}; }
      on(name, callback) { this.handlers[name] = callback; }
      send(data) { window.testSent = data; }
      close() { this.open = false; this.handlers.close?.(); }
    }
    class Peer {
      constructor() { this.handlers = {}; window.testPeer = this; }
      on(name, callback) { this.handlers[name] = callback; if (name === 'open') setTimeout(() => callback('test-classroom-id'), 5); }
      destroy() { window.testDestroyed = true; window.testConnection?.close(); }
      connect() { return new Connection(); }
      addStudent() { const connection = new Connection(); window.testConnection = connection; this.handlers.connection(connection); connection.handlers.open(); }
    };
    export function createClassroomPeer() { return new Peer(); }
  `,
      }),
    );
    await editor(page);
    await setCode(page, 'print("teacher draft")');
    await openNav(page);
    await page.getByRole("link", { name: "一起學習", exact: true }).click();
    await page.getByRole("button", { name: "建立教室", exact: false }).click();
    await expect(page.getByText("教室已開啟，等待同學加入")).toBeVisible();
    await page.evaluate(() =>
      (
        window as unknown as { testPeer: { addStudent(): void } }
      ).testPeer.addStudent(),
    );
    await expect(page.getByText("已連線：1 位")).toBeVisible();
    await page
      .getByRole("button", { name: "傳送目前程式給同學", exact: true })
      .click();
    expect(
      await page.evaluate(
        () => (window as unknown as { testSent: unknown }).testSent,
      ),
    ).toEqual({ type: "teacherInfo", code: 'print("teacher draft")' });
    await page.evaluate(() =>
      (
        window as unknown as {
          testConnection: { handlers: { data(data: unknown): void } };
        }
      ).testConnection.handlers.data({
        type: "code",
        code: 'print("student response")',
      }),
    );
    await page.getByRole("button", { name: "另存並開啟", exact: true }).click();
    await expect(page.locator(".cm-content")).toContainText("student response");
    await selectFile(page, "main.py");
    await expect(page.locator(".cm-content")).toContainText("teacher draft");
    expect(
      await page.evaluate(() =>
        Boolean(
          (window as unknown as { testDestroyed?: boolean }).testDestroyed,
        ),
      ),
    ).toBe(false);
    await openNav(page);
    await page.getByRole("link", { name: "一起學習", exact: true }).click();
    await expect(page.getByLabel("連線 ID", { exact: true })).toHaveValue(
      "test-classroom-id",
    );
    await page.getByRole("button", { name: "結束連線", exact: true }).click();
    expect(
      await page.evaluate(() =>
        Boolean(
          (window as unknown as { testDestroyed?: boolean }).testDestroyed,
        ),
      ),
    ).toBe(true);
  });
});

test("warm Python runtime and workspace work after going offline", async ({
  page,
  context,
}) => {
  await editor(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await setCode(page, 'print("offline works")');
  await page.getByRole("button", { name: "執行程式", exact: false }).click();
  await expect(page.locator(".result-text")).toContainText("offline works", {
    timeout: 90000,
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".cm-content")).toContainText("offline works");
  await page.getByRole("button", { name: "執行程式", exact: false }).click();
  await expect(page.locator(".result-text")).toContainText("offline works", {
    timeout: 90000,
  });
});

test("editing a block updates Python and persists across reloads", async ({
  page,
}) => {
  await editor(page);
  await setCode(page, 'print("before")');
  await page.getByRole("button", { name: "方塊", exact: true }).click();
  await expect(page.locator(".block-sync-status")).toHaveCount(0, {
    timeout: 90000,
  });
  await page
    .getByRole("button", { name: "Edit text: before", exact: true })
    .click();
  await page.locator(".blocklyHtmlInput").fill("from blocks");
  await page.locator(".blocklyHtmlInput").press("Enter");
  await page.getByRole("button", { name: "程式碼", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("from blocks");
  await page.reload();
  await expect(page.locator(".cm-content")).toContainText("from blocks");
});

test("long-running Python times out and leaves the editor usable", async ({
  page,
}) => {
  await editor(page);
  await setCode(page, 'print("warmup")');
  await page.getByRole("button", { name: "執行程式", exact: false }).click();
  await expect(page.locator(".result-text")).toContainText("warmup", {
    timeout: 90000,
  });
  await page.clock.install();
  await setCode(page, "while True:\n    pass");
  await page.getByRole("button", { name: "執行程式", exact: false }).click();
  await expect(page.getByText("程式執行中…")).toBeVisible();
  await page.clock.fastForward(30001);
  await expect(page.locator(".result-error")).toContainText("執行超過 30 秒");
  await expect(
    page.getByRole("button", { name: "執行程式", exact: false }),
  ).toBeEnabled();
});
