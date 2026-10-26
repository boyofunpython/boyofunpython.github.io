import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFile } from "node:fs/promises";

const run = (page: Page) =>
  page
    .getByRole("banner")
    .getByRole("button", { name: "執行程式", exact: false });
const results = (page: Page) =>
  page.getByRole("dialog", { name: "執行結果", exact: true });
async function ready(page: Page) {
  await page.goto("/");
  await expect(run(page)).toBeEnabled();
}
async function code(page: Page, value: string) {
  await page.getByRole("button", { name: "程式碼", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Python 程式碼", exact: true })
    .fill(value);
}
async function closeResult(page: Page) {
  await results(page)
    .getByRole("button", { name: "返回編輯器", exact: true })
    .first()
    .click();
}

// The editor itself, rather than just its decorative container, must grow.
test("workspace fills desktop, tablet, phone and landscape viewports", async ({
  page,
}) => {
  await ready(page);
  const evidence = [];
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(() =>
        page
          .locator(".editor-surfaces")
          .evaluate((element) =>
            Math.abs(element.getBoundingClientRect().bottom - innerHeight + 28),
          ),
      )
      .toBeLessThan(4);
    const host = (await page.locator(".editor-surfaces").boundingBox())!;
    const cm = (await page.locator(".cm-editor").boundingBox())!;
    expect(host.width).toBe(viewport.width);
    expect(host.height / viewport.height).toBeGreaterThan(
      viewport.height < 450 ? 0.6 : 0.69,
    );
    const stacked = viewport.width < 675;
    await expect
      .poll(
        async () => (await page.locator(".cm-editor").boundingBox())!.height,
      )
      .toBeGreaterThan(host.height * (stacked ? 0.48 : 0.97));
    expect(cm.x + cm.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(
      await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      })),
    ).toEqual(viewport);
    await expect(run(page)).toBeInViewport({ ratio: 1 });
    await expect(page.getByLabel("目前檔案", { exact: true })).toBeInViewport({
      ratio: 1,
    });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    evidence.push({
      ...viewport,
      editor: host,
      editorRatio: host.height / viewport.height,
    });
    if (viewport.width === 1440 || viewport.width === 390)
      await page.screenshot({
        path: `artifacts/focused-${viewport.width}.png`,
        animations: "disabled",
      });
  }
  await writeFile(
    "artifacts/workspace-geometry.json",
    JSON.stringify(evidence, null, 2),
  );
});

