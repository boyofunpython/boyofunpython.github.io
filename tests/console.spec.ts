import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function openConsole(page: Page) {
  await page.goto("/#/console");
  await expect(
    page.getByRole("textbox", { name: "Python Console 指令", exact: true }),
  ).toBeEnabled({ timeout: 90000 });
}
async function send(page: Page, code: string) {
  const area = page.getByRole("textbox", {
    name: /Python Console (續行)?指令/,
  });
  await expect(area).toBeEnabled();
  await area.fill(code);
  await area.press("Enter");
}
async function setFile(page: Page, code: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "程式碼", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Python 程式碼", exact: true })
    .fill(code);
}
const log = (page: Page) => page.getByRole("log", { name: "Console 紀錄" });

test("native console evaluates expressions, preserves variables and offers history/completion", async ({
  page,
}) => {
  await openConsole(page);
  await expect(page.locator(".runtime-badge")).toContainText("Python 3.14");
  await send(page, "alphabet = 42");
  await expect(
    page.getByRole("textbox", { name: "Python Console 指令", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("textbox", { name: "Python Console 指令", exact: true })
    .fill("alph");
  await page.keyboard.press("Control+Space");
  await expect(
    page.getByRole("textbox", { name: "Python Console 指令", exact: true }),
  ).toHaveValue("alphabet");
  await page.keyboard.press("Enter");
  await expect(page.locator(".entry-stdout").last()).toContainText("42");
  await expect(page.locator(".variables-list")).toContainText("alphabet");
  await page
    .getByRole("textbox", { name: "Python Console 指令", exact: true })
    .press("ArrowUp");
  await expect(
    page.getByRole("textbox", { name: "Python Console 指令", exact: true }),
  ).toHaveValue("alphabet");
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("textbox", { name: "Python Console 指令", exact: true }),
  ).toHaveValue("");
  await page
    .getByRole("button", { name: "清空 Console 畫面", exact: true })
    .click();
  await send(page, "alphabet + 1");
  await expect(page.locator(".entry-stdout").last()).toContainText("43");
  await page.screenshot({ path: "artifacts/console-desktop.png" });
  await page
    .getByRole("button", { name: "重設 Console 環境", exact: true })
    .click();
  await send(page, "alphabet");
  await expect(page.locator(".entry-stderr").last()).toContainText("NameError");
});

test("multiline functions accept real input and waiting time does not consume the run timeout", async ({
  page,
}) => {
  await openConsole(page);
  await send(page, 'def greet():\n    return input("你的名字：")');
  await expect(
    page.getByRole("textbox", { name: "Python Console 續行指令", exact: true }),
  ).toBeEnabled();
  await send(page, "");
  await expect(
    page.getByRole("textbox", { name: "Python Console 指令", exact: true }),
  ).toBeEnabled();
  await send(page, "greet()");
  const input = page.getByRole("textbox", {
    name: "Python 互動輸入",
    exact: true,
  });
  await expect(input).toBeFocused();
  await page.clock.install();
  await page.clock.fastForward(65000);
  await expect(input).toBeVisible();
  await input.fill("小博");
  await input.press("Enter");
  await expect(page.locator(".entry-stdout").last()).toContainText("'小博'");
  await expect(log(page)).toContainText("你的名字：小博");
});

test("workspace modal handles input in functions and loops, plus EOF without losing code", async ({
  page,
}) => {
  await setFile(
    page,
    'def ask():\n    return input("姓名：")\nfor i in range(2):\n    print(ask())',
  );
  await page.getByRole("button", { name: "執行程式", exact: false }).click();
  const dialog = page.getByRole("dialog", { name: "執行結果", exact: true });
  const input = dialog.getByRole("textbox", {
    name: "Python 互動輸入",
    exact: true,
  });
  await expect(input).toBeFocused({ timeout: 90000 });
  await input.fill("小博");
  await input.press("Enter");
  await expect(input).toHaveValue("");
  await input.fill("小幼");
  await input.press("Enter");
  await expect(dialog.locator(".result-label")).toContainText("執行完成");
  await expect(dialog.locator(".result-text")).toContainText("小博\n小幼");
  await dialog
    .getByRole("button", { name: "返回編輯器", exact: true })
    .first()
    .click();
  await expect(page.locator(".cm-content")).toContainText("return input");
  await setFile(page, 'input("結束輸入測試")');
  await page.getByRole("button", { name: "執行程式", exact: false }).click();
  await dialog
    .getByRole("button", { name: "結束輸入（EOF）", exact: true })
    .click();
  await expect(dialog.locator(".result-error")).toContainText("EOFError");
});

test("console turtle draws a genuine SVG and repeated commands keep the session", async ({
  page,
}) => {
  await openConsole(page);
  await send(
    page,
    "import turtle; turtle.tracer(0); turtle.forward(100); turtle.right(90); turtle.forward(100); turtle.done()",
  );
  await expect(page.frameLocator("iframe").locator("svg")).toBeVisible({
    timeout: 90000,
  });
  await expect(page.frameLocator("iframe").locator("svg")).toHaveAttribute(
    "viewBox",
    "0 0 500 500",
  );
  await send(page, "2 + 3");
  await expect(page.locator(".entry-stdout").last()).toContainText("5");
  await page.screenshot({ path: "artifacts/console-turtle.png" });
});

test("console can stop infinite programs, download its transcript and retain files", async ({
  page,
}) => {
  await setFile(page, "while True:\n    pass");
  await page.getByLabel("檔案操作", { exact: true }).click();
  await page
    .getByRole("button", { name: "開啟 Python Console", exact: true })
    .click();
  await page.getByRole("button", { name: "執行目前檔案", exact: true }).click();
  await page.getByRole("button", { name: "停止執行", exact: true }).click();
  await send(page, "6 * 7");
  await expect(page.locator(".entry-stdout").last()).toContainText("42");
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "下載 Console 紀錄", exact: true })
    .click();
  expect((await downloaded).suggestedFilename()).toContain("Console");
  await page.getByRole("link", { name: "返回編輯器", exact: false }).click();
  await expect(page.locator(".cm-content")).toContainText("while True:");
});

