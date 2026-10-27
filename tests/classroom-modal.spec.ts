import { test, expect } from "@playwright/test";
import jsQR from "jsqr";
import AxeBuilder from "@axe-core/playwright";
import { setup, create, peer, roomView } from "./fixtures/classroom";

test.use({ serviceWorkers: "block" });
test("teacher settings overlay the current page and the QR decodes to the exact copied share URL", async ({
  page,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "關閉設定", exact: true }).click();
  await page.getByRole("link", { name: "靈感範例", exact: true }).click();
  await expect(page).toHaveURL(/#\/examples$/);
  await roomView(page);
  await create(page);
  await expect(page).toHaveURL(/#\/examples$/);
  const link = await page
    .getByLabel("教室分享連結", { exact: true })
    .inputValue();
  expect(new URL(link).hash).toBe("#/");
  const bitmap = await page
    .getByRole("img", { name: "掃描加入教室的 QR Code", exact: true })
    .evaluate(async (image: HTMLImageElement) => {
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 512;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "white";
      context.fillRect(0, 0, 512, 512);
      context.drawImage(image, 0, 0, 512, 512);
      return {
        data: Array.from(context.getImageData(0, 0, 512, 512).data),
        width: 512,
        height: 512,
      };
    });
  expect(
    jsQR(new Uint8ClampedArray(bitmap.data), bitmap.width, bitmap.height)?.data,
  ).toBe(link);
  await expect(
    page.getByRole("img", { name: "掃描加入教室的 QR Code" }),
  ).toHaveAttribute("src", /^data:image\/svg\+xml/);
  await expect(
    page.getByRole("link", { name: "下載 QR Code", exact: true }),
  ).toHaveAttribute("download", "classroom-qr.svg");
  await page.getByRole("button", { name: "複製教室連結", exact: true }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as { copiedLink: string }).copiedLink,
    ),
  ).toBe(link);
  await page.screenshot({ path: "artifacts/classroom-modal-teacher.png" });
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog.classroom-settings")).toHaveCount(0);
  await expect(page).toHaveURL(/#\/examples$/);
  expect(await peer(page, (p) => p.destroyed)).toBe(false);
  await roomView(page);
  await expect(page.getByLabel("教室分享連結", { exact: true })).toHaveValue(
    link,
  );
  await page.getByRole("button", { name: "開始上課", exact: true }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(
    page.getByRole("dialog", { name: "教室通訊", exact: true }),
  ).toBeVisible();
});

test("a shared URL opens a full-screen nickname form and Enter joins straight into the editor and communications", async ({
  page,
}) => {
  await setup(page, "?peer=teacher-room");
  const modal = page.getByRole("dialog", {
    name: "加入老師的教室",
    exact: true,
  });
  await expect(modal).toBeVisible();
  expect(await modal.boundingBox()).toMatchObject({
    x: 0,
    y: 0,
    width: 1440,
    height: 1050,
  });
  await expect(page.getByLabel("你的暱稱", { exact: true })).toBeFocused();
  await expect(page.getByLabel("老師的連線 ID", { exact: true })).toHaveValue(
    "teacher-room",
  );
  await expect(
    page.getByLabel("老師的連線 ID", { exact: true }),
  ).not.toBeVisible();
  expect(await page.evaluate(() => "room" in window)).toBe(false);
  await page.screenshot({ path: "artifacts/classroom-modal-student.png" });
  await page.getByLabel("你的暱稱", { exact: true }).fill("加入測試端");
  await page.getByLabel("你的暱稱", { exact: true }).press("Enter");
  await expect(modal).toHaveCount(0);
  await expect(page).toHaveURL(/#\/$/);
  expect(new URL(page.url()).searchParams.has("peer")).toBe(false);
  await expect(
    page.getByRole("dialog", { name: "教室通訊", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "送交程式", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "語音", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "執行結果", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("boyo-studio-v1")!).files[0].code,
    ),
  ).toBe("print('original lesson')");
  await roomView(page);
  await expect(
    page.getByRole("dialog", { name: "教室與分享", exact: true }),
  ).toBeVisible();
  expect(await peer(page, (p) => p.destroyed)).toBe(false);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "開啟教室設定", exact: true }),
  ).toBeFocused();
});

test("legacy classroom links open settings over the editor and the phone join screen remains accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, "?peer=teacher-room");
  const modal = page.getByRole("dialog", {
    name: "加入老師的教室",
    exact: true,
  });
  expect(await modal.boundingBox()).toMatchObject({
    x: 0,
    y: 0,
    width: 390,
    height: 844,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: "artifacts/classroom-modal-student-mobile.png",
  });
  await page.getByRole("button", { name: "關閉視窗", exact: true }).click();
  await page.evaluate(() => {
    location.hash = "/classroom";
  });
  await expect(
    page.getByRole("dialog", { name: "教室與分享", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/#\/$/);
  await create(page);
  await expect(
    page.getByRole("img", { name: "掃描加入教室的 QR Code" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
