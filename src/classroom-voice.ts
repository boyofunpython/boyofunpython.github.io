import type { DataConnection, MediaConnection, Peer } from "peerjs";
import { classroomName, type ClassroomRole } from "./classroom";

export interface VoiceState {
  microphone: "off" | "requesting" | "on";
  muted: boolean;
  sending: number;
  receiving: { peer: string; name: string }[];
  listening: boolean;
  playbackBlocked: boolean;
  volume: number;
  error: string;
}
export const initialVoiceState: VoiceState = {
  microphone: "off",
  muted: false,
  sending: 0,
  receiving: [],
  listening: false,
  playbackBlocked: false,
  volume: 0.8,
  error: "",
};
const VOICE_KIND = "boyo-classroom-voice";
const CALL_TIMEOUT = 20_000;
type Outgoing = {
  call: MediaConnection;
  id: string;
  timer?: ReturnType<typeof setTimeout>;
  connected: boolean;
};
type Incoming = {
  call: MediaConnection;
  id: string;
  audio?: HTMLAudioElement;
  timer?: ReturnType<typeof setTimeout>;
  name: string;
};

// One independent, receive-only media call per sender/recipient. Answering an
// incoming call never grants it access to the receiver's microphone.
export class ClassroomVoice {
  private state = { ...initialVoiceState };
  private peer: Peer | null = null;
  private role: ClassroomRole | null = null;
  private signaling = false;
  private generation = 0;
  private request = 0;
  private stream: MediaStream | null = null;
  private connections = new Map<string, DataConnection>();
  private outgoing = new Map<string, Outgoing>();
  private incoming = new Map<string, Incoming>();
  private pending = new Map<
    string,
    { call: MediaConnection; timer: ReturnType<typeof setTimeout> }
  >();
  private cancelled = new Set<string>();

  constructor(private changed: (state: VoiceState) => void) {}

