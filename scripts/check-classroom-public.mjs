import { chromium, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const base = process.env.CLASSROOM_VERIFY_URL || "http://127.0.0.1:4173/";
const browser = await chromium.launch({ headless: true });
const contexts = [];
const signaling = new Set();
const errors = [];
const panel = (page) =>
  page.getByRole("dialog", { name: "教室通訊", exact: true });
async function dock(page) {
  await page.getByRole("button", { name: /開啟教室通訊/ }).click();
}
async function closeDock(page) {
  await panel(page)
    .getByRole("button", { name: "收合教室通訊", exact: true })
    .click();
}
async function editor(page, code) {
  await page.getByRole("link", { name: "返回編輯器", exact: true }).click();
  await page.getByRole("button", { name: "程式碼", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Python 程式碼", exact: true })
    .fill(code);
}
async function room(page) {
  await page.getByRole("button", { name: "開啟選單", exact: true }).click();
  await page.getByRole("link", { name: "一起學習", exact: true }).click();
}
try {
  for (let i = 0; i < 3; i++)
    contexts.push(
      await browser.newContext({ viewport: { width: 1440, height: 1050 } }),
    );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const [teacher, student, witness] = pages;
  for (const [i, page] of pages.entries()) {
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("websocket", (ws) => signaling.add(new URL(ws.url()).origin));
    await page.addInitScript((i) => {
      localStorage.setItem(
        "boyo-studio-v1",
        JSON.stringify({
          activeId: "main",
          files: [
            {
              id: "main",
              name: "main.py",
              code: `print('public verification ${i}')`,
            },
          ],
        }),
      );
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.testCopiedLink = text;
          },
        },
      });
    }, i);
  }
  await teacher.goto(base + "#/classroom");
  await teacher.getByRole("button", { name: "建立教室", exact: false }).click();
  await expect(teacher.getByLabel("連線 ID", { exact: true })).not.toHaveValue(
    "",
    { timeout: 30000 },
  );
  await teacher
    .getByRole("button", { name: "複製教室連結", exact: true })
    .click();
  const link = await teacher.evaluate(() => window.testCopiedLink);
  await expect(teacher.getByLabel("教室分享連結", { exact: true })).toHaveValue(
    link,
  );
  for (const [i, page] of [student, witness].entries()) {
    await page.goto(link);
    await expect(page.getByLabel("老師的連線 ID", { exact: true })).toHaveValue(
      new URL(link).searchParams.get("peer"),
    );
    await page
      .getByLabel("你的暱稱", { exact: true })
      .fill(i === 0 ? "驗證端 A" : "驗證端 B");
    await page.getByRole("button", { name: "加入教室", exact: false }).click();
    await expect(page.getByText("已連線：1 位", { exact: true })).toBeVisible({
      timeout: 30000,
    });
  }
  await expect(
    teacher.getByText("已連線：2 位", { exact: true }),
  ).toBeVisible();
  await editor(teacher, "print('teacher own lesson')");
  await editor(student, "print('student submitted snapshot')");
  await editor(witness, "print('other student draft')");
  await dock(teacher);
  const announcement = "請檢查迴圈邊界，再送交程式。";
  await panel(teacher)
    .getByLabel("廣播訊息給全體同學", { exact: true })
    .fill(announcement);
  await panel(teacher)
    .getByRole("button", { name: "廣播訊息", exact: true })
    .click();
  await closeDock(teacher);
  for (const page of [student, witness]) {
    await expect(
      page.getByText("老師：" + announcement, { exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/#\/$/);
  }
  await expect(
    witness.getByRole("textbox", { name: "Python 程式碼", exact: true }),
  ).toContainText("other student draft");
  await dock(student);
  await panel(student)
    .getByRole("button", { name: /^送交程式/ })
    .click();
  await panel(student)
    .getByLabel("想請老師檢查的問題（選填）", { exact: true })
    .fill("請檢查這個送交版本。");
  await panel(student)
    .getByRole("button", { name: "送交目前程式給老師", exact: true })
    .click();
  await expect(panel(student)).toContainText("老師端已收到");
  await student
    .getByRole("textbox", { name: "Python 程式碼", exact: true })
    .fill("print('student newer edit')");
  await teacher
    .getByRole("textbox", { name: "Python 程式碼", exact: true })
    .fill("print('teacher newer edit')");
  await dock(teacher);
  await panel(teacher)
    .getByRole("button", { name: /收到的程式/ })
    .click();
  await panel(teacher)
    .getByRole("button", { name: "檢查程式", exact: true })
    .click();
  const review = teacher.getByRole("dialog", { name: "檢查同學的程式" });
  await expect(
    review.getByLabel("收到的完整 Python 程式", { exact: true }),
  ).toContainText("student submitted snapshot");
  await expect(review).not.toContainText("student newer edit");
  await review.getByRole("button", { name: "檢查語法", exact: true }).click();
  await expect(review).toContainText("語法可解析，尚未執行", {
    timeout: 90000,
  });
  const feedback = "這個版本語法正確，請再加入不同輸入的測試。";
  await review.getByLabel("檢查意見", { exact: true }).fill(feedback);
  await review
    .getByRole("button", { name: "送出檢查回覆", exact: true })
    .click();
  await expect(panel(student)).toContainText("老師已回覆檢查意見");
  await expect(panel(student)).toContainText(feedback);
  await teacher.screenshot({
    path: "artifacts/classroom-public-code-review.png",
  });
  await review.getByRole("button", { name: "關閉視窗", exact: true }).click();
  await expect(
    teacher.getByRole("textbox", { name: "Python 程式碼", exact: true }),
  ).toContainText("teacher newer edit");
  await expect(
    student.getByRole("textbox", { name: "Python 程式碼", exact: true }),
  ).toContainText("student newer edit");
  await expect(
    teacher.getByRole("dialog", { name: "執行結果", exact: true }),
  ).toHaveCount(0);
  await panel(teacher)
    .getByRole("button", { name: "訊息", exact: true })
    .click();
  await panel(teacher)
    .getByLabel("廣播訊息給全體同學", { exact: true })
    .fill("全體測試完成");
  await panel(teacher)
    .getByRole("button", { name: "廣播訊息", exact: true })
    .click();
  await dock(witness);
  await expect(panel(witness).getByRole("log")).toContainText("全體測試完成");
  await expect(panel(witness).getByRole("log")).not.toContainText(feedback);
  await panel(teacher)
    .getByRole("button", { name: /廣播目前程式/ })
    .click();
  await panel(witness)
    .getByRole("button", { name: /^送交程式/ })
    .click();
  await expect(panel(witness).locator(".classroom-code-card")).toContainText(
    "main.py",
  );
  await panel(witness)
    .getByRole("button", { name: "另存並開啟", exact: true })
    .click();
  await expect(witness.getByLabel("目前檔案", { exact: true })).toContainText(
    "main_2.py",
  );
  await expect(
    witness.getByRole("textbox", { name: "Python 程式碼", exact: true }),
  ).toContainText("teacher newer edit");
  await teacher.screenshot({ path: "artifacts/classroom-public-teacher.png" });
  await student.screenshot({ path: "artifacts/classroom-public-student.png" });
  await closeDock(teacher);
  await closeDock(student);
  await closeDock(witness);
  await room(teacher);
  await expect(teacher.getByLabel("教室分享連結", { exact: true })).toHaveValue(
    link,
  );
  for (const page of [student, witness]) {
    await room(page);
    await page.getByRole("button", { name: "結束連線", exact: true }).click();
  }
  await expect(
    teacher.getByText("已連線：0 位", { exact: true }),
  ).toBeVisible();
  await teacher.getByRole("button", { name: "結束連線", exact: true }).click();
  if (!signaling.has("wss://0.peerjs.com") || errors.length)
    throw Error("Public cloud or browser error assertion failed");
  const result = {
    base,
    signaling: [...signaling],
    isolatedBrowsers: 3,
    copyActionUsesExactShareLink: true,
    teacherLinkPrefill: true,
    crossPageBroadcastToTwoStudents: true,
    submissionSnapshotAndReceipt: true,
    teacherSyntaxReviewWithoutExecution: true,
    privateFeedback: true,
    bidirectionalCodeTransfer: true,
    editingKeepsRoomAndLink: true,
    originalFilesPreserved: true,
    studentLeavingKeepsTeacherRoom: true,
    browserErrors: errors,
    verifiedAt: new Date().toISOString(),
  };
  await writeFile(
    "artifacts/classroom-public-verification.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} catch (e) {
  console.log("Verification failed:", e.message);
  for (let i = 0; i < contexts.length; i++)
    for (const p of contexts[i].pages()) {
      console.log(
        "page",
        i,
        (
          await p
            .locator("body")
            .innerText()
            .catch(() => "")
        ).slice(-2000),
      );
      await p
        .screenshot({ path: `artifacts/classroom-public-failure-${i}.png` })
        .catch(() => {});
    }
  throw e;
} finally {
  for (const c of contexts) await c.close();
  await browser.close();
}
