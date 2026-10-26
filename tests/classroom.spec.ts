import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  CLASSROOM_TIMEOUT,
  MAX_INBOX,
  classroomShareURL,
  classroomName,
} from "../src/classroom";

// CI remains deterministic. Public-cloud acceptance uses two isolated real
// browsers and synthetic data via artifacts/verify-public-classroom.mjs.
test.use({ serviceWorkers: "block" });
const fixture = `
class Connection {
  constructor(name='測試端') { this.metadata={name}; this.peer='test-'+Math.random(); this.open=false; this.handlers={}; this.sent=[]; }
  on(event, fn) { this.handlers[event]=fn; }
  emit(event, data) { if(event==='open')this.open=true; if(event==='close')this.open=false; this.handlers[event]?.(data); }
  send(data) { this.sent.push(data); }
  close() { this.emit('close'); }
}
class Peer {
  constructor() { this.handlers={}; this.disconnected=false; this.destroyed=false; this.connectCount=0; window.room=this; this.id='test-room-'+(window.roomCount=(window.roomCount||0)+1); }
  on(event,fn) { this.handlers[event]=fn; if(event==='open')setTimeout(()=>fn(this.id),5); }
  emit(event,data) { if(event==='disconnected')this.disconnected=true; this.handlers[event]?.(data); }
  connect(id,options) { this.connectCount++; this.target=id; this.options=options; this.outgoing=new Connection(); setTimeout(()=>this.outgoing.emit('open'),5); return this.outgoing; }
  add(name) { const c=new Connection(name); this.connections??=[];this.connections.push(c); this.emit('connection',c); c.emit('open'); return c; }
  disconnect() { this.emit('disconnected'); }
  reconnect() { this.disconnected=false; setTimeout(()=>this.emit('open',this.id),5); }
  destroy() { this.destroyed=true; this.outgoing?.close(); this.connections?.forEach(c=>c.close()); this.emit('close'); }
}
export function createClassroomPeer(){return new Peer();}
`;
async function setup(page: Page, query = "") {
  await page.route("**/assets/classroom-peer-*.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: fixture }),
  );
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as unknown as { copiedLink: string }).copiedLink = text;
        },
      },
    });
    localStorage.setItem(
      "boyo-studio-v1",
      JSON.stringify({
        activeId: "main",
        files: [
          { id: "main", name: "main.py", code: "print('original lesson')" },
        ],
      }),
    );
  });
  await page.goto(`/${query}#/classroom`);
}
type TestConnection = {
  open: boolean;
  sent: unknown[];
  send(data: unknown): void;
  emit(event: string, data?: unknown): void;
  close(): void;
};
type TestPeer = {
  id: string;
  destroyed: boolean;
  connectCount: number;
  target: string;
  options: unknown;
  connections: TestConnection[];
  outgoing: TestConnection;
  add(name?: unknown): TestConnection;
  emit(event: string, data?: unknown): void;
};
const peer = (page: Page, code: (room: TestPeer) => unknown) =>
  page.evaluate((code) => {
    const fn = new Function("room", `return (${code})(room)`);
    return fn((window as unknown as { room: TestPeer }).room);
  }, code.toString());
async function create(page: Page) {
  await page.getByRole("button", { name: "建立教室", exact: false }).click();
  await expect(page.getByLabel("連線 ID", { exact: true })).not.toHaveValue("");
}
async function roomView(page: Page) {
  await page.getByRole("button", { name: "開啟選單", exact: true }).click();
  await page.getByRole("link", { name: "一起學習", exact: true }).click();
}

test("share URL preserves deployment path and shares only the current room ID", () => {
  const url = classroomShareURL(
    "new-room-id",
    "https://example.test/python/?peer=old-room&unrelated=private#/assistant",
  );
  expect(url).toBe("https://example.test/python/?peer=new-room-id#/classroom");
  expect(
    new URL(
      classroomShareURL("room id", "https://example.test/#/"),
    ).searchParams.get("peer"),
  ).toBe("room id");
  expect(classroomName({ name: { bad: true } })).toBe("同學");
  expect(classroomName({ name: "  demo  " })).toBe("demo");
  expect(classroomName({ name: "a".repeat(100) })).toHaveLength(40);
});

test("teacher link copies exactly, pre-fills student ID and survives editing", async ({
  page,
}) => {
  await setup(page, "?unrelated=not-shared&peer=older-room");
  await create(page);
  const link = await page
    .getByLabel("教室分享連結", { exact: true })
    .inputValue();
  expect(new URL(link).search).toBe("?peer=test-room-1");
  await page.getByRole("button", { name: "複製教室連結", exact: true }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as { copiedLink: string }).copiedLink,
    ),
  ).toBe(link);
  await peer(page, (p) => p.add("端 A"));
  await page.getByRole("link", { name: "返回編輯器", exact: true }).click();
  await page.getByRole("button", { name: "程式碼", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Python 程式碼", exact: true })
    .fill("print('updated lesson')");
  expect(await peer(page, (p) => p.destroyed)).toBe(false);
  await roomView(page);
  await expect(page.getByLabel("教室分享連結", { exact: true })).toHaveValue(
    link,
  );
  await page
    .getByRole("button", { name: "傳送目前程式給同學", exact: true })
    .click();
  expect(await peer(page, (p) => p.connections[0].sent)).toEqual([
    { type: "teacherInfo", code: "print('updated lesson')" },
  ]);
  await page.getByRole("button", { name: "結束連線", exact: true }).click();
  expect(await peer(page, (p) => p.destroyed)).toBe(true);
  await page.goto(link);
  await expect(page.getByLabel("老師的連線 ID", { exact: true })).toHaveValue(
    "test-room-1",
  );
  await page.getByLabel("你的暱稱", { exact: true }).fill("測試加入端");
  await page.getByRole("button", { name: "加入教室", exact: false }).click();
  await expect(page.getByText("已連線：1 位", { exact: true })).toBeVisible();
  expect(await peer(page, (p) => p.target)).toBe("test-room-1");
  expect(await peer(page, (p) => p.options)).toEqual({
    metadata: { name: "測試加入端" },
  });
});

