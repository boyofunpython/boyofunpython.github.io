import { useEffect, useRef, useState } from "react";
import { Copy, Radio, Send, Unplug, Users, LoaderCircle } from "lucide-react";
import {
  CLASSROOM_TIMEOUT,
  MAX_SHARED_CODE,
  MAX_INBOX,
  classroomShareURL,
  classroomName,
} from "../classroom";
import type { Peer as PeerClient, DataConnection as Connection } from "peerjs";

export function Classroom({
  active,
  getCode,
  receive,
}: {
  active: boolean;
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
  const [signalingOpen, setSignalingOpen] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [inbox, setInbox] = useState<
    { code: string; name: string; key: string; filename: string }[]
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
    setSignalingOpen(false);
    setReconnecting(false);
    setNotice("");
    setRole(null);
    setStatus("");
  }
  function armConnectionTimeout(token: number) {
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => {
      if (token !== session.current) return;
      disconnect();
      setError(
        "連線逾時。請確認老師仍開著教室、使用最新連結，並檢查網路是否允許 PeerJS／WebRTC。",
      );
    }, CLASSROOM_TIMEOUT);
  }
  async function connect(nextRole: "teacher" | "student") {
    if (nextRole === "student" && (!teacher.trim() || !name.trim())) {
      setError("請輸入連線 ID 和你的暱稱。");
      return;
    }
    setError("");
    setNotice("");
    setRole(nextRole);
    setSignalingOpen(false);
    setStatus("正在連接公共 PeerJS 服務…");
    const token = ++session.current;
    armConnectionTimeout(token);
    let signalingReady = false;
    let studentStarted = false;
    let hasOpened = false;
    try {
      const { createClassroomPeer } = await import("../classroom-peer");
      if (token !== session.current) return;
      const client = createClassroomPeer();
      peer.current = client;
      function attach(connection: Connection) {
        if (token !== session.current) {
          connection.close();
          return;
        }
        function remove() {
          allConnections.current = allConnections.current.filter(
            (c) => c !== connection,
          );
          setConnections([...allConnections.current]);
        }
        connection.on("open", () => {
          if (token !== session.current) {
            connection.close();
            return;
          }
          if (nextRole === "student" && signalingReady)
            clearTimeout(timeout.current);
          if (!allConnections.current.includes(connection))
            allConnections.current.push(connection);
          setConnections([...allConnections.current]);
          setError("");
          setStatus("已連線");
        });
        connection.on("data", (raw) => {
          if (token !== session.current || !raw || typeof raw !== "object")
            return;
          const data = raw as { type?: string; code?: string };
          if (
            data.type === (nextRole === "student" ? "teacherInfo" : "code") &&
            typeof data.code === "string" &&
            data.code.length <= MAX_SHARED_CODE
          ) {
            setInbox((items) => [
              ...items.slice(-(MAX_INBOX - 1)),
              {
                code: data.code!,
                name:
                  nextRole === "student"
                    ? "老師"
                    : classroomName(connection.metadata),
                key: crypto.randomUUID(),
                filename:
                  nextRole === "student" ? "FromTeacher.py" : "FromStudent.py",
              },
            ]);
          }
        });
        connection.on("close", () => {
          if (token !== session.current) return;
          remove();
          if (nextRole === "student") {
            disconnect();
            setError("與老師的連線已結束，請使用老師最新的連結重新加入。");
          }
        });
        connection.on("error", () => {
          if (token !== session.current) return;
          if (nextRole === "student") {
            disconnect();
            setError("傳輸失敗，請使用老師最新的連結重新加入。");
          } else {
            remove();
            connection.close();
            setError("有一位同學的連線中斷，其他同學仍可使用教室。");
          }
        });
      }
      client.on("open", (value) => {
        if (token !== session.current) return;
        hasOpened = true;
        signalingReady = true;
        setReconnecting(false);
        setId(String(value));
        setSignalingOpen(true);
        setError("");
        if (nextRole === "teacher") {
          clearTimeout(timeout.current);
          setStatus("教室已開啟，等待同學加入");
        } else if (!studentStarted) {
          studentStarted = true;
          setStatus("正在加入老師的教室…");
          attach(
            client.connect(teacher.trim(), { metadata: { name: name.trim() } }),
          );
        } else if (
          allConnections.current.some((connection) => connection.open)
        ) {
          clearTimeout(timeout.current);
          setStatus("教室服務已重新連接");
        } else {
          armConnectionTimeout(token);
          setStatus("正在加入老師的教室…");
        }
      });
      client.on("connection", (connection) => {
        if (token !== session.current || nextRole !== "teacher")
          connection.close();
        else attach(connection);
      });
      client.on("disconnected", () => {
        if (token !== session.current) return;
        signalingReady = false;
        setSignalingOpen(false);
        setStatus(
          "公共 PeerJS 服務已斷線；現有連線可繼續使用，重新連接後才能加入新同學。",
        );
      });
      client.on("close", () => {
        if (token !== session.current) return;
        disconnect();
        setError("教室連線已關閉，請重新建立或加入教室。");
      });
      client.on("error", (err) => {
        if (token !== session.current) return;
        if (
          hasOpened &&
          ["network", "socket-error", "socket-closed"].includes(err?.type)
        ) {
          signalingReady = false;
          setSignalingOpen(false);
          setReconnecting(false);
          setError("公共 PeerJS 服務暫時無法連線，請按重新連接服務。");
          return;
        }
        disconnect();
        setError(
          err?.type === "peer-unavailable"
            ? "找不到這間教室。請確認老師仍開著網頁，並使用老師最新的分享連結。"
            : "無法連接公共 PeerJS 服務。請檢查網路，或稍後再試。",
        );
      });
    } catch {
      if (token !== session.current) return;
      disconnect();
      setError("連線功能載入失敗，請稍後再試。");
    }
  }
  function reconnect() {
    const client = peer.current;
    if (!client || client.destroyed || reconnecting) return;
    setReconnecting(true);
    setError("");
    setStatus("正在重新連接公共 PeerJS 服務…");
    armConnectionTimeout(session.current);
    try {
      if (!client.disconnected) client.disconnect();
      client.reconnect();
    } catch {
      disconnect();
      setError("無法重新連接，請重新建立或加入教室。");
    }
  }
  const shareLink =
    role === "teacher" && id ? classroomShareURL(id, location.href) : "";
  async function copyLink() {
    if (!shareLink || !signalingOpen) return;
    setError("");
    try {
      await navigator.clipboard.writeText(shareLink);
      setNotice("教室連結已複製");
    } catch {
      setError("無法自動複製，請選取「教室分享連結」欄位後手動複製。");
    }
  }
  function send() {
    try {
      const live = allConnections.current.filter((c) => c.open);
      if (!live.length) throw new Error();
      const code = getCode();
      if (code.length > MAX_SHARED_CODE) {
        setError("程式超過 1,000,000 字元，請精簡後再傳送。");
        return;
      }
      setError("");
      let sent = 0;
      for (const connection of live) {
        try {
          connection.send({
            type: role === "teacher" ? "teacherInfo" : "code",
            code,
          });
          sent++;
        } catch {
          connection.close();
        }
      }
      if (!sent) throw new Error();
      setStatus(`已傳送給 ${sent} 位${role === "teacher" ? "同學" : "老師"}`);
      if (sent < live.length)
        setError("部分連線傳送失敗；其他同學已收到，請未收到的同學重新加入。");
    } catch {
      setError("傳送失敗，請確認連線後再試一次。");
    }
  }
  return (
    <div hidden={!active} className="classroom-content">
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
              disabled={role !== null}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              autoComplete="off"
            />
          </label>
          <label>
            老師的連線 ID
            <input
              disabled={role !== null}
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
                <label>
                  教室分享連結
                  <input
                    readOnly
                    value={shareLink}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </label>
                <button disabled={!signalingOpen} onClick={copyLink}>
                  <Copy size={16} /> 複製教室連結
                </button>
              </>
            )}
            {!signalingOpen && id && (
              <button disabled={reconnecting} onClick={reconnect}>
                重新連接服務
              </button>
            )}
            {notice && <p role="status">{notice}</p>}
            <p>已連線：{connections.length} 位</p>
            {connections.map((c) => (
              <span className="tag" key={c.peer}>
                {role === "student" ? "老師" : classroomName(c.metadata)}
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
              receive(item.code, item.filename);
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
        使用公共 PeerJS
        服務。切回編輯器或其他頁面會保持連線；按「結束連線」或關閉本分頁才會離開。老師需保留此分頁，分享連結才可繼續使用。收到的程式在教室頁面確認，最多保留最近
        20 份。
      </p>
    </div>
  );
}
