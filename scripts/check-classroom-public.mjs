import { chromium, expect } from "@playwright/test";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const base = process.env.CLASSROOM_VERIFY_URL || "http://127.0.0.1:4173/";
const verifyVoice = process.argv.includes("--voice");
const audioFixture = verifyVoice
  ? await mkdtemp(join(tmpdir(), "boyo-voice-"))
  : null;
const audioPath = audioFixture && join(audioFixture, "synthetic-tone.wav");
if (audioPath) {
  const samples = 48000 * 3,
    wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(48000, 24);
  wav.writeUInt32LE(96000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    wav.writeInt16LE(
      Math.round(5000 * Math.sin((2 * Math.PI * 440 * i) / 48000)),
      44 + i * 2,
    );
  await writeFile(audioPath, wav);
}
const browser = await chromium.launch({
  headless: true,
  args: verifyVoice
    ? [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        `--use-file-for-fake-audio-capture=${audioPath}`,
      ]
    : [],
});
let voiceVerification;
const contexts = [];
const signaling = new Set();
const errors = [];
const panel = (page) =>
  page.getByRole("dialog", { name: "教室通訊", exact: true });
async function dock(page) {
  await page.getByRole("button", { name: /開啟教室通訊/ }).click();
  await panel(page).getByRole("button", { name: /^訊息/ }).click();
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
      await browser.newContext({
        viewport: { width: 1440, height: 1050 },
        permissions: verifyVoice ? ["microphone"] : [],
      }),
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
  if (verifyVoice)
    for (const page of pages)
      await page.addInitScript(() => {
        window.testVoice = { pcs: [], streams: [], requests: 0 };
        const Native = window.RTCPeerConnection;
        window.RTCPeerConnection = class extends Native {
          constructor(...args) {
            super(...args);
            window.testVoice.pcs.push(this);
          }
        };
        const getUserMedia = navigator.mediaDevices.getUserMedia.bind(
          navigator.mediaDevices,
        );
        navigator.mediaDevices.getUserMedia = async (constraints) => {
          window.testVoice.requests++;
          const stream = await getUserMedia(constraints);
          window.testVoice.streams.push(stream);
          return stream;
        };
      });
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
  if (verifyVoice)
    voiceVerification = await verifyClassroomVoice(teacher, student, witness);
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
    ...(voiceVerification ? { voice: voiceVerification } : {}),
    browserErrors: errors,
    verifiedAt: new Date().toISOString(),
  };
  await writeFile(
    verifyVoice
      ? "artifacts/classroom-voice-public-verification.json"
      : "artifacts/classroom-public-verification.json",
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
  if (audioFixture) await rm(audioFixture, { recursive: true, force: true });
}

async function audioState(page) {
  return page.evaluate(async () => {
    const state = window.testVoice;
    const reports = (
      await Promise.all(
        state.pcs
          .filter((pc) => pc.connectionState === "connected")
          .map(async (pc) => [...(await pc.getStats()).values()]),
      )
    ).flat();
    return {
      inbound: reports
        .filter((r) => r.type === "inbound-rtp" && r.kind === "audio")
        .map((r) => ({
          bytes: r.bytesReceived,
          packets: r.packetsReceived,
          energy: r.totalAudioEnergy || 0,
        })),
      outbound: reports
        .filter((r) => r.type === "outbound-rtp" && r.kind === "audio")
        .map((r) => ({ bytes: r.bytesSent, packets: r.packetsSent })),
      microphonesRequested: state.requests,
      microphoneTracks: state.streams.flatMap((s) =>
        s
          .getAudioTracks()
          .map((t) => ({ readyState: t.readyState, enabled: t.enabled })),
      ),
      players: [
        ...document.querySelectorAll("audio[data-classroom-voice]"),
      ].map((a) => ({ paused: a.paused, time: a.currentTime })),
    };
  });
}
async function voiceTab(page) {
  await dock(page);
  await panel(page).getByRole("button", { name: /^語音/ }).click();
}
async function listen(page) {
  const c = page.getByRole("region", { name: "教室語音控制" });
  await c.getByRole("button", { name: "啟用語音收聽", exact: true }).click();
}
async function heard(page, count) {
  await expect
    .poll(
      async () =>
        (await audioState(page)).inbound.filter(
          (r) => r.bytes > 0 && r.energy > 0,
        ).length,
      { timeout: 30000 },
    )
    .toBe(count);
  const retry = page.getByRole("button", { name: "點此播放語音", exact: true });
  if (await retry.isVisible()) await retry.click();
  await expect
    .poll(
      async () =>
        (await audioState(page)).players.filter((p) => !p.paused && p.time > 0)
          .length,
    )
    .toBe(count);
}
async function verifyClassroomVoice(teacher, student, witness) {
  for (const page of [teacher, student, witness]) {
    await voiceTab(page);
    await listen(page);
  }
  const c = (page) => page.getByRole("region", { name: "教室語音控制" });
  expect((await audioState(student)).microphonesRequested).toBe(0);
  expect((await audioState(witness)).microphonesRequested).toBe(0);
  await c(teacher)
    .getByRole("button", { name: "開啟麥克風廣播", exact: true })
    .click();
  await heard(student, 1);
  await heard(witness, 1);
  await expect(c(teacher)).toContainText("語音已連接 2 位同學");
  const teacherBroadcast = await audioState(teacher);
  expect(teacherBroadcast.outbound.filter((r) => r.bytes > 0).length).toBe(2);
  expect(teacherBroadcast.inbound.length).toBe(0);
  await c(student)
    .getByRole("button", { name: "開啟麥克風傳給老師", exact: true })
    .click();
  await heard(teacher, 1);
  expect((await audioState(witness)).inbound.length).toBe(1);
  await c(witness)
    .getByRole("button", { name: "開啟麥克風傳給老師", exact: true })
    .click();
  await heard(teacher, 2);
  const simultaneous = await Promise.all(
    [teacher, student, witness].map(audioState),
  );
  expect(simultaneous[1].outbound.filter((r) => r.bytes > 0).length).toBe(1);
  expect(simultaneous[2].outbound.filter((r) => r.bytes > 0).length).toBe(1);
  expect(simultaneous[1].inbound.length).toBe(1);
  expect(simultaneous[2].inbound.length).toBe(1);
  await c(student)
    .getByRole("button", { name: "暫時靜音麥克風", exact: true })
    .click();
  expect((await audioState(student)).microphoneTracks[0].enabled).toBe(false);
  await c(student)
    .getByRole("button", { name: "恢復麥克風", exact: true })
    .click();
  await closeDock(teacher);
  await teacher.getByRole("button", { name: "開啟選單", exact: true }).click();
  await teacher
    .getByRole("navigation", { name: "主要導覽" })
    .getByRole("link", { name: "靈感範例", exact: true })
    .click();
  await expect(
    teacher.getByText("麥克風已開啟", { exact: true }),
  ).toBeVisible();
  expect((await audioState(teacher)).microphonesRequested).toBe(1);
  await heard(teacher, 2);
  await teacher.getByRole("link", { name: "返回編輯器", exact: true }).click();
  await voiceTab(teacher);
  await teacher.screenshot({
    path: "artifacts/classroom-voice-public-teacher.png",
  });
  await student.screenshot({
    path: "artifacts/classroom-voice-public-student.png",
  });
  await closeDock(witness);
  await room(witness);
  await witness.getByRole("button", { name: "結束連線", exact: true }).click();
  expect((await audioState(witness)).microphoneTracks[0].readyState).toBe(
    "ended",
  );
  await expect(c(teacher)).toContainText("語音已連接 1 位同學");
  await witness.getByRole("button", { name: "加入教室", exact: false }).click();
  await expect(
    witness.getByText("已連線：1 位", { exact: true }),
  ).toBeVisible();
  await witness.getByRole("link", { name: "返回編輯器", exact: true }).click();
  await voiceTab(witness);
  await listen(witness);
  await heard(witness, 1);
  expect((await audioState(witness)).microphonesRequested).toBe(1);
  await expect(c(teacher)).toContainText("語音已連接 2 位同學");
  await c(teacher)
    .getByRole("button", { name: "關閉麥克風", exact: true })
    .click();
  await expect
    .poll(async () => (await audioState(student)).players.length)
    .toBe(0);
  await expect
    .poll(async () => (await audioState(witness)).players.length)
    .toBe(0);
  expect((await audioState(teacher)).microphoneTracks[0].readyState).toBe(
    "ended",
  );
  await heard(teacher, 1);
  await c(student)
    .getByRole("button", { name: "關閉麥克風", exact: true })
    .click();
  await expect
    .poll(async () => (await audioState(teacher)).players.length)
    .toBe(0);
  expect((await audioState(student)).microphoneTracks[0].readyState).toBe(
    "ended",
  );
  for (const page of [teacher, student, witness]) await closeDock(page);
  return {
    syntheticMicrophoneOnly: true,
    teacherToBothStudents: true,
    bothStudentsToTeacher: true,
    studentAudioPrivate: true,
    simultaneousDirections: true,
    nonzeroDecodedAudioEnergy: true,
    playbackAdvanced: true,
    listenWithoutMicrophone: true,
    muteResume: true,
    lateRejoinReceivesBroadcast: true,
    crossPageContinuity: true,
    stopReleasesTracksAndRemotePlayers: true,
    simultaneousRtp: simultaneous,
  };
}
