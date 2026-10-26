import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const legacy = JSON.parse(
  readFileSync(
    new URL("./fixtures/legacy-toolboxes.json", import.meta.url),
    "utf8",
  ),
);
async function emptyWorkspace(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "程式碼", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Python 程式碼", exact: true })
    .fill("");
  await page.getByRole("button", { name: "方塊", exact: true }).click();
  await expect(page.locator(".block-sync-status")).toHaveCount(0, {
    timeout: 90000,
  });
}

test("normal and full flyouts retain every legacy category and all its choices", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await emptyWorkspace(page);
  for (const mode of ["normal", "full"]) {
    await page.getByLabel("方塊工具", { exact: true }).selectOption(mode);
    for (const category of legacy[mode]) {
      await page
        .getByRole("treeitem", { name: category.name, exact: true })
        .click();
      const flyout = page.locator(".blocklyToolboxFlyout");
      await expect(flyout).toBeVisible();
      const blocks = flyout.locator(".blocklyBlockCanvas > g[data-id]");
      expect(
        await blocks.count(),
        `${mode}/${category.name}`,
      ).toBeGreaterThanOrEqual(new Set(category.blocks ?? []).size);
    }
    await page.getByRole("treeitem", { name: "畫圖🐢", exact: true }).click();
    await expect(
      page.locator(".blocklyToolboxFlyout .blocklyBlockCanvas > g[data-id]"),
    ).toHaveCount(35);
    await page.screenshot({ path: `artifacts/toolbox-${mode}-turtle.png` });
  }
  await page.getByRole("button", { name: "程式碼", exact: true }).click();
  await expect(page.locator(".cm-content")).toHaveText("");
  await page.getByRole("button", { name: "方塊", exact: true }).click();
  await expect(page.locator(".block-sync-status")).toHaveCount(0);
  await page.getByRole("treeitem", { name: "變數", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept("score"));
  await page.getByRole("option", { name: /^建立變數/ }).click();
  expect(errors).toEqual([]);
});

test("dragging a dedicated turtle block supplies defaults, imports and executable Python", async ({
  page,
}) => {
  await emptyWorkspace(page);
  await page.getByRole("treeitem", { name: "畫圖🐢", exact: true }).click();
  const from = (await page
    .locator(".blocklyToolboxFlyout .turtle_forward > .blocklyPath")
    .boundingBox())!;
  const to = (await page.locator(".blocks-host").boundingBox())!;
  await page.mouse.move(from.x + 18, from.y + 16);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width * 0.75, to.y + to.height * 0.35, {
    steps: 20,
  });
  await page.mouse.up();
  await page.getByRole("button", { name: "程式碼", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("turtle.forward(50)");
  await expect(page.locator(".cm-content")).toContainText("import turtle");
  await page.getByRole("button", { name: "方塊", exact: true }).click();
  await expect(
    page.locator(".blocks-host .turtle_forward:visible"),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Edit text: 50", exact: true })
    .click();
  await page.locator(".blocklyHtmlInput").fill("80");
  await page.locator(".blocklyHtmlInput").press("Enter");
  await page.getByRole("button", { name: "執行程式", exact: false }).click();
  const svg = page.frameLocator("iframe").locator("svg");
  await expect(svg).toBeVisible({ timeout: 90000 });
  await expect
    .poll(() =>
      svg
        .locator("line")
        .last()
        .evaluate((line) => (line as SVGLineElement).x2.animVal.value),
    )
    .toBeGreaterThan(79);
});

test("turtle settings, filling and styled writing remain dedicated editable blocks", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "程式碼", exact: true }).click();
  await page.getByRole("textbox", { name: "Python 程式碼", exact: true })
    .fill(`import turtle
turtle.set_defaults(canvwidth=640, canvheight=360)
turtle.tracer(0)
turtle.pencolor("blue")
turtle.fillcolor("blue")
turtle.pensize(5)
turtle.penup()
turtle.goto(-100, 0)
turtle.pendown()
turtle.begin_fill()
for side in range(3):
    turtle.forward(80)
    turtle.left(120)
turtle.end_fill()
turtle.write("你好", font=("Arial", 24, "bold"), color="blue", align="center")
print(turtle.position())
turtle.done()`);
  await page.getByRole("button", { name: "方塊", exact: true }).click();
  await expect(page.locator(".blocks-host .turtle_set_defaults")).toHaveCount(
    1,
    { timeout: 90000 },
  );
  await expect(page.locator(".blocks-host .turtle_write_styled")).toHaveCount(
    1,
  );
  // Keep the first label visible while editing; field changes regenerate the whole workspace.
  await page
    .getByRole("button", { name: "Edit text: 640", exact: true })
    .click();
  await page.locator(".blocklyHtmlInput").fill("600");
  await page.locator(".blocklyHtmlInput").press("Enter");
  await page.getByRole("button", { name: "執行程式", exact: false }).click();
  const svg = page.frameLocator("iframe").locator("svg");
  await expect(svg).toHaveAttribute("viewBox", "0 0 600 360", {
    timeout: 90000,
  });
  const text = svg.locator("text");
  await expect(text).toHaveText("你好");
  await expect(text).toHaveCSS("font-size", "24px");
  await expect(text).toHaveCSS("font-weight", "700");
  await expect(text).toHaveAttribute("text-anchor", "middle");
  await expect(text).toHaveAttribute("fill", "blue");
  await expect(svg.locator('polygon[style*="fill: blue"]')).toHaveCount(1);
  await expect(page.locator(".result-error")).toHaveCount(0);
  await page.screenshot({ path: "artifacts/toolbox-turtle-styled.png" });
});

test("full blocks preserve classes, files, comprehensions and multiline strings after editing", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "程式碼", exact: true }).click();
  await page.getByRole("textbox", { name: "Python 程式碼", exact: true })
    .fill(`print("before toolbox")
class Box:
    def __init__(self, value: int):
        self.value = value
    def doubled(self):
        return self.value * 2
with open("toolbox.txt", "w") as file:
    file.write("hello\\nworld")
with open("toolbox.txt", "r") as file:
    print(file.read())
print(Box(21).doubled())
print([item * 2 for item in range(3)])
try:
    raise ValueError("caught")
except ValueError as error:
    print(str(error))`);
  await page.getByRole("button", { name: "方塊", exact: true }).click();
  await page.getByLabel("方塊工具", { exact: true }).selectOption("full");
  await expect(page.locator(".blocks-host .py_class")).toHaveCount(1, {
    timeout: 90000,
  });
  await expect(page.locator(".blocks-host .py_function")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Edit text: before toolbox", exact: true })
    .click();
  await page.locator(".blocklyHtmlInput").fill("after toolbox");
  await page.locator(".blocklyHtmlInput").press("Enter");
  await page.getByRole("button", { name: "執行程式", exact: false }).click();
  await expect(page.locator(".result-text")).toContainText(
    "after toolbox\nhello\nworld\n42\n[0, 2, 4]\ncaught",
  );
  await expect(page.locator(".result-error")).toHaveCount(0);
});