test("custom console works offline after the first complete load and legacy route redirects", async ({
  page,
  context,
}) => {
  await page.goto("/course/#ide");
  await expect(page).toHaveURL(/#\/console$/);
  await expect(
    page.getByRole("textbox", { name: "Python Console 指令", exact: true }),
  ).toBeEnabled({ timeout: 90000 });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await send(page, 'print("離線前")');
  await expect(log(page)).toContainText("離線前");
  await context.setOffline(true);
  await page.reload();
  await send(page, "6 * 7");
  await expect(page.locator(".entry-stdout").last()).toContainText("42", {
    timeout: 90000,
  });
});

test("console and input dialogs remain accessible on phones", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openConsole(page);
  const violations = [];
  violations.push(
    ...(
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  );
  await send(page, 'name = input("輸入名字：")');
  await expect(
    page.getByRole("textbox", { name: "Python 互動輸入", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "送出", exact: true }),
  ).toBeInViewport();
  violations.push(
    ...(
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  );
  await page.screenshot({ path: "artifacts/console-mobile-input.png" });
  await page
    .getByRole("textbox", { name: "Python 互動輸入", exact: true })
    .fill("小幼");
  await page.getByRole("button", { name: "送出", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Python Console 指令", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "顯示變數與提示", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "變數與提示", exact: true }),
  ).toBeVisible();
  violations.push(
    ...(
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  );
  expect(
    violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) })),
  ).toEqual([]);
});

test.describe("browser without JSPI", () => {
  test.use({ serviceWorkers: "block" });
  test("preset input preserves normal Python input semantics without stack switching", async ({
    page,
    context,
  }) => {
    await context.route("**/assets/worker-*.js", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body:
          "delete WebAssembly.Suspending; delete WebAssembly.promising;\n" +
          (await response.text()),
      });
    });
    await openConsole(page);
    await expect(
      page.getByRole("textbox", { name: "預先輸入", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "預先輸入", exact: true })
      .fill("小博\n12");
    await send(
      page,
      'name = input("名字："); age = input("年齡："); print(name, age)',
    );
    await expect(page.locator(".entry-stdout").last()).toContainText("小博 12");
  });
});
