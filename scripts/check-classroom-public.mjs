import { chromium, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const base = process.env.CLASSROOM_VERIFY_URL || "http://127.0.0.1:4173/";
const browser = await chromium.launch({ headless: true });
const contexts = [];
const signaling = new Set();
const errors = [];
try {
  for (let i = 0; i < 2; i++) contexts.push(await browser.newContext());
  const teacher = await contexts[0].newPage(),
    student = await contexts[1].newPage();
  for (const page of [teacher, student]) {
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("websocket", (ws) => signaling.add(new URL(ws.url()).origin));
  }
  const seed = (page, code) =>
    page.addInitScript(
      (code) =>
        localStorage.setItem(
          "boyo-studio-v1",
          JSON.stringify({
            activeId: "main",
            files: [{ id: "main", name: "main.py", code }],
          }),
        ),
      code,
    );
  await seed(teacher, "print('public teacher test')");
  await seed(student, "print('public student test')");
  await teacher.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.testCopiedLink = text;
        },
      },
    }),
  );
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
  await student.goto(link);
  await expect(
    student.getByLabel("老師的連線 ID", { exact: true }),
  ).toHaveValue(new URL(link).searchParams.get("peer"));
  await student.getByLabel("你的暱稱", { exact: true }).fill("連線驗證端");
  await student.getByRole("button", { name: "加入教室", exact: false }).click();
  await expect(teacher.getByText("已連線：1 位", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect(student.getByText("已連線：1 位", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await teacher
    .getByRole("button", { name: "傳送目前程式給同學", exact: true })
    .click();
  await expect(student.locator(".inbox")).toContainText("public teacher test");
  await student
    .getByRole("button", { name: "另存並開啟", exact: true })
    .click();
  await expect(student.getByLabel("目前檔案", { exact: true })).toContainText(
    "FromTeacher.py",
  );
  await student.getByRole("button", { name: "程式碼", exact: true }).click();
  await student
    .getByRole("textbox", { name: "Python 程式碼", exact: true })
    .fill("print('public student reply')");
  async function room(page) {
    await page.getByRole("button", { name: "開啟選單", exact: true }).click();
    await page.getByRole("link", { name: "一起學習", exact: true }).click();
  }
  await room(student);
  await expect(
    student.getByText("已連線：1 位", { exact: true }),
  ).toBeVisible();
  await student
    .getByRole("button", { name: "傳送目前程式給老師", exact: true })
    .click();
  await expect(teacher.locator(".inbox")).toContainText("public student reply");
  await teacher.getByRole("link", { name: "返回編輯器", exact: true }).click();
  await teacher.getByRole("button", { name: "程式碼", exact: true }).click();
  await teacher
    .getByRole("textbox", { name: "Python 程式碼", exact: true })
    .fill("print('public teacher second')");
  await room(teacher);
  await expect(teacher.getByLabel("教室分享連結", { exact: true })).toHaveValue(
    link,
  );
  await expect(
    teacher.getByText("已連線：1 位", { exact: true }),
  ).toBeVisible();
  await teacher
    .getByRole("button", { name: "傳送目前程式給同學", exact: true })
    .click();
  await expect(student.locator(".inbox")).toContainText(
    "public teacher second",
  );
  await teacher.screenshot({ path: "artifacts/classroom-public-teacher.png" });
  await student.screenshot({ path: "artifacts/classroom-public-student.png" });
  await student.getByRole("button", { name: "結束連線", exact: true }).click();
  await expect(
    teacher.getByText("已連線：0 位", { exact: true }),
  ).toBeVisible();
  await expect(teacher.getByLabel("教室分享連結", { exact: true })).toHaveValue(
    link,
  );
  await teacher.getByRole("button", { name: "結束連線", exact: true }).click();
  if (!signaling.has("wss://0.peerjs.com") || errors.length)
    throw Error("Public cloud or browser error assertion failed");
  const result = {
    base,
    signaling: [...signaling],
    copyActionUsesExactShareLink: true,
    teacherLinkPrefill: true,
    bidirectionalCodeTransfer: true,
    editingKeepsRoomAndLink: true,
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
  for (let i = 0; i < contexts.length; i++) {
    for (const p of contexts[i].pages()) {
      console.log(
        "page",
        i,
        (
          await p
            .locator("body")
            .innerText()
            .catch(() => "")
        ).slice(-1500),
      );
      await p
        .screenshot({ path: `artifacts/classroom-public-failure-${i}.png` })
        .catch(() => {});
    }
  }
  throw e;
} finally {
  for (const c of contexts) await c.close();
  await browser.close();
}
