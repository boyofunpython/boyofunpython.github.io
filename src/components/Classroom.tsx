import { useEffect, useRef, useState } from "react";
import { Copy, Radio, Send, Unplug, Users, LoaderCircle } from "lucide-react";
import type { Peer as PeerClient, DataConnection as Connection } from "peerjs";

export function Classroom({
  getCode,
  receive,
}: {
  getCode: () => string;
  receive: (code: string, name: string) => void;
}) {
  const [role, setRole] = useState<"teacher" | "student" | null>(null);
  const [id, setId] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [teacher, setTeacher] = useState(
    new URLSearchParams(location.search).get("peer") ?? "",
  );
  const [name, setName] = useState("");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [inbox, setInbox] = useState<
    { code: string; name: string; key: string }[]
  >([]);
  const peer = useRef<PeerClient | null>(null);
  const allConnections = useRef<Connection[]>([]);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const session = useRef(0);
  useEffect(
    () => () => {
      session.current++;
      clearTimeout(timeout.current);
      peer.current?.destroy();
    },
    [],
  );
  function disconnect() {
    session.current++;
    clearTimeout(timeout.current);
    const client = peer.current;
    peer.current = null;
    client?.destroy();
    allConnections.current = [];
    setConnections([]);
    setId("");
    setRole(null);
    setStatus("");
  }
  async function connect(nextRole: "teacher" | "student") {
    if (nextRole === "student" && (!teacher.trim() || !name.trim())) {
      setError("請輸入連線 ID 和你的暱稱。");
      return;
    }
    setError("");
    setRole(nextRole);
    setStatus("正在建立連線…");
    const token = ++session.current;
    try {
      const { createClassroomPeer } = await import("../classroom-peer");
      if (token !== session.current) return;
      const client = createClassroomPeer();
      peer.current = client;
      timeout.current = setTimeout(() => {
        disconnect();
        setError("連線逾時。請確認教室服務與網路後再試一次。");
      }, 15000);
      function attach(connection: Connection) {
        connection.on("open", () => {
          if (token !== session.current) return;
          clearTimeout(timeout.current);
          allConnections.current = [...allConnections.current, connection];
          setConnections([...allConnections.current]);
          setStatus("已連線");
        });
        connection.on("data", (raw) => {
          if (token !== session.current) return;
          if (!raw || typeof raw !== "object") return;
          const data = raw as { type?: string; code?: string };
          if (
            (data.type === "teacherInfo" || data.type === "code") &&
            typeof data.code === "string" &&
            data.code.length <= 1000000
          ) {
            setInbox((items) => [
              ...items,
              {
                code: data.code!,
                name:
                  nextRole === "student"
                    ? "老師"
                    : (connection.metadata?.name ?? "同學"),
                key: crypto.randomUUID(),
              },
            ]);
          }
        });
        connection.on("close", () => {
          if (token !== session.current) return;
          allConnections.current = allConnections.current.filter(
            (c) => c !== connection,
          );
          setConnections([...allConnections.current]);
          if (nextRole === "student") {
            disconnect();
            setError("與老師的連線已結束，請重新連線。");
          }
        });
        connection.on("error", () => {
          if (token !== session.current) return;
          disconnect();
          setError("傳輸失敗，請重新連線。");
        });
      }
      client.on("open", (value) => {
        if (token !== session.current) return;
        setId(String(value));
        if (nextRole === "teacher") {
          clearTimeout(timeout.current);
          setStatus("教室已開啟，等待同學加入");
        } else
          attach(
            client.connect(teacher.trim(), { metadata: { name: name.trim() } }),
          );
      });
      client.on("connection", (value) => {
        if (nextRole === "teacher") attach(value as Connection);
        else (value as Connection).close();
      });
      client.on("error", () => {
        if (token !== session.current) return;
        disconnect();
        setError("無法連接教室服務。請檢查 ID 與網路，或稍後再試。");
      });
    } catch {
      disconnect();
      setError("連線功能載入失敗，請稍後再試。");
    }
  }
  async function copyLink() {
    try {
      const url = new URL(location.href);
      url.searchParams.set("peer", id);
      url.hash = "/classroom";
      await navigator.clipboard.writeText(url.href);
      setStatus("教室連結已複製");
    } catch {
      setError("無法複製，請手動複製上方的連線 ID。");
    }
  }
  function send() {
    try {
      const live = allConnections.current.filter((c) => c.open);
      if (!live.length) throw new Error();
      live.forEach((c) =>
        c.send({
          type: role === "teacher" ? "teacherInfo" : "code",
          code: getCode(),
        }),
      );
      setStatus(
        `已傳送給 ${live.length} 位${role === "teacher" ? "同學" : "老師"}`,
      );
    } catch {
      setError("傳送失敗，請確認連線後再試一次。");
    }
  }
  return (
    <div className="classroom-content">
      <div className="page-intro">
        <span className="eyebrow">LEARN TOGETHER</span>
        <h1>一起寫，學得更多。</h1>
        <p>
          老師分享示範，同學交流想法。收到的程式會另存新檔，讓你的練習繼續留著。
        </p>
      </div>
      <div className="classroom-grid">
        <section className="panel classroom-card">
          <div className="feature-icon">
            <Radio />
          </div>
          <h2>我是老師</h2>
          <p>建立教室連結，邀請同學加入，並傳送目前編輯中的程式。</p>
          <button
            className="primary"
            disabled={role !== null}
            onClick={() => connect("teacher")}
          >
            建立教室 <Radio size={16} />
          </button>
        </section>
        <section className="panel classroom-card">
          <div className="feature-icon mint">
            <Users />
          </div>
          <h2>我是同學</h2>
          <p>填入老師提供的連線 ID，準備好一起練習。</p>
          <label>
            你的暱稱
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              autoComplete="off"
            />
          </label>
          <label>
            老師的連線 ID
            <input
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
              autoComplete="off"
            />
          </label>
          <button
            className="primary"
            disabled={role !== null}
            onClick={() => connect("student")}
          >
            加入教室 <Send size={16} />
          </button>
        </section>
      </div>
      {role && (
        <section className="panel connection-panel">
          <div>
            <h2>
              {id ? (
                "教室連線"
              ) : (
                <>
                  <LoaderCircle size={18} className="spin" /> 正在連線
                </>
              )}
            </h2>
            <p role="status">{status}</p>
            {role === "teacher" && id && (
              <>
                <label>
                  連線 ID
                  <input readOnly value={id} />
                </label>
                <button onClick={copyLink}>
                  <Copy size={16} /> 複製教室連結
                </button>
              </>
            )}
            <p>已連線：{connections.length} 位</p>
            {connections.map((c) => (
              <span className="tag" key={c.peer}>
                {c.metadata?.name ?? (role === "student" ? "老師" : "同學")}
              </span>
            ))}
          </div>
          <div className="connection-actions">
            <button
              className="primary"
              disabled={!connections.length}
              onClick={send}
            >
              <Send size={16} />
              {role === "teacher" ? "傳送目前程式給同學" : "傳送目前程式給老師"}
            </button>
            <button onClick={disconnect}>
              <Unplug size={16} /> 結束連線
            </button>
          </div>
        </section>
      )}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {inbox.map((item) => (
        <div className="panel inbox" key={item.key}>
          <div>
            <strong>收到{item.name}的程式</strong>
            <pre>{item.code.slice(0, 240)}</pre>
          </div>
          <button
            className="primary"
            onClick={() => {
              receive(
                item.code,
                role === "student" ? "FromTeacher.py" : "FromStudent.py",
              );
              setInbox((items) => items.filter((i) => i.key !== item.key));
            }}
          >
            另存並開啟
          </button>
          <button
            onClick={() =>
              setInbox((items) => items.filter((i) => i.key !== item.key))
            }
          >
            略過
          </button>
        </div>
      ))}
      <p className="muted classroom-note">
        教室連線需要網路及原有的博幼連線服務。離開教室頁面會結束連線。
      </p>
    </div>
  );
}
