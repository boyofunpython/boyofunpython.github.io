import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  setup,
  peer,
  create,
  roomView,
  backToEditor,
} from "./fixtures/classroom";

test.use({ serviceWorkers: "block" });
const panel = (page: Page) =>
  page.getByRole("dialog", { name: "教室通訊", exact: true });
const controls = (page: Page) =>
  page.getByRole("region", { name: "教室語音控制" });
async function voiceTab(page: Page) {
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
  await panel(page).getByRole("button", { name: /^語音/ }).click();
}
async function microphone(
  page: Page,
  mode: "ok" | "denied" | "pending" = "ok",
) {
  await page.addInitScript((mode) => {
    const state = window as unknown as {
      micCount: number;
      micTracks: MediaStreamTrack[];
      micMode: string;
      resolveMic?: () => void;
    };
    state.micCount = 0;
    state.micTracks = [];
    state.micMode = mode;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        state.micCount++;
        if (state.micMode === "denied")
          throw new DOMException(
            "Synthetic permission rejection",
            "NotAllowedError",
          );
        if (state.micMode === "pending")
          await new Promise<void>((resolve) => {
            state.resolveMic = resolve;
          });
        const context = new AudioContext(),
          oscillator = context.createOscillator(),
          destination = context.createMediaStreamDestination();
        oscillator.connect(destination);
        oscillator.start();
        const track = destination.stream.getAudioTracks()[0],
          stop = track.stop.bind(track);
        track.stop = () => {
          stop();
          oscillator.stop();
          void context.close();
        };
        state.micTracks.push(track);
        return destination.stream;
      },
    });
  }, mode);
}
async function edit(page: Page) {
  await backToEditor(page);
  await page.getByRole("button", { name: "程式碼", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Python 程式碼", exact: true })
    .fill("print('voice keeps my draft')");
}
const mic = (page: Page) =>
  page.evaluate(() => {
    const s = window as unknown as {
      micCount: number;
      micTracks: MediaStreamTrack[];
    };
    return {
      requests: s.micCount,
      tracks: s.micTracks.map((t) => ({
        enabled: t.enabled,
        state: t.readyState,
      })),
    };
  });

test("teacher microphone reaches all students and late joiners, preserves editing, mutes and releases capture", async ({
  page,
}) => {
  await microphone(page);
  await setup(page);
  await create(page);
  await peer(page, (p) => {
    p.add("端 A");
    p.add("端 B");
  });
  await edit(page);
  await voiceTab(page);
  expect((await mic(page)).requests).toBe(0);
  await controls(page)
    .getByRole("button", { name: "開啟麥克風廣播", exact: true })
    .click();
  await expect(controls(page)).toContainText("語音已連接 2 位同學");
  expect(
    await peer(page, (p) =>
      p.calls.map((c) => ({
        peer: c.peer,
        tracks: c.localStream!.getAudioTracks().length,
      })),
    ),
  ).toHaveLength(2);
  await peer(page, (p) => p.add("晚加入端"));
  await expect(controls(page)).toContainText("語音已連接 3 位同學");
  await controls(page)
    .getByRole("button", { name: "暫時靜音麥克風", exact: true })
    .click();
  expect((await mic(page)).tracks).toEqual([{ enabled: false, state: "live" }]);
  await controls(page)
    .getByRole("button", { name: "恢復麥克風", exact: true })
    .click();
  await panel(page)
    .getByRole("button", { name: "收合教室通訊", exact: true })
    .click();
  await expect(page.getByText("麥克風已開啟", { exact: true })).toBeVisible();
  await page
    .getByRole("textbox", { name: "Python 程式碼", exact: true })
    .fill("print('continued voice edit')");
  await page.getByRole("button", { name: "開啟選單", exact: true }).click();
  await page
    .getByRole("navigation", { name: "主要導覽" })
    .getByRole("link", { name: "靈感範例", exact: true })
    .click();
  await expect(page.getByText("麥克風已開啟", { exact: true })).toBeVisible();
  expect((await mic(page)).requests).toBe(1);
  await page.getByRole("button", { name: "關閉麥克風", exact: true }).click();
  expect((await mic(page)).tracks[0].state).toBe("ended");
  expect(await peer(page, (p) => p.calls.every((c) => c.closed))).toBe(true);
  await roomView(page);
  await expect(page.getByText("已連線：3 位", { exact: true })).toBeVisible();
  await backToEditor(page);
  await expect(
    page.getByRole("textbox", { name: "Python 程式碼", exact: true }),
  ).toContainText("continued voice edit");
});

test("student can listen without microphone permission and speak only to the teacher concurrently", async ({
  page,
}) => {
  await microphone(page);
  await setup(page, "?peer=teacher-room");
  await page.getByLabel("你的暱稱", { exact: true }).fill("語音端");
  await page.getByRole("button", { name: "加入教室", exact: false }).click();
  await expect(page.getByText("已連線：1 位", { exact: true })).toBeVisible();
  await edit(page);
  await peer(page, (p) => {
    p.receiveVoice("stranger");
    p.receiveVoice(p.outgoing.peer, { kind: "wrong" });
    p.receiveVoice(p.outgoing.peer);
  });
  expect(
    await peer(page, (p) =>
      p.incomingCalls.map((c) => ({
        closed: c.closed,
        answered: !!c.answered,
        sentMicrophone: !!c.answerStream,
      })),
    ),
  ).toEqual([
    { closed: true, answered: false, sentMicrophone: false },
    { closed: true, answered: false, sentMicrophone: false },
    { closed: false, answered: true, sentMicrophone: false },
  ]);
  await voiceTab(page);
  await expect(controls(page)).toContainText("老師 · 語音連線中");
  expect((await mic(page)).requests).toBe(0);
  expect(
    await page
      .locator("audio[data-classroom-voice]")
      .evaluate((a: HTMLAudioElement) => a.paused),
  ).toBe(true);
  await controls(page)
    .getByRole("button", { name: "啟用語音收聽", exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .locator("audio[data-classroom-voice]")
        .evaluate((a: HTMLAudioElement) => a.paused),
    )
    .toBe(false);
  await controls(page).getByLabel("語音收聽音量", { exact: true }).fill("35");
  expect(
    await page
      .locator("audio[data-classroom-voice]")
      .evaluate((a: HTMLAudioElement) => a.volume),
  ).toBe(0.35);
  await controls(page)
    .getByRole("button", { name: "開啟麥克風傳給老師", exact: true })
    .click();
  await expect(controls(page)).toContainText("語音已連接 1 位老師");
  expect(await peer(page, (p) => p.calls.map((c) => c.peer))).toHaveLength(1);
  expect(await peer(page, (p) => p.calls[0].peer === p.outgoing.peer)).toBe(
    true,
  );
  await controls(page)
    .getByRole("button", { name: "關閉麥克風", exact: true })
    .click();
  await expect(page.locator("audio[data-classroom-voice]")).toHaveCount(1);
  await controls(page)
    .getByRole("button", { name: "暫停收聽", exact: true })
    .click();
  expect(
    await page
      .locator("audio[data-classroom-voice]")
      .evaluate((a: HTMLAudioElement) => a.paused),
  ).toBe(true);
  await panel(page)
    .getByRole("button", { name: "收合教室通訊", exact: true })
    .click();
  await roomView(page);
  if (!(await page.locator("dialog.classroom-settings").isVisible()))
    await roomView(page);
  await page.getByRole("button", { name: "結束連線", exact: true }).click();
  await expect(page.locator("audio[data-classroom-voice]")).toHaveCount(0);
  expect((await mic(page)).tracks[0].state).toBe("ended");
});

test("permission denial is actionable, voice errors leave data connected, and a removed microphone is released", async ({
  page,
}) => {
  await microphone(page, "denied");
  await setup(page);
  await create(page);
  await peer(page, (p) => p.add("端 A"));
  await voiceTab(page);
  await controls(page)
    .getByRole("button", { name: "開啟麥克風廣播", exact: true })
    .click();
  await expect(controls(page)).toContainText("麥克風權限未允許");
  await page.evaluate(() => {
    (window as unknown as { micMode: string }).micMode = "ok";
  });
  await controls(page)
    .getByRole("button", { name: "開啟麥克風廣播", exact: true })
    .click();
  await expect(controls(page)).toContainText("語音已連接 1 位同學");
  await peer(page, (p) => p.emit("error", { type: "webrtc" }));
  await expect(controls(page)).toContainText("文字與程式仍可使用");
  expect(await peer(page, (p) => p.destroyed)).toBe(false);
  await peer(page, (p) =>
    p.calls[0].emit("error", new Error("synthetic media failure")),
  );
  await expect(
    controls(page).getByRole("button", { name: "重試語音連線" }),
  ).toBeVisible();
  await controls(page).getByRole("button", { name: "重試語音連線" }).click();
  await expect(controls(page)).toContainText("語音已連接 1 位同學");
  await page.evaluate(() =>
    (
      window as unknown as { micTracks: MediaStreamTrack[] }
    ).micTracks[0].dispatchEvent(new Event("ended")),
  );
  await expect(controls(page)).toContainText("麥克風已中斷");
  expect((await mic(page)).tracks[0].state).toBe("ended");
  await panel(page).getByRole("button", { name: "訊息", exact: true }).click();
  await panel(page)
    .getByLabel("廣播訊息給全體同學", { exact: true })
    .fill("語音錯誤後仍可傳文字");
  await panel(page)
    .getByRole("button", { name: "廣播訊息", exact: true })
    .click();
  expect(await peer(page, (p) => p.connections[0].sent.at(-1))).toMatchObject({
    type: "message",
    text: "語音錯誤後仍可傳文字",
  });
});

test("cancelling or disconnecting while permission is pending stops a late microphone stream", async ({
  page,
}) => {
  await microphone(page, "pending");
  await setup(page);
  await create(page);
  await peer(page, (p) => p.add("端 A"));
  await voiceTab(page);
  await controls(page)
    .getByRole("button", { name: "開啟麥克風廣播", exact: true })
    .click();
  await controls(page)
    .getByRole("button", { name: "取消開啟麥克風", exact: true })
    .click();
  await page.evaluate(() =>
    (window as unknown as { resolveMic(): void }).resolveMic(),
  );
  await expect
    .poll(async () => (await mic(page)).tracks[0]?.state)
    .toBe("ended");
  expect(await peer(page, (p) => p.calls?.length ?? 0)).toBe(0);
  await controls(page)
    .getByRole("button", { name: "開啟麥克風廣播", exact: true })
    .click();
  await panel(page)
    .getByRole("button", { name: "收合教室通訊", exact: true })
    .click();
  if (!(await page.locator("dialog.classroom-settings").isVisible()))
    await roomView(page);
  await page.getByRole("button", { name: "結束連線", exact: true }).click();
  await page.evaluate(() =>
    (window as unknown as { resolveMic(): void }).resolveMic(),
  );
  await expect
    .poll(async () => (await mic(page)).tracks[1]?.state)
    .toBe("ended");
  await expect(page.getByText("麥克風已開啟", { exact: true })).toHaveCount(0);
});

test("voice stop ids cannot close another call and cancelled offers arriving late are rejected", async ({
  page,
}) => {
  await microphone(page);
  await setup(page);
  await create(page);
  await peer(page, (p) => {
    p.add("端 A");
    p.add("端 B");
    p.receiveVoice(p.connections[0].peer, {
      kind: "boyo-classroom-voice",
      version: 1,
      id: "active-A",
    });
  });
  await voiceTab(page);
  await expect(controls(page)).toContainText("端 A · 語音連線中");
  await peer(page, (p) =>
    p.connections[1].emit("data", { type: "voice-stop", id: "active-A" }),
  );
  await expect(page.locator("audio[data-classroom-voice]")).toHaveCount(1);
  await peer(page, (p) => {
    p.connections[0].emit("data", { type: "voice-stop", id: "active-A" });
    p.connections[0].emit("data", {
      type: "voice-stop",
      id: "cancel-before-offer",
    });
    p.receiveVoice(p.connections[0].peer, {
      kind: "boyo-classroom-voice",
      version: 1,
      id: "cancel-before-offer",
    });
  });
  await expect(page.locator("audio[data-classroom-voice]")).toHaveCount(0);
  expect(await peer(page, (p) => p.incomingCalls.at(-1)!.closed)).toBe(true);
  await peer(page, (p) => p.receiveVoice(p.connections[1].peer));
  await expect(controls(page)).toContainText("端 B · 語音連線中");
  await peer(page, (p) => p.connections[1].close());
  await expect(page.locator("audio[data-classroom-voice]")).toHaveCount(0);
  await expect(
    controls(page).getByRole("button", { name: "開啟麥克風廣播" }),
  ).toBeEnabled();
});

test("autoplay refusal offers an explicit retry and voice controls fit a phone with accessible controls", async ({
  page,
}) => {
  await microphone(page);
  await setup(page);
  await create(page);
  await peer(page, (p) => {
    p.add("端 A");
    p.receiveVoice(p.connections[0].peer);
  });
  await voiceTab(page);
  await page.evaluate(() => {
    const audio = document.querySelector<HTMLAudioElement>(
      "audio[data-classroom-voice]",
    )!;
    const original = audio.play.bind(audio);
    let first = true;
    audio.play = () => {
      if (first) {
        first = false;
        return Promise.reject(
          new DOMException("Synthetic autoplay block", "NotAllowedError"),
        );
      }
      return original();
    };
  });
  await controls(page)
    .getByRole("button", { name: "啟用語音收聽", exact: true })
    .click();
  await expect(
    controls(page).getByRole("button", { name: "點此播放語音", exact: true }),
  ).toBeVisible();
  await controls(page)
    .getByRole("button", { name: "點此播放語音", exact: true })
    .click();
  await expect(
    controls(page).getByRole("button", { name: "暫停收聽", exact: true }),
  ).toBeVisible();
  await controls(page)
    .getByRole("button", { name: "開啟麥克風廣播", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(controls(page)).toContainText("語音已連接 1 位同學");
  const bounds = (await panel(page).boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  expect(
    (await new AxeBuilder({ page }).include(".classroom-comms").analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: "artifacts/classroom-voice-mobile.png" });
});

test("stalled voice calls time out independently and explicit retry and broker reconnect do not reopen capture", async ({
  page,
}) => {
  await microphone(page);
  await setup(page);
  await create(page);
  await peer(page, (p) => {
    p.add("端 A");
    p.stallVoice = true;
  });
  await voiceTab(page);
  await page.clock.install();
  await controls(page)
    .getByRole("button", { name: "開啟麥克風廣播", exact: true })
    .click();
  await expect(controls(page)).toContainText("語音已連接 0 位同學");
  await peer(page, (p) => p.emit("error", { type: "peer-unavailable" }));
  expect(await peer(page, (p) => p.destroyed)).toBe(false);
  await page.clock.fastForward(21000);
  await expect(controls(page)).toContainText("有一條語音連線未成功");
  expect(await peer(page, (p) => p.destroyed)).toBe(false);
  expect(await peer(page, (p) => p.calls.length)).toBe(1);
  await peer(page, (p) => {
    p.stallVoice = false;
  });
  await controls(page)
    .getByRole("button", { name: "重試語音連線", exact: true })
    .click();
  await expect(controls(page)).toContainText("語音已連接 1 位同學");
  expect((await mic(page)).requests).toBe(1);
  await peer(page, (p) => p.emit("disconnected"));
  await panel(page)
    .getByRole("button", { name: "收合教室通訊", exact: true })
    .click();
  await roomView(page);
  await page.getByRole("button", { name: "重新連接服務", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "複製教室連結", exact: true }),
  ).toBeEnabled();
  expect(await peer(page, (p) => p.calls.length)).toBe(2);
  expect((await mic(page)).requests).toBe(1);
  if (!(await page.locator("dialog.classroom-settings").isVisible()))
    await roomView(page);
  await page.getByRole("button", { name: "結束連線", exact: true }).click();
  expect((await mic(page)).tracks[0].state).toBe("ended");
});
