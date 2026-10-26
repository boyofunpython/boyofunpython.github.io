import { test, expect } from "@playwright/test";

test("editing native blocks preserves advanced Python, large integers and call arguments", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "程式碼", exact: true }).click();
  const source = [
    "# 保留教學註解",
    'print("before")',
    "def decorated(fn):",
    "    return fn",
    "@decorated",
    "def total(*items, scale=1):",
    "    return sum(items) * scale",
    "huge = 9007199254740993123456789",
    "values = [i * i for i in range(3)]",
    "marked = 7  # 行內說明也要保留",
    "print(total(*values, scale=2))",
    "print((lambda n: n + 1)(41))",
    "print(huge)",
  ].join("\n");
  const input = page.getByRole("textbox", {
    name: "Python 程式碼",
    exact: true,
  });
  await input.fill(source);
  await page.getByRole("button", { name: "方塊", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit text: before", exact: true }),
  ).toBeVisible({ timeout: 90000 });
  await page.getByRole("button", { name: "程式碼", exact: true }).click();
  await expect.poll(() => input.innerText()).toBe(source);
  await page.getByRole("button", { name: "方塊", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit text: before", exact: true })
    .click();
  await page.locator(".blocklyHtmlInput").fill("after");
  await page.locator(".blocklyHtmlInput").press("Enter");
  await page.getByRole("button", { name: "程式碼", exact: true }).click();
  await expect(input).toContainText("@decorated");
  await expect(input).toContainText("# 行內說明也要保留");
  await page.getByRole("button", { name: "執行程式", exact: false }).click();
  await expect(page.locator(".result-text")).toContainText(
    "after\n10\n42\n9007199254740993123456789",
  );
  await expect(page.locator(".result-error")).toHaveCount(0);
});

test("invalid Python leaves the source editable and blocks recover after correction", async ({
  page,
}) => {
  await page.goto("/");
  const input = page.getByRole("textbox", {
    name: "Python 程式碼",
    exact: true,
  });
  await input.fill("for i in range(3)\n    print(i)");
  await expect(page.locator(".block-sync-status.has-error")).toContainText(
    "第 1 行",
    { timeout: 90000 },
  );
  await expect(input).toContainText("for i in range(3)");
  await input.fill('print("recovered")');
  await expect(
    page.getByRole("button", { name: "Edit text: recovered", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".block-sync-status")).toHaveCount(0);
});
