import { expect, type Page } from "@playwright/test";
const fixture = `
class Connection {
  constructor(name='測試端') { this.metadata={name}; this.peer='test-'+Math.random(); this.open=false; this.handlers={}; this.sent=[]; }
  on(event, fn) { this.handlers[event]=fn; }
  emit(event, data) { if(event==='open')this.open=true; if(event==='close')this.open=false; this.handlers[event]?.(data); }
  send(data) { this.sent.push(data); }
  close() { this.emit('close'); }
}
class MediaCall {
  constructor(peer, stream, metadata) { this.peer=peer; this.localStream=stream; this.metadata=metadata; this.handlers={}; this.closed=false; this.peerConnection=new EventTarget(); this.peerConnection.connectionState='new'; }
  on(event, fn) { this.handlers[event]=fn; }
  emit(event, value) { this.handlers[event]?.(value); }
  answer(stream) { this.answered=true; this.answerStream=stream; }
  connect() { this.peerConnection.connectionState='connected'; this.peerConnection.dispatchEvent(new Event('connectionstatechange')); }
  close() { if(this.closed)return; this.closed=true; this.peerConnection.connectionState='closed'; this.emit('close'); }
}
class Peer {
  constructor() { this.handlers={}; this.disconnected=false; this.destroyed=false; this.connectCount=0; window.room=this; this.id='test-room-'+(window.roomCount=(window.roomCount||0)+1); }
  on(event,fn) { this.handlers[event]=fn; if(event==='open')setTimeout(()=>fn(this.id),5); }
  emit(event,data) { if(event==='disconnected')this.disconnected=true; this.handlers[event]?.(data); }
  connect(id,options) { this.connectCount++; this.target=id; this.options=options; this.outgoing=new Connection(); setTimeout(()=>this.outgoing.emit('open'),5); return this.outgoing; }
  add(name) { const c=new Connection(name); this.connections??=[];this.connections.push(c); this.emit('connection',c); c.emit('open'); return c; }
  call(id,stream,options) { const call=new MediaCall(id,stream,options.metadata); this.calls??=[]; this.calls.push(call); if(!this.stallVoice)setTimeout(()=>call.connect(),5); return call; }
  receiveVoice(id,metadata={kind:'boyo-classroom-voice',version:1,id:'voice-'+Math.random().toString(36).slice(2)}) { const call=new MediaCall(id,undefined,metadata); this.incomingCalls??=[]; this.incomingCalls.push(call); this.emit('call',call); if(call.answered) { const context=new AudioContext(); const oscillator=context.createOscillator(); const dest=context.createMediaStreamDestination(); oscillator.connect(dest); oscillator.start(); call.stream=dest.stream; call.context=context; call.emit('stream',dest.stream); } return call; }
  disconnect() { this.emit('disconnected'); }
  reconnect() { this.disconnected=false; setTimeout(()=>this.emit('open',this.id),5); }
  destroy() { this.destroyed=true; this.outgoing?.close(); this.connections?.forEach(c=>c.close()); this.emit('close'); }
}
export function createClassroomPeer(){return new Peer();}
`;
export async function setup(page: Page, query = "") {
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
export type TestConnection = {
  peer: string;
  open: boolean;
  sent: unknown[];
  send(data: unknown): void;
  emit(event: string, data?: unknown): void;
  close(): void;
};
export type TestMediaCall = {
  peer: string;
  metadata: unknown;
  closed: boolean;
  answered?: boolean;
  answerStream?: MediaStream;
  localStream?: MediaStream;
  stream?: MediaStream;
  emit(event: string, value?: unknown): void;
  close(): void;
};
export type TestPeer = {
  id: string;
  destroyed: boolean;
  connectCount: number;
  target: string;
  options: unknown;
  stallVoice: boolean;
  calls: TestMediaCall[];
  incomingCalls: TestMediaCall[];
  receiveVoice(id: string, metadata?: unknown): TestMediaCall;
  connections: TestConnection[];
  outgoing: TestConnection;
  add(name?: unknown): TestConnection;
  emit(event: string, data?: unknown): void;
};
export const peer = (page: Page, code: (room: TestPeer) => unknown) =>
  page.evaluate((code) => {
    const fn = new Function("room", `return (${code})(room)`);
    return fn((window as unknown as { room: TestPeer }).room);
  }, code.toString());
export async function create(page: Page) {
  await page.getByRole("button", { name: "建立教室", exact: false }).click();
  await expect(page.getByLabel("連線 ID", { exact: true })).not.toHaveValue("");
}
export async function roomView(page: Page) {
  await page.getByRole("button", { name: "開啟選單", exact: true }).click();
  await page.getByRole("link", { name: "一起學習", exact: true }).click();
}
