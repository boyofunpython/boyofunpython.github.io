import { test, expect } from "@playwright/test";

const badge =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100" fill="royalblue"/><svg x="20" y="10" width="40" height="20" viewBox="0 0 40 20"><rect width="40" height="20" fill="white"/></svg></svg>';

test("mixed SVG output survives turtle finalization and a later Python error", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "程式碼", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Python 程式碼", exact: true })
    .fill(
      [
        `display(${JSON.stringify(badge)})`,
        "import turtle",
        "turtle.speed(0)",
        "turtle.forward(100)",
        "turtle.done()",
        `display(${JSON.stringify(badge)})`,
        'raise ValueError("圖形應該保留")',
      ].join("\n"),
    );
  await page.getByRole("button", { name: "執行程式", exact: false }).click();
  await expect(page.locator(".result-error")).toContainText(
    "ValueError: 圖形應該保留",
    { timeout: 90000 },
  );
  const frame = page.frameLocator("iframe");
  await expect(frame.locator("body > svg")).toHaveCount(3);
  const first = frame.locator("body > svg").first();
  await expect(first).toHaveAttribute("viewBox", "0 0 200 100");
  const dimensions = await first.evaluate((svg) => ({
    root: svg.getBoundingClientRect().width,
    nested: svg.querySelector("svg")!.getBoundingClientRect().width,
  }));
  expect(dimensions.nested / dimensions.root).toBeCloseTo(0.2, 2);
  const turtle = frame.locator("body > svg").nth(1);
  await expect
    .poll(() =>
      turtle
        .locator("line")
        .last()
        .evaluate((line) => (line as SVGLineElement).x2.animVal.value),
    )
    .toBeGreaterThan(99);
  await page.getByRole("button", { name: "重播繪圖動畫", exact: true }).click();
  await expect(frame.locator("body > svg")).toHaveCount(3);
  await page.screenshot({ path: "artifacts/graphics-mixed.png" });
});

test("console preserves explicit repeated SVG displays without repeating stale turtle output", async ({
  page,
}) => {
  await page.goto("/#/console");
  const area = page.getByRole("textbox", {
    name: "Python Console 指令",
    exact: true,
  });
  async function send(code: string) {
    await expect(area).toBeEnabled({ timeout: 90000 });
    await area.fill(code);
    await area.press("Enter");
    await expect(area).toBeEnabled();
  }
  await send("import turtle; turtle.forward(100); turtle.done()");
  await expect(page.locator("iframe")).toHaveCount(1);
  await send("2 + 3");
  await expect(page.locator("iframe")).toHaveCount(1);
  await send(`display(${JSON.stringify(badge)})`);
  await expect(page.locator("iframe")).toHaveCount(2);
  await expect(
    page.frameLocator("iframe").last().locator("body > svg"),
  ).toHaveCount(1);
  await send(`display(${JSON.stringify(badge)})`);
  await expect(page.locator("iframe")).toHaveCount(3);
});
