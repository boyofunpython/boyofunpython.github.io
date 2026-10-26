import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Radio, Send, Unplug, Users, LoaderCircle } from "lucide-react";
import {
  CLASSROOM_TIMEOUT,
  MAX_SHARED_CODE,
  MAX_INBOX,
  classroomShareURL,
  classroomName,
  classroomFilename,
  readClassroomPacket,
  MAX_CLASSROOM_TEXT,
  MAX_CLASSROOM_HISTORY,
  type ClassroomRole,
  type ClassroomActivity,
  type ClassroomCode,
  type SentSubmission,
} from "../classroom";
import { ClassroomComms } from "./ClassroomComms";
import { ClassroomVoice, initialVoiceState } from "../classroom-voice";
import type { Peer as PeerClient, DataConnection as Connection } from "peerjs";

export function Classroom({
  active,
  getCode,
  filename,
  receive,
}: {
  active: boolean;
  getCode: () => string;
  filename: string;
  receive: (code: string, name: string) => void;
}) {
  const [voiceState, setVoiceState] = useState(initialVoiceState);
  const [voice] = useState(() => new ClassroomVoice(setVoiceState));
  const [role, setRole] = useState<ClassroomRole | null>(null);
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
  const [inbox, setInbox] = useState<ClassroomCode[]>([]);
  const [activity, setActivity] = useState<ClassroomActivity[]>([]);
  const [submissions, setSubmissions] = useState<SentSubmission[]>([]);
  const submissionsRef = useRef<SentSubmission[]>([]);
  const [hadSession, setHadSession] = useState(false);
  const [incoming, setIncoming] = useState<{ id: string; text: string } | null>(
    null,
  );
  const [reviewKey, setReviewKey] = useState<string | null>(null);
  const reviewKeyRef = useRef<string | null>(null);
  reviewKeyRef.current = reviewKey;
  const appendActivity = useCallback(
    (item: ClassroomActivity) =>
      setActivity((items) => [
        ...items.slice(-(MAX_CLASSROOM_HISTORY - 1)),
        item,
      ]),
    [],
  );
  const markMessagesRead = useCallback(
    () =>
      setActivity((items) =>
        items.some((i) => i.unread)
          ? items.map((i) => ({ ...i, unread: false }))
          : items,
      ),
    [],
  );
  const dismissIncoming = useCallback(() => setIncoming(null), []);
  function updateSubmissions(
    update: (items: SentSubmission[]) => SentSubmission[],
  ) {
    const next = update(submissionsRef.current);
    submissionsRef.current = next;
    setSubmissions(next);
  }
  const peer = useRef<PeerClient | null>(null);
  const allConnections = useRef<Connection[]>([]);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const session = useRef(0);
  useEffect(
    () => () => {
      session.current++;
      voice.reset();
      clearTimeout(timeout.current);
      peer.current?.destroy();
    },
    [],
  );
  function disconnect() {
    session.current++;
    voice.reset();
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
    setHadSession(true);
    setSignalingOpen(false);
    setStatus("正在連接公共 PeerJS 服務…");
    const token = ++session.current;
    armConnectionTimeout(token);
    let signalingReady = false;
    let studentStarted = false;
    let hasOpened = false;
    const seen = new Set<string>();
    try {
      const { createClassroomPeer } = await import("../classroom-peer");
      if (token !== session.current) return;
      const client = createClassroomPeer();
      peer.current = client;
      voice.bind(client, nextRole);
      client.on("call", (call) => {
        if (token === session.current) voice.receive(call);
        else call.close();
      });
      function attach(connection: Connection) {
        if (token !== session.current) {
          connection.close();
          return;
        }
        voice.add(connection);
        function remove() {
          voice.remove(connection);
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
          voice.add(connection);
          setError("");
          setStatus("已連線");
        });
        connection.on("data", (raw) => {
          if (token !== session.current) return;
          if (voice.control(connection, raw)) return;
          const data = readClassroomPacket(raw, nextRole);
          if (!data) return;
          if ("id" in data && data.id) {
            const unique = `${connection.peer}:${data.id}`;
            if (seen.has(unique)) return;
            seen.add(unique);
            if (seen.size > 1000) seen.delete(seen.values().next().value!);
          }
          const author =
            nextRole === "student"
              ? "老師"
              : classroomName(connection.metadata);
          const at = Date.now();
          const activityId = crypto.randomUUID();
          if (data.type === "message") {
            appendActivity({
              id: activityId,
              kind: "message",
              text: data.text,
              author,
              outgoing: false,
              unread: true,
              at,
            });
            setIncoming({ id: activityId, text: `${author}：${data.text}` });
          } else if (data.type === "receipt") {
            updateSubmissions((items) =>
              items.map((i) =>
                i.id === data.submissionId && i.state === "sent"
                  ? { ...i, state: "received" }
                  : i,
              ),
            );
          } else if (data.type === "feedback") {
            const sent = submissionsRef.current.find(
              (i) => i.id === data.submissionId,
            );
            if (!sent) return;
            updateSubmissions((items) =>
              items.map((i) =>
                i.id === data.submissionId
                  ? { ...i, state: "reviewed", feedback: data.text }
                  : i,
              ),
            );
            appendActivity({
              id: activityId,
              kind: "feedback",
              text: data.text,
              author,
              outgoing: false,
              unread: true,
              at,
              filename: sent.filename,
            });
            setIncoming({
              id: activityId,
              text: `老師回覆 ${sent.filename}：${data.text}`,
            });
          } else {
            const key = crypto.randomUUID();
            setInbox((items) => {
              const protectedItem = items.find(
                (i) => i.key === reviewKeyRef.current,
              );
              const recent = items
                .filter((i) => i !== protectedItem)
                .slice(-(MAX_INBOX - 1 - (protectedItem ? 1 : 0)));
              return [
                ...(protectedItem ? [protectedItem] : []),
                ...recent,
                {
                  key,
                  submissionId: data.id,
                  code: data.code,
                  name: author,
                  filename: data.filename,
                  question: data.question,
                  at,
                  unread: true,
                  fromStudent: nextRole === "teacher",
                  peerId: connection.peer,
                  session: token,
                },
              ];
            });
            setIncoming({
              id: key,
              text: `${author}${nextRole === "teacher" ? "送交" : "分享了"} ${data.filename}`,
            });
            if (nextRole === "teacher" && data.id) {
              try {
                connection.send({ type: "receipt", submissionId: data.id });
              } catch {
                /* Receipt failure must not discard received code. */
              }
            }
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
        voice.setSignaling(true);
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
        voice.setSignaling(false);
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
          (err?.type === "webrtc" ||
            (err?.type === "peer-unavailable" && voice.hasPendingCalls())) &&
          allConnections.current.some((c) => c.open)
        ) {
          voice.mediaError();
          return;
        }
        if (
          hasOpened &&
          ["network", "socket-error", "socket-closed"].includes(err?.type)
        ) {
          signalingReady = false;
          voice.setSignaling(false);
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
  function deliver(packet: object, target?: string): number {
    let sent = 0;
    for (const connection of allConnections.current.filter(
      (c) => c.open && (!target || c.peer === target),
    )) {
      try {
        connection.send(packet);
        sent++;
      } catch {
        connection.close();
      }
    }
    return sent;
  }
  function sendText(text: string): boolean {
    if (!role || !text.trim() || text.length > MAX_CLASSROOM_TEXT) {
      setError(`訊息請輸入 1～${MAX_CLASSROOM_TEXT} 字元。`);
      return false;
    }
    const id = crypto.randomUUID();
    const sent = deliver({ type: "message", id, text: text.trim() });
    if (!sent) {
      setError("尚未連接對方，訊息未送出。");
      return false;
    }
    setError("");
    appendActivity({
      id,
      kind: "message",
      text: text.trim(),
      author: role === "teacher" ? `我・廣播給 ${sent} 位同學` : "我・傳給老師",
      outgoing: true,
      unread: false,
      at: Date.now(),
    });
    setStatus(
      role === "teacher" ? `訊息已送出給 ${sent} 位同學` : "訊息已送出給老師",
    );
    return true;
  }
  function sendCode(question = ""): boolean {
    if (!role || question.length > MAX_CLASSROOM_TEXT) {
      setError("請先加入教室，並精簡送交問題。");
      return false;
    }
    const code = getCode();
    if (code.length > MAX_SHARED_CODE) {
      setError("程式超過 1,000,000 字元，請精簡後再傳送。");
      return false;
    }
    const id = crypto.randomUUID();
    const file = classroomFilename(filename);
    const at = Date.now();
    // Register before send so an immediate receipt can find its submission.
    if (role === "student")
      updateSubmissions((items) => [
        ...items.slice(-(MAX_INBOX - 1)),
        {
          id,
          code,
          filename: file,
          question: question.trim(),
          at,
          state: "sent",
        },
      ]);
    const sent = deliver({
      type: role === "teacher" ? "teacherInfo" : "code",
      id,
      code,
      filename: file,
      question: question.trim(),
    });
    if (!sent) {
      if (role === "student")
        updateSubmissions((items) => items.filter((i) => i.id !== id));
      setError("傳送失敗，請確認連線後再試一次。");
      return false;
    }
    setError("");
    setStatus(`已傳送給 ${sent} 位${role === "teacher" ? "同學" : "老師"}`);
    return true;
  }
  function reviewCode(key: string) {
    setIncoming((item) => (item?.id === key ? null : item));
    setReviewKey(key);
    setInbox((items) =>
      items.map((i) => (i.key === key ? { ...i, unread: false } : i)),
    );
  }
  function feedback(key: string, text: string): boolean {
    const item = inbox.find((i) => i.key === key);
    if (
      !item ||
      !item.fromStudent ||
      !text.trim() ||
      text.length > MAX_CLASSROOM_TEXT
    ) {
      setError("請填寫檢查意見（最多 2,000 字元）。");
      return false;
    }
    if (
      role !== "teacher" ||
      item.session !== session.current ||
      !deliver(
        {
          type: "feedback",
          id: crypto.randomUUID(),
          submissionId: item.submissionId ?? item.key,
          text: text.trim(),
        },
        item.peerId,
      )
    ) {
      setError("這位同學已離線，回覆未送出；檢查意見仍保留在視窗中。");
      return false;
    }
    setInbox((items) =>
      items.map((i) =>
        i.key === key ? { ...i, feedback: text.trim(), unread: false } : i,
      ),
    );
    appendActivity({
      id: crypto.randomUUID(),
      kind: "feedback",
      text: text.trim(),
      author: `我・回覆 ${item.name}`,
      outgoing: true,
      unread: false,
      at: Date.now(),
      filename: item.filename,
    });
    setError("");
    return true;
  }
  function saveReceived(key: string) {
    const item = inbox.find((i) => i.key === key);
    if (!item) return;
    setReviewKey(null);
    setIncoming((value) => (value?.id === key ? null : value));
    receive(item.code, item.filename);
    setInbox((items) => items.filter((i) => i.key !== key));
  }
  return (
    <>
      <div hidden={!active} className="classroom-content">
        <div className="page-intro">
          <span className="eyebrow">LEARN TOGETHER</span>
          <h1>一起寫，學得更多。</h1>
          <p>
            老師即時廣播，同學送交程式。連線後，任何頁面都能用右下角「教室通訊」收發訊息與檢查程式。
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
                onClick={() => sendCode()}
              >
                <Send size={16} />
                {role === "teacher"
                  ? "傳送目前程式給同學"
                  : "傳送目前程式給老師"}
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
            <button onClick={() => reviewCode(item.key)}>
              {item.fromStudent ? "檢查程式" : "預覽程式"}
            </button>
            <button className="primary" onClick={() => saveReceived(item.key)}>
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
          服務。切回編輯器或其他頁面會保持連線；按「結束連線」或關閉本分頁才會離開。老師需保留此分頁，分享連結才可繼續使用。右下角「教室通訊」可廣播、送交程式與檢查回覆；收到的程式不會自動執行，最多保留最近
          20 份。
        </p>
      </div>
      <ClassroomComms
        voice={{ controller: voice, state: voiceState }}
        enabled={hadSession || inbox.length > 0}
        role={role}
        connected={connections.length}
        signalingOpen={signalingOpen}
        filename={filename}
        codeLength={getCode().length}
        activity={activity}
        inbox={inbox}
        submissions={submissions}
        incoming={incoming}
        error={error}
        status={status}
        reviewKey={reviewKey}
        onReview={reviewCode}
        onCloseReview={() => setReviewKey(null)}
        onText={sendText}
        onSendCode={sendCode}
        onFeedback={feedback}
        onSave={saveReceived}
        onDismissCode={(key) => {
          setIncoming((item) => (item?.id === key ? null : item));
          setInbox((items) => items.filter((i) => i.key !== key));
          if (reviewKey === key) setReviewKey(null);
        }}
        onRead={markMessagesRead}
        onDismissIncoming={dismissIncoming}
        onClearMessages={() => setActivity([])}
      />
    </>
  );
}