test("drawer is hidden by default, traps focus, dismisses and opens a single file modal", async ({
  page,
}) => {
  await ready(page);
  const toggle = page.getByRole("button", { name: "開啟選單", exact: true });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("navigation", { name: "主要導覽" })).toHaveCount(
    0,
  );
  await toggle.click();
  const drawer = page.getByRole("dialog", { name: "選單與檔案", exact: true });
  await expect(drawer).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(
      await drawer.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await toggle.click();
  await page.mouse.click(900, 90);
  await expect(drawer).toHaveCount(0);
  await toggle.click();
  await drawer
    .getByRole("button", { name: "新增 Python 檔案", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(
    page.getByRole("dialog", { name: "新增 Python 檔案" }),
  ).toBeVisible();
  await expect(page.getByLabel("檔案名稱")).toBeFocused();
  await page.keyboard.press("Control+Enter");
  await expect(results(page)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(toggle).toBeFocused();
  await toggle.click();
  await drawer.getByRole("button", { name: "main.py", exact: true }).click();
  await expect(drawer).toHaveCount(0);
});

test("keyboard execution, modal focus, copying, history, clear and rerun", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await ready(page);
  await code(page, 'print("keyboard result")');
  const input = page.getByRole("textbox", {
    name: "Python 程式碼",
    exact: true,
  });
  await input.focus();
  await page.keyboard.press("Control+Enter");
  await expect(results(page)).toBeVisible();
  await expect(results(page).locator(".result-text")).toHaveText(
    "keyboard result\n",
    { timeout: 90000 },
  );
  await expect(
    results(page).getByRole("heading", { name: "執行結果", exact: true }),
  ).toBeFocused();
  await results(page)
    .getByRole("button", { name: "複製文字", exact: true })
    .click();
  await expect(
    results(page).getByRole("status").filter({ hasText: "已複製文字結果" }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "keyboard result\n",
  );
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    expect(
      await results(page).evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(results(page)).toHaveCount(0);
  await expect(input).toBeFocused();
  await page.getByRole("button", { name: "上次結果", exact: true }).click();
  await expect(results(page).locator(".result-text")).toContainText(
    "keyboard result",
  );
  await results(page)
    .getByRole("button", { name: "清除結果", exact: true })
    .click();
  await expect(
    results(page).getByText("結果已清除", { exact: true }).first(),
  ).toBeVisible();
  await expect(results(page).locator(".result-text")).toHaveCount(0);
  await results(page)
    .getByRole("button", { name: "重新執行", exact: true })
    .click();
  await expect(results(page).locator(".result-text")).toContainText(
    "keyboard result",
  );
  await page.screenshot({ path: "artifacts/result-text-modal.png" });
  await closeResult(page);
  await expect(
    page.getByRole("button", { name: "上次結果", exact: true }),
  ).toBeFocused();
});

test("closing a running modal stops Python and preserves the code", async ({
  page,
}) => {
  await ready(page);
  await code(page, "while True:\n    pass");
  await run(page).click();
  await expect(results(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(results(page)).toHaveCount(0);
  await expect(run(page)).toBeEnabled();
  await expect(page.locator(".cm-content")).toContainText("while True:");
  await expect(run(page)).toBeFocused();
  await page.getByRole("button", { name: "上次結果", exact: true }).click();
  await expect(results(page).locator(".result-error")).toContainText(
    "程式已停止",
  );
  await closeResult(page);
  await code(page, 'print("after stopping")');
  await run(page).click();
  await expect(results(page).locator(".result-text")).toContainText(
    "after stopping",
    { timeout: 90000 },
  );
});

test("phone run controls and result modal remain inside the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.getByLabel("檔案操作", { exact: true }).click();
  await page.getByRole("button", { name: "重新命名", exact: true }).click();
  const longName = "這是一個用來檢查手機視窗的長檔名".repeat(5) + ".py";
  await page.getByLabel("檔案名稱").fill(longName);
  await page.getByRole("button", { name: "儲存名稱", exact: true }).click();
  await code(page, 'for i in range(100):\n    print("line", i)');
  await run(page).click();
  await expect(results(page).locator(".result-text")).toContainText("line 99", {
    timeout: 90000,
  });
  await expect(results(page).locator(".run-filename")).toHaveAttribute(
    "title",
    /手機視窗/,
  );
  expect(
    (await results(page).locator(".result-summary").boundingBox())!.height,
  ).toBeLessThan(60);
  const bounds = (await results(page).boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  await expect(
    results(page).getByRole("button", { name: "重新執行", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  expect(
    await results(page)
      .locator(".results-body")
      .evaluate((element) => element.scrollHeight > element.clientHeight),
  ).toBe(true);
  await page.screenshot({ path: "artifacts/result-mobile.png" });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(
    results(page).getByRole("button", { name: "重新執行", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await closeResult(page);
  await expect(run(page)).toBeInViewport({ ratio: 1 });
});

test("result and navigation dialogs pass automated accessibility checks", async ({
  page,
}) => {
  await ready(page);
  const report = [];
  await page.getByRole("button", { name: "開啟選單", exact: true }).click();
  report.push({
    state: "navigation",
    violations: (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  });
  await page.keyboard.press("Escape");
  await code(page, 'print("hello")');
  await run(page).click();
  await expect(results(page).locator(".result-text")).toContainText("hello", {
    timeout: 90000,
  });
  report.push({
    state: "text-result",
    violations: (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  });
  await closeResult(page);
  await code(page, "print(1 / 0)");
  await run(page).click();
  await expect(results(page).locator(".result-error")).toContainText(
    "ZeroDivisionError",
  );
  report.push({
    state: "error-result",
    violations: (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  report.push({
    state: "mobile-result",
    violations: (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  });
  await writeFile(
    "artifacts/ux-accessibility.json",
    JSON.stringify(report, null, 2),
  );
  expect(
    report.flatMap((item) =>
      item.violations.map((v) => ({
        state: item.state,
        id: v.id,
        nodes: v.nodes.map((n) => n.html),
      })),
    ),
  ).toEqual([]);
});
