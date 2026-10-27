import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  setup,
  peer,
  create,
  roomView,
  backToEditor,
} from "./fixtures/classroom";
import {
  MAX_CLASSROOM_TEXT,
  MAX_INBOX,
  MAX_SHARED_CODE,
  readClassroomPacket,
} from "../src/classroom";

test.use({ serviceWorkers: "block" });
const comms = (page: Page) =>
  page.getByRole("dialog", { name: "教室通訊", exact: true });
async function openComms(page: Page) {
  if (await page.locator("dialog.classroom-settings").isVisible())
    await page
      .locator("dialog.classroom-settings")
      .getByRole("button", { name: "關閉設定", exact: true })
      .click();
  if (
    !(await page
      .getByRole("dialog", { name: "教室通訊", exact: true })
      .isVisible())
  )
    await page.getByRole("button", { name: /開啟教室通訊/ }).click();
}
async function edit(page: Page, code: string) {
  await backToEditor(page);
  await page.getByRole("button", { name: "程式碼", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Python 程式碼", exact: true })
    .fill(code);
}
test("packet validation enforces direction, text bounds and safe filenames while retaining legacy code", () => {
  expect(
    readClassroomPacket({ type: "code", code: "print(1)" }, "teacher"),
  ).toMatchObject({ filename: "FromStudent.py", question: "" });
  expect(
    readClassroomPacket({ type: "teacherInfo", code: "print(1)" }, "student"),
  ).toMatchObject({ filename: "FromTeacher.py" });
  expect(
    readClassroomPacket(
      { type: "code", code: "x", filename: "../secret.py" },
      "teacher",
    ),
  ).toMatchObject({ filename: "FromStudent.py" });
  for (const raw of [
    null,
    "hi",
    { type: "message", id: "m", text: "" },
    { type: "message", id: {}, text: "bad" },
    { type: "message", id: "m", text: "x".repeat(MAX_CLASSROOM_TEXT + 1) },
    { type: "code", code: "x".repeat(MAX_SHARED_CODE + 1) },
    { type: "feedback", id: "f", submissionId: "s", text: "wrong direction" },
    { type: "receipt", submissionId: "s" },
    { type: "teacherInfo", code: "wrong direction" },
  ])
    expect(readClassroomPacket(raw, "teacher")).toBeNull();
  expect(
    readClassroomPacket(
      { type: "message", id: "m", text: "  你好\n同學  " },
      "student",
    ),
  ).toEqual({ type: "message", id: "m", text: "你好\n同學" });
});

test("teacher broadcasts from the editor and receives questions without navigation or execution", async ({
  page,
}) => {
  await setup(page);
  await create(page);
  await peer(page, (p) => {
    p.add("端 A");
    p.add("端 B");
  });
  await edit(page, "print('teacher editing')");
  await openComms(page);
  const panel = comms(page);
  await panel
    .getByLabel("廣播訊息給全體同學", { exact: true })
    .fill("請完成第一題，再送交程式。");
  await panel
    .getByLabel("廣播訊息給全體同學", { exact: true })
    .press("Control+Enter");
  expect(
    await peer(page, (p) => p.connections.map((c) => c.sent)),
  ).toMatchObject([
    [{ type: "message", text: "請完成第一題，再送交程式。" }],
    [{ type: "message", text: "請完成第一題，再送交程式。" }],
  ]);
  await expect(page).toHaveURL(/#\/$/);
  await expect(
    page.getByRole("dialog", { name: "執行結果", exact: true }),
  ).toHaveCount(0);
  // The nonmodal communications panel must allow editing at the same time.
  await page
    .getByRole("textbox", { name: "Python 程式碼", exact: true })
    .fill("print('continued edit')");
  await panel
    .getByRole("button", { name: "收合教室通訊", exact: true })
    .click();
  const input = page.getByRole("textbox", {
    name: "Python 程式碼",
    exact: true,
  });
  await input.focus();
  await expect(input).toBeFocused();
  await peer(page, (p) =>
    p.connections[0].emit("data", {
      type: "message",
      id: "question-1",
      text: "老師，我卡住了。",
    }),
  );
  await expect(
    page.getByText("端 A：老師，我卡住了。", { exact: true }),
  ).toBeVisible();
  await expect(input).toBeFocused();
  await openComms(page);
  await expect(panel.getByRole("log")).toContainText("老師，我卡住了。");
  await expect(input).toContainText("continued edit");
  await page.screenshot({ path: "artifacts/classroom-editor-broadcast.png" });
});

test("student submits a snapshot while editing and sees receipt and private teacher feedback", async ({
  page,
}) => {
  await setup(page, "?peer=teacher-room");
  await page.getByLabel("你的暱稱", { exact: true }).fill("測試端");
  await page.getByRole("button", { name: "加入教室", exact: false }).click();
  await expect(page.getByText("已連線：1 位", { exact: true })).toBeVisible();
  await edit(page, "print('student snapshot')");
  await openComms(page);
  const panel = comms(page);
  await panel.getByRole("button", { name: "送交程式", exact: true }).click();
  await panel
    .getByLabel("想請老師檢查的問題（選填）", { exact: true })
    .fill("這個輸出正確嗎？");
  await panel
    .getByRole("button", { name: "送交目前程式給老師", exact: true })
    .click();
  const packet = (await peer(page, (p) => p.outgoing.sent.at(-1))) as {
    id: string;
  };
  expect(packet).toMatchObject({
    type: "code",
    filename: "main.py",
    question: "這個輸出正確嗎？",
    code: "print('student snapshot')",
  });
  await peer(page, (p) =>
    p.outgoing.emit("data", {
      type: "receipt",
      submissionId: (p.outgoing.sent.at(-1) as { id: string }).id,
    }),
  );
  await expect(panel).toContainText("老師端已收到");
  await page
    .getByRole("textbox", { name: "Python 程式碼", exact: true })
    .fill("print('newer local edit')");
  await panel
    .getByRole("button", { name: "查看送交版本", exact: true })
    .click();
  const snapshot = page.getByRole("dialog", { name: "我送交的程式版本" });
  await expect(snapshot).toContainText("student snapshot");
  await expect(snapshot).not.toContainText("newer local edit");
  await snapshot.getByRole("button", { name: "關閉視窗", exact: true }).click();
  await peer(page, (p) =>
    p.outgoing.emit("data", {
      type: "feedback",
      id: "feedback-1",
      submissionId: (p.outgoing.sent.at(-1) as { id: string }).id,
      text: "請再試試不同的輸入。",
    }),
  );
  await expect(panel).toContainText("老師已回覆檢查意見");
  await expect(panel).toContainText("請再試試不同的輸入。");
  await expect(
    page.getByRole("textbox", { name: "Python 程式碼", exact: true }),
  ).toContainText("newer local edit");
  expect(await peer(page, (p) => p.outgoing.sent)).toHaveLength(1);
});

test("teacher reviews full code, checks syntax without executing, and replies only to the submitter", async ({
  page,
}) => {
  await setup(page);
  await create(page);
  await peer(page, (p) => {
    p.add("端 A");
    p.add("端 B");
  });
  await edit(page, "print('my own lesson')");
  await peer(page, (p) =>
    p.connections[0].emit("data", {
      type: "code",
      id: "submission-A",
      filename: "exercise.py",
      question: "請檢查我的迴圈",
      code: "print('student code must not run')\nfor i in range(3):\n    print(i)",
    }),
  );
  await peer(page, (p) =>
    p.connections[1].emit("data", {
      type: "code",
      id: "submission-A",
      filename: "other.py",
      code: "print('other student')",
    }),
  );
  expect(await peer(page, (p) => p.connections[0].sent)).toMatchObject([
    { type: "receipt", submissionId: "submission-A" },
  ]);
  await openComms(page);
  const panel = comms(page);
  await panel.getByRole("button", { name: /收到的程式/ }).click();
  await panel
    .locator(".classroom-code-card")
    .filter({ hasText: "exercise.py" })
    .getByRole("button", { name: "檢查程式", exact: true })
    .click();
  const review = page.getByRole("dialog", { name: "檢查同學的程式" });
  expect((await review.boundingBox())!.width).toBeGreaterThanOrEqual(900);
  await expect(
    review.getByLabel("收到的完整 Python 程式", { exact: true }),
  ).toContainText("for i in range(3)");
  await expect(review).toContainText("請檢查我的迴圈");
  await review
    .getByLabel("收到的完整 Python 程式", { exact: true })
    .press("Control+Enter");
  await expect(
    page.getByRole("dialog", { name: "執行結果", exact: true }),
  ).toHaveCount(0);
  await review.getByRole("button", { name: "檢查語法", exact: true }).click();
  await expect(review).toContainText("語法可解析，尚未執行", {
    timeout: 90000,
  });
  await review
    .getByLabel("檢查意見", { exact: true })
    .fill("迴圈結構正確，請說明 range(3) 的範圍。");
  await review
    .getByRole("button", { name: "送出檢查回覆", exact: true })
    .click();
  await expect(review).toContainText("已將檢查意見傳給這位同學");
  expect(await peer(page, (p) => p.connections[0].sent)).toMatchObject([
    { type: "receipt" },
    {
      type: "feedback",
      submissionId: "submission-A",
      text: "迴圈結構正確，請說明 range(3) 的範圍。",
    },
  ]);
  expect(await peer(page, (p) => p.connections[1].sent)).toEqual([
    { type: "receipt", submissionId: "submission-A" },
  ]);
  await page.screenshot({ path: "artifacts/classroom-code-review.png" });
  await review.getByRole("button", { name: "關閉視窗", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Python 程式碼", exact: true }),
  ).toContainText("my own lesson");
});

test("malformed or duplicate packets do not create duplicate messages, and the active review survives the inbox limit", async ({
  page,
}) => {
  await setup(page);
  await create(page);
  await peer(page, (p) => p.add("端 A"));
  await openComms(page);
  await peer(page, (p) => {
    p.connections[0].emit("data", {
      type: "message",
      id: "same",
      text: "唯一一則",
    });
    p.connections[0].emit("data", {
      type: "message",
      id: "same",
      text: "唯一一則",
    });
    p.connections[0].emit("data", {
      type: "message",
      id: "bad",
      text: { html: "<script>" },
    });
    p.connections[0].emit("data", {
      type: "code",
      id: "first",
      code: "print(1)",
      filename: "one.py",
    });
  });
  await expect(comms(page).getByText("唯一一則", { exact: true })).toHaveCount(
    1,
  );
  await comms(page)
    .getByRole("button", { name: /收到的程式/ })
    .click();
  await comms(page)
    .getByRole("button", { name: "檢查程式", exact: true })
    .click();
  const review = page.getByRole("dialog", { name: "檢查同學的程式" });
  await review.getByLabel("檢查意見", { exact: true }).fill("尚未送出的草稿");
  await peer(page, (p) => {
    for (let i = 0; i < 25; i++)
      p.connections[0].emit("data", {
        type: "code",
        id: `new-${i}`,
        filename: "new.py",
        code: `print(${i})`,
      });
  });
  await expect(review).toContainText("one.py");
  await expect(review.getByLabel("檢查意見", { exact: true })).toHaveValue(
    "尚未送出的草稿",
  );
  await peer(page, (p) => p.connections[0].close());
  await review
    .getByRole("button", { name: "送出檢查回覆", exact: true })
    .click();
  await expect(review.getByRole("alert")).toContainText("已離線");
  await expect(review.getByLabel("檢查意見", { exact: true })).toHaveValue(
    "尚未送出的草稿",
  );
  await review.getByRole("button", { name: "關閉視窗", exact: true }).click();
  await expect(page.locator(".classroom-code-card")).toHaveCount(MAX_INBOX);
});

test("global communications remain usable across examples, AI and console and fit small screens", async ({
  page,
}) => {
  await setup(page);
  await create(page);
  await peer(page, (p) => p.add("端 A"));
  await backToEditor(page);
  for (const route of ["/", "/examples", "/assistant", "/console"]) {
    await page.evaluate((hash) => {
      location.hash = hash;
    }, route);
    await openComms(page);
    await comms(page)
      .getByLabel("廣播訊息給全體同學", { exact: true })
      .fill(`跨頁 ${route}`);
    await comms(page)
      .getByRole("button", { name: "廣播訊息", exact: true })
      .click();
    await comms(page)
      .getByRole("button", { name: "收合教室通訊", exact: true })
      .click();
  }
  expect(await peer(page, (p) => p.connections[0].sent)).toHaveLength(4);
  await page.setViewportSize({ width: 390, height: 844 });
  await openComms(page);
  const panel = comms(page);
  const box = await panel.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  const axe = await new AxeBuilder({ page })
    .include(".classroom-comms")
    .analyze();
  expect(axe.violations).toEqual([]);
  await page.screenshot({ path: "artifacts/classroom-comms-mobile.png" });
  await panel.getByLabel("廣播訊息給全體同學", { exact: true }).press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /開啟教室通訊/ }),
  ).toBeFocused();
});