  private publish(patch: Partial<VoiceState> = {}) {
    this.state = {
      ...this.state,
      ...patch,
      sending: [...this.outgoing.values()].filter((i) => i.connected).length,
      receiving: [...this.incoming.entries()]
        .filter(([, i]) => i.audio)
        .map(([peer, i]) => ({ peer, name: i.name })),
    };
    this.changed(this.state);
  }
  bind(peer: Peer, role: ClassroomRole) {
    this.reset();
    this.peer = peer;
    this.role = role;
  }
  setSignaling(open: boolean) {
    this.signaling = open;
    if (open && this.stream)
      for (const connection of this.connections.values()) this.send(connection);
  }
  add(connection: DataConnection) {
    const previous = this.connections.get(connection.peer);
    if (previous && previous !== connection) this.remove(previous);
    this.connections.set(connection.peer, connection);
    const pending = this.pending.get(connection.peer);
    if (connection.open && pending) {
      this.pending.delete(connection.peer);
      clearTimeout(pending.timer);
      this.receive(pending.call);
    }
    if (this.stream) this.send(connection);
  }
  remove(connection: DataConnection) {
    if (this.connections.get(connection.peer) !== connection) return;
    this.connections.delete(connection.peer);
    const pending = this.pending.get(connection.peer);
    if (pending) {
      clearTimeout(pending.timer);
      pending.call.close();
      this.pending.delete(connection.peer);
    }
    this.closeOutgoing(connection.peer, false);
    this.closeIncoming(connection.peer);
    this.publish();
  }
  private closeOutgoing(peer: string, notify = true) {
    const entry = this.outgoing.get(peer);
    if (!entry) return;
    this.outgoing.delete(peer);
    clearTimeout(entry.timer);
    if (notify) {
      const connection = this.connections.get(peer);
      try {
        if (connection?.open)
          connection.send({ type: "voice-stop", id: entry.id });
      } catch {
        /* Audio stop must not close the text channel. */
      }
    }
    entry.call.close();
  }
  private closeIncoming(peer: string) {
    const entry = this.incoming.get(peer);
    if (!entry) return;
    this.incoming.delete(peer);
    clearTimeout(entry.timer);
    if (entry.audio) {
      entry.audio.pause();
      entry.audio.srcObject = null;
      entry.audio.remove();
    }
    entry.call.close();
  }
  control(connection: DataConnection, raw: unknown): boolean {
    if (
      !raw ||
      typeof raw !== "object" ||
      !("type" in raw) ||
      raw.type !== "voice-stop"
    )
      return false;
    if (
      this.connections.get(connection.peer) === connection &&
      "id" in raw &&
      typeof raw.id === "string" &&
      /^[a-zA-Z0-9_-]{1,80}$/.test(raw.id)
    ) {
      this.cancelled.add(`${connection.peer}:${raw.id}`);
      if (this.cancelled.size > 1000)
        this.cancelled.delete(this.cancelled.values().next().value!);
      if (this.incoming.get(connection.peer)?.id === raw.id) {
        this.closeIncoming(connection.peer);
        this.publish();
      }
    }
    return true;
  }
  async start() {
    if (this.state.microphone !== "off") return;
    if (
      !this.peer ||
      !this.signaling ||
      ![...this.connections.values()].some((c) => c.open)
    ) {
      this.publish({ error: "請先連接教室與對方，再開啟麥克風。" });
      return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.publish({
        error:
          "此瀏覽器無法取得麥克風。請使用 HTTPS 網站（本機開發可用 localhost）與支援的瀏覽器。",
      });
      return;
    }
    const generation = this.generation,
      request = ++this.request;
    this.publish({ microphone: "requesting", error: "" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      if (generation !== this.generation || request !== this.request) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      if (
        !stream.getAudioTracks().some((track) => track.readyState === "live")
      ) {
        stream.getTracks().forEach((track) => track.stop());
        throw new DOMException("No live audio track", "NotFoundError");
      }
      this.stream = stream;
      for (const track of stream.getAudioTracks())
        track.addEventListener("ended", () => {
          if (this.stream !== stream) return;
          this.stop();
          this.publish({ error: "麥克風已中斷，請確認裝置後重新開啟。" });
        });
      this.publish({ microphone: "on", muted: false });
      for (const connection of this.connections.values()) this.send(connection);
    } catch (error) {
      if (generation !== this.generation || request !== this.request) return;
      const name = error instanceof DOMException ? error.name : "";
      this.publish({
        microphone: "off",
        error:
          name === "NotAllowedError"
            ? "麥克風權限未允許。請在瀏覽器允許此網站使用麥克風，再重新開啟。"
            : name === "NotFoundError"
              ? "找不到可用的麥克風。請接上裝置後重試。"
              : "無法開啟麥克風。請確認裝置未被占用，以及瀏覽器的麥克風權限。",
      });
    }
  }
  stop() {
    this.request++;
    const stream = this.stream;
    this.stream = null;
    stream?.getTracks().forEach((track) => track.stop());
    for (const peer of [...this.outgoing.keys()]) this.closeOutgoing(peer);
    this.publish({ microphone: "off", muted: false });
  }
  mute() {
    if (!this.stream) return;
    const muted = !this.state.muted;
    this.stream.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    this.publish({ muted });
  }
  retry() {
    this.publish({ error: "" });
    if (this.stream)
      for (const connection of this.connections.values()) this.send(connection);
  }
  private send(connection: DataConnection) {
    if (
      !this.peer ||
      !this.stream ||
      !this.signaling ||
      !connection.open ||
      this.outgoing.has(connection.peer)
    )
      return;
    try {
      const id = crypto.randomUUID();
      const call = this.peer.call(connection.peer, this.stream, {
        metadata: { kind: VOICE_KIND, version: 1, id },
      });
      if (!call) throw new Error("Media call was not created");
      const entry: Outgoing = { call, id, connected: false };
      this.outgoing.set(connection.peer, entry);
      const current = () => this.outgoing.get(connection.peer) === entry;
      const failed = () => {
        if (!current()) return;
        this.closeOutgoing(connection.peer);
        this.publish({
          error:
            "有一條語音連線未成功。文字與程式仍可使用，可按「重試語音連線」。",
        });
      };
      call.on("error", failed);
      call.on("close", () => {
        if (!current()) return;
        this.closeOutgoing(connection.peer, false);
        this.publish();
      });
      const check = () => {
        if (!current()) return;
        if (call.peerConnection?.connectionState === "connected") {
          entry.connected = true;
          clearTimeout(entry.timer);
          entry.timer = undefined;
          this.publish();
        } else if (
          ["failed", "closed"].includes(call.peerConnection?.connectionState)
        )
          failed();
        else if (call.peerConnection?.connectionState === "disconnected") {
          entry.connected = false;
          if (!entry.timer) entry.timer = setTimeout(failed, CALL_TIMEOUT);
          this.publish();
        }
      };
      call.peerConnection?.addEventListener("connectionstatechange", check);
      entry.timer = setTimeout(failed, CALL_TIMEOUT);
      check();
    } catch {
      this.publish({
        error: "無法建立語音連線。請確認教室服務已連接，再按「重試語音連線」。",
      });
    }
  }
  receive(call: MediaConnection) {
    const connection = this.connections.get(call.peer);
    const metadata: unknown = call.metadata;
    if (
      !connection ||
      !this.role ||
      !metadata ||
      typeof metadata !== "object" ||
      !("kind" in metadata) ||
      metadata.kind !== VOICE_KIND ||
      !("version" in metadata) ||
      metadata.version !== 1 ||
      !("id" in metadata) ||
      typeof metadata.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(metadata.id)
    ) {
      call.close();
      return;
    }
    if (this.cancelled.has(`${call.peer}:${metadata.id}`)) {
      call.close();
      return;
    }
    if (!connection.open) {
      const previous = this.pending.get(call.peer);
      if (previous) {
        clearTimeout(previous.timer);
        previous.call.close();
      }
      this.pending.set(call.peer, {
        call,
        timer: setTimeout(() => {
          if (this.pending.get(call.peer)?.call !== call) return;
          this.pending.delete(call.peer);
          call.close();
        }, CALL_TIMEOUT),
      });
      return;
    }
    const previous = this.incoming.get(call.peer);
    if (previous?.id === metadata.id) {
      call.close();
      return;
    }
    this.closeIncoming(call.peer);
    const entry: Incoming = {
      call,
      id: metadata.id,
      name:
        this.role === "student" ? "老師" : classroomName(connection.metadata),
    };
    this.incoming.set(call.peer, entry);
    const current = () => this.incoming.get(call.peer) === entry;
    const finish = () => {
      if (!current()) return;
      this.closeIncoming(call.peer);
      this.publish();
    };
    call.on("close", finish);
    call.on("error", () => {
      if (!current()) return;
      finish();
      this.publish({ error: "收到的語音連線中斷，請對方重新開啟麥克風。" });
    });
    call.on("stream", (stream) => {
      if (!current()) return;
      if (!stream.getAudioTracks().length || stream.getVideoTracks().length) {
        finish();
        return;
      }
      clearTimeout(entry.timer);
      const audio = entry.audio ?? document.createElement("audio");
      audio.hidden = true;
      audio.dataset.classroomVoice = call.peer;
      audio.srcObject = stream;
      audio.volume = this.state.volume;
      if (!entry.audio) document.body.appendChild(audio);
      entry.audio = audio;
      stream.addEventListener("inactive", finish);
      stream
        .getAudioTracks()
        .forEach((track) => track.addEventListener("ended", finish));
      if (this.state.listening) this.play(entry);
      this.publish();
    });
    entry.timer = setTimeout(() => {
      if (!current()) return;
      finish();
      this.publish({ error: "語音接收逾時。請對方重新開啟麥克風。" });
    }, CALL_TIMEOUT);
    try {
      call.answer();
    } catch {
      finish();
    }
  }
  private play(entry: Incoming) {
    const generation = this.generation;
    entry.audio?.play().catch(() => {
      if (
        generation === this.generation &&
        this.incoming.get(entry.call.peer) === entry &&
        this.state.listening
      )
        this.publish({ playbackBlocked: true });
    });
  }
  listen(enabled: boolean) {
    this.publish({ listening: enabled, playbackBlocked: false });
    for (const entry of this.incoming.values()) {
      if (enabled) this.play(entry);
      else entry.audio?.pause();
    }
  }
  setVolume(volume: number) {
    const value = Math.max(0, Math.min(1, volume));
    for (const entry of this.incoming.values())
      if (entry.audio) entry.audio.volume = value;
    this.publish({ volume: value });
  }
  mediaError() {
    this.publish({
      error: "語音連線發生錯誤；文字與程式仍可使用。請重試語音連線。",
    });
  }
  hasPendingCalls() {
    return [...this.outgoing.values()].some((entry) => !entry.connected);
  }
  reset() {
    this.generation++;
    this.stop();
    for (const peer of [...this.incoming.keys()]) this.closeIncoming(peer);
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.call.close();
    }
    this.pending.clear();
    this.cancelled.clear();
    this.connections.clear();
    this.peer = null;
    this.role = null;
    this.signaling = false;
    this.publish({ ...initialVoiceState });
  }
}