test("one failed student does not end the teacher room and unsafe metadata is plain text", async ({
  page,
}) => {
  await setup(page);
  await create(page);
  await peer(page, (p) => {
    p.add("端 A");
    p.add({ bad: "metadata" });
    p.add("端 C");
  });
  await expect(page.getByText("已連線：3 位", { exact: true })).toBeVisible();
  await peer(page, (p) => p.connections[0].emit("error"));
  await expect(page.getByText("已連線：2 位", { exact: true })).toBeVisible();
  await expect(page.getByLabel("連線 ID", { exact: true })).toHaveValue(
    "test-room-1",
  );
  await peer(page, (p) => {
    p.connections[1].send = () => {
      throw Error("closed channel");
    };
  });
  await page
    .getByRole("button", { name: "傳送目前程式給同學", exact: true })
    .click();
  expect(await peer(page, (p) => p.connections[2].sent)).toHaveLength(1);
  await expect(page.getByText("已連線：1 位", { exact: true })).toBeVisible();
  expect(await peer(page, (p) => p.destroyed)).toBe(false);
});

test("blocked clipboard leaves a manually usable share URL and broker reconnect restores sharing", async ({
  page,
}) => {
  await setup(page);
  await create(page);
  const original = await page
    .getByLabel("教室分享連結", { exact: true })
    .inputValue();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw Error("denied");
        },
      },
    });
  });
  await page.getByRole("button", { name: "複製教室連結", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("手動複製");
  await expect(page.getByLabel("教室分享連結", { exact: true })).toHaveValue(
    original,
  );
  await peer(page, (p) => p.emit("disconnected"));
  await expect(
    page.getByRole("button", { name: "複製教室連結", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "重新連接服務", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "複製教室連結", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("教室分享連結", { exact: true })).toHaveValue(
    original,
  );
});

test("broker reconnect keeps room ID and student does not create duplicate data channels", async ({
  page,
}) => {
  await setup(page, "?peer=teacher-room");
  await page.getByLabel("你的暱稱", { exact: true }).fill("測試端");
  await page.getByRole("button", { name: "加入教室", exact: false }).click();
  await expect(page.getByText("已連線：1 位", { exact: true })).toBeVisible();
  await peer(page, (p) => p.emit("disconnected"));
  await page.getByRole("button", { name: "重新連接服務", exact: true }).click();
  await expect(
    page.getByText("教室服務已重新連接", { exact: true }),
  ).toBeVisible();
  expect(await peer(page, (p) => p.connectCount)).toBe(1);
  expect(await peer(page, (p) => p.destroyed)).toBe(false);
});

test("expired link, timeout and inbox after disconnect preserve the user's Python", async ({
  page,
}) => {
  await setup(page, "?peer=expired-room");
  await page.getByLabel("你的暱稱", { exact: true }).fill("測試端");
  await page.getByRole("button", { name: "加入教室", exact: false }).click();
  await expect(page.getByText("已連線：1 位", { exact: true })).toBeVisible();
  await peer(page, (p) => p.emit("error", { type: "peer-unavailable" }));
  await expect(page.getByRole("alert")).toContainText("最新的分享連結");
  await page.getByRole("button", { name: "加入教室", exact: false }).click();
  await expect(page.getByText("已連線：1 位", { exact: true })).toBeVisible();
  await peer(page, (p) => {
    for (let i = 0; i < 25; i++)
      p.outgoing.emit("data", { type: "teacherInfo", code: `print(${i})` });
  });
  await expect(page.locator(".inbox")).toHaveCount(MAX_INBOX);
  await page.getByRole("button", { name: "結束連線", exact: true }).click();
  await page
    .locator(".inbox")
    .last()
    .getByRole("button", { name: "另存並開啟", exact: true })
    .click();
  await expect(page.getByLabel("目前檔案", { exact: true })).toContainText(
    "FromTeacher.py",
  );
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("boyo-studio-v1")!).files.find(
          (f: { id: string }) => f.id === "main",
        ).code,
    ),
  ).toBe("print('original lesson')");
  await roomView(page);
  await create(page);
  await page.clock.install();
  await peer(page, (p) => p.emit("disconnected"));
  await page.evaluate(() => {
    (window as unknown as { room: { reconnect(): void } }).room.reconnect =
      () => {};
  });
  await page.getByRole("button", { name: "重新連接服務", exact: true }).click();
  // A late data channel must not cancel the teacher's signaling reconnect timer.
  await peer(page, (p) => p.add("late test channel"));
  await page.clock.fastForward(CLASSROOM_TIMEOUT + 1);
  await expect(page.getByRole("alert")).toContainText("連線逾時");
  await expect(
    page.getByRole("button", { name: "建立教室", exact: false }),
  ).toBeEnabled();
});

test("teacher share controls fit a phone and pass automated accessibility checks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await create(page);
  const report = await new AxeBuilder({ page }).analyze();
  expect(report.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByLabel("教室分享連結", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/classroom-share-mobile.png" });
});
