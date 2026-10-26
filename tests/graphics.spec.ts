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

for (const withText of [false, true]) {
  test(`modal centers and fits the entire turtle canvas${withText ? " alongside long text output" : ""}`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "程式碼", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Python 程式碼", exact: true })
      .fill(
        [
          "import turtle",
          'turtle.dot(40, "red")',
          "turtle.done()",
          ...(withText ? ["for i in range(100):", '    print("line", i)'] : []),
        ].join("\n"),
      );
    await page.getByRole("button", { name: "執行程式", exact: false }).click();
    const frame = page.frameLocator("iframe");
    const svg = frame.locator("svg");
    await expect(svg).toBeVisible({ timeout: 90000 });
    await svg.evaluate((element) =>
      element.setAttribute("data-session", "preserved"),
    );
    if (withText)
      await expect(page.locator(".result-text")).toContainText("line 99");
    const evidence = [];
    for (const size of [
      { width: 1440, height: 1050 },
      { width: 1024, height: 768 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(size);
      await expect
        .poll(async () => {
          const area = (await page
            .locator(".graphics-viewport")
            .boundingBox())!;
          const canvas = (await page.locator("iframe").boundingBox())!;
          return Math.max(
            Math.abs(canvas.x + canvas.width / 2 - area.x - area.width / 2),
            Math.abs(canvas.y + canvas.height / 2 - area.y - area.height / 2),
          );
        })
        .toBeLessThan(1);
      const area = (await page.locator(".graphics-viewport").boundingBox())!;
      const canvas = (await page.locator("iframe").boundingBox())!;
      const body = (await page.locator(".results-body").boundingBox())!;
      expect(canvas.width).toBeGreaterThan(100);
      expect(canvas.height).toBeCloseTo(canvas.width, 0);
      expect(canvas.x).toBeGreaterThanOrEqual(area.x - 1);
      expect(canvas.y).toBeGreaterThanOrEqual(area.y - 1);
      expect(canvas.x + canvas.width).toBeLessThanOrEqual(
        area.x + area.width + 1,
      );
      expect(canvas.y + canvas.height).toBeLessThanOrEqual(
        area.y + area.height + 1,
      );
      expect(canvas.y).toBeGreaterThanOrEqual(body.y);
      expect(canvas.y + canvas.height).toBeLessThanOrEqual(
        body.y + body.height,
      );
      await expect
        .poll(() =>
          frame
            .locator("circle")
            .evaluate((element) => getComputedStyle(element).display),
        )
        .not.toBe("none");
      const dot = (await frame.locator("circle").boundingBox())!;
      expect(dot.x + dot.width / 2).toBeCloseTo(canvas.x + canvas.width / 2, 0);
      expect(dot.y + dot.height / 2).toBeCloseTo(
        canvas.y + canvas.height / 2,
        0,
      );
      expect(
        await page.locator(".results-body").evaluate((element) => ({
          overflow: element.scrollHeight - element.clientHeight,
          top: element.scrollTop,
        })),
      ).toEqual({ overflow: 0, top: 0 });
      expect(
        await frame
          .locator("html")
          .evaluate((element) => element.scrollHeight - innerHeight),
      ).toBeLessThanOrEqual(1);
      await expect(svg).toHaveAttribute("data-session", "preserved");
      evidence.push({ ...size, area, canvas });
      await page.screenshot({
        path: `artifacts/turtle-centered-${size.width}-${withText ? "text" : "drawing"}.png`,
      });
    }
    await page.setViewportSize({ width: 1440, height: 1050 });
    const time = await svg.evaluate((element) =>
      (element as SVGSVGElement).getCurrentTime(),
    );
    await page
      .getByRole("button", { name: "放大結果視窗", exact: true })
      .click();
    await expect(svg).toHaveAttribute("data-session", "preserved");
    expect(
      await svg.evaluate((element) =>
        (element as SVGSVGElement).getCurrentTime(),
      ),
    ).toBeGreaterThanOrEqual(time);
    await page
      .getByRole("button", { name: "重播繪圖動畫", exact: true })
      .click();
    await expect(svg).not.toHaveAttribute("data-session");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      `artifacts/turtle-centered-${withText ? "text" : "drawing"}.json`,
      JSON.stringify(evidence, null, 2),
    );
  });
}
