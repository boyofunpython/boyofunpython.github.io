import { useEffect, useId, useRef, useState } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  FileCode2,
  LoaderCircle,
  MessageSquare,
  Radio,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { Dialog } from "./Dialog";
import { parsePython } from "../runtime";
import {
  MAX_CLASSROOM_TEXT,
  MAX_SHARED_CODE,
  type ClassroomActivity,
  type ClassroomCode,
  type ClassroomRole,
  type SentSubmission,
} from "../classroom";
import "./classroom-comms.css";

const time = (at: number) =>
  new Date(at).toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
  });
interface Props {
  enabled: boolean;
  role: ClassroomRole | null;
  connected: number;
  signalingOpen: boolean;
  filename: string;
  codeLength: number;
  activity: ClassroomActivity[];
  inbox: ClassroomCode[];
  submissions: SentSubmission[];
  incoming: { id: string; text: string } | null;
  error: string;
  status: string;
  reviewKey: string | null;
  onReview(key: string): void;
  onCloseReview(): void;
  onSave(key: string): void;
  onDismissCode(key: string): void;
  onText(text: string): boolean;
  onSendCode(question: string): boolean;
  onFeedback(key: string, text: string): boolean;
  onRead(): void;
  onDismissIncoming(): void;
  onClearMessages(): void;
}
function CodeReview({
  item,
  error,
  onClose,
  onSave,
  onFeedback,
}: {
  item: ClassroomCode;
  error: string;
  onClose(): void;
  onSave(): void;
  onFeedback(text: string): boolean;
}) {
  const [draft, setDraft] = useState(item.feedback ?? "");
  const [checking, setChecking] = useState(false);
  const [syntax, setSyntax] = useState("");
  const [sent, setSent] = useState(false);
  async function check() {
    setChecking(true);
    setSyntax("");
    try {
      const parsed = await parsePython(item.code);
      setSyntax(
        parsed.error
          ? `語法錯誤${parsed.line ? `（第 ${parsed.line} 行）` : ""}：${parsed.error}`
          : "語法可解析，尚未執行；仍需檢查程式邏輯。",
      );
    } catch {
      setSyntax("無法載入 Python 語法檢查，仍可閱讀程式並回覆。");
    } finally {
      setChecking(false);
    }
  }
  return (
    <Dialog
      title={item.fromStudent ? "檢查同學的程式" : "預覽老師的程式"}
      className="classroom-review"
      onClose={onClose}
      focusHeading
    >
      <div className="classroom-review-meta">
        <strong>
          {item.name} · {item.filename}
        </strong>
        <span>
          {time(item.at)} 收到 · {item.code.length.toLocaleString()} 字元
        </span>
      </div>
      <p className="classroom-review-hint">
        這是送交當時的快照；閱讀與語法檢查不會執行程式或改寫你的檔案。
      </p>
      {item.question && (
        <blockquote className="classroom-question">
          <strong>想請老師檢查</strong>
          <p>{item.question}</p>
        </blockquote>
      )}
      <pre
        className="classroom-full-code"
        tabIndex={0}
        aria-label="收到的完整 Python 程式"
      >
        <code>{item.code}</code>
      </pre>
      <div className="classroom-review-tools">
        <button disabled={checking} onClick={check}>
          {checking ? (
            <LoaderCircle size={15} className="spin" />
          ) : (
            <Check size={15} />
          )}
          檢查語法
        </button>
        <button onClick={onSave}>
          <FileCode2 size={15} />
          另存並開啟
        </button>
      </div>
      {syntax && (
        <p className="classroom-review-status" role="status">
          {syntax}
        </p>
      )}
      {item.fromStudent && (
        <form
          className="classroom-review-feedback"
          onSubmit={(e) => {
            e.preventDefault();
            if (onFeedback(draft)) setSent(true);
          }}
        >
          <label>
            檢查意見
            <textarea
              aria-label="檢查意見"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setSent(false);
              }}
              placeholder="指出做得好的地方、需要修改的原因或下一步提示…"
              maxLength={MAX_CLASSROOM_TEXT}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  if (onFeedback(draft)) setSent(true);
                }
              }}
            />
          </label>
          <div className="classroom-review-submit">
            <span>
              只回覆 {item.name} · {draft.length}/{MAX_CLASSROOM_TEXT}
            </span>
            <button className="primary" disabled={!draft.trim()} type="submit">
              <Send size={15} />
              送出檢查回覆
            </button>
          </div>
          {sent && (
            <p role="status" className="classroom-review-status">
              已將檢查意見傳給這位同學。
            </p>
          )}
        </form>
      )}
      {error && (
        <p className="classroom-comms-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}

export function ClassroomComms(props: Props) {
  const {
    enabled,
    role,
    connected,
    activity,
    inbox,
    submissions,
    incoming,
    reviewKey,
    error,
  } = props;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"messages" | "code">("messages");
  const [text, setText] = useState("");
  const [question, setQuestion] = useState("");
  const [snapshot, setSnapshot] = useState<SentSubmission | null>(null);
  const button = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null),
    log = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const title = useId();
  const unread =
    activity.filter((i) => i.unread).length +
    inbox.filter((i) => i.unread).length;
  const codeUnread = inbox.filter((i) => i.unread).length;
  const reviewing = inbox.find((i) => i.key === reviewKey);
  const latest = activity.at(-1)?.id;
  useEffect(() => {
    const readVisible = () => {
      if (open && tab === "messages" && !document.hidden) props.onRead();
    };
    document.addEventListener("visibilitychange", readVisible);
    window.addEventListener("focus", readVisible);
    return () => {
      document.removeEventListener("visibilitychange", readVisible);
      window.removeEventListener("focus", readVisible);
    };
  }, [open, tab, props.onRead]);
  useEffect(() => {
    if (
      open &&
      tab === "messages" &&
      incoming &&
      activity.some((i) => i.id === incoming.id)
    )
      props.onDismissIncoming();
  }, [open, tab, incoming?.id, activity, props.onDismissIncoming]);

  useEffect(() => {
    if (open && tab === "messages" && !document.hidden) props.onRead();
  }, [open, tab, latest, props.onRead]);
  useEffect(() => {
    if (incoming) {
      const timer = setTimeout(props.onDismissIncoming, 8000);
      return () => clearTimeout(timer);
    }
  }, [incoming?.id, props.onDismissIncoming]);
  useEffect(() => {
    if (open && !reviewKey) {
      const frame = requestAnimationFrame(() => {
        if (document.activeElement === document.body)
          panel.current?.querySelector<HTMLElement>("h2")?.focus();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [open]);
  useEffect(() => {
    if (open && tab === "messages" && follow.current && log.current)
      log.current.scrollTop = log.current.scrollHeight;
  }, [open, tab, latest]);
  function close() {
    const previous = document.activeElement;
    setOpen(false);
    requestAnimationFrame(() => {
      if (
        document.activeElement === document.body ||
        document.activeElement === previous
      )
        button.current?.focus({ preventScroll: true });
    });
  }
  function openIncoming() {
    setOpen(true);
    if (incoming && inbox.some((i) => i.key === incoming.id)) {
      setTab("code");
      props.onReview(incoming.id);
    } else setTab("messages");
    props.onDismissIncoming();
  }
  if (!enabled) return null;
  return (
    <>
      <div className="classroom-live">
        {incoming && !open && (
          <div className="classroom-arrival" role="status">
            <button onClick={openIncoming}>
              <Bell size={16} />
              <span>{incoming.text.slice(0, 160)}</span>
            </button>
            <button aria-label="關閉教室通知" onClick={props.onDismissIncoming}>
              <X size={15} />
            </button>
          </div>
        )}
        {!open && (
          <button
            ref={button}
            className="classroom-dock"
            aria-label={`開啟教室通訊${unread ? `，${unread} 則未讀` : ""}`}
            aria-expanded={false}
            onClick={() => {
              setOpen(true);
              props.onDismissIncoming();
            }}
          >
            <span className={`classroom-dot ${connected ? "connected" : ""}`} />
            <MessageSquare size={18} />
            <span>教室通訊</span>
            {unread > 0 && <b>{unread}</b>}
          </button>
        )}
      </div>
      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-modal="false"
          aria-labelledby={title}
          className="classroom-comms"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              close();
            }
          }}
        >
          <header>
            <div>
              <h2 id={title} tabIndex={-1}>
                <MessageSquare size={18} />
                教室通訊
              </h2>
              <p>
                {role === "teacher"
                  ? "老師"
                  : role === "student"
                    ? "同學"
                    : "已離開教室"}{" "}
                · {connected} 人連線
                {role && !props.signalingOpen ? " · 訊號服務未連接" : ""}
              </p>
            </div>
            <button
              className="icon-button"
              aria-label="收合教室通訊"
              onClick={close}
            >
              <X size={19} />
            </button>
          </header>
          <div
            className="classroom-comms-tabs"
            role="group"
            aria-label="通訊內容"
          >
            <button
              aria-pressed={tab === "messages"}
              onClick={() => setTab("messages")}
            >
              訊息
              {activity.some((i) => i.unread) && (
                <b>{activity.filter((i) => i.unread).length}</b>
              )}
            </button>
            <button
              aria-pressed={tab === "code"}
              onClick={() => setTab("code")}
            >
              {role === "student" ? "送交程式" : "收到的程式"}
              {codeUnread > 0 && <b>{codeUnread}</b>}
            </button>
          </div>
          {tab === "messages" ? (
            <>
              <div
                ref={log}
                className="classroom-messages"
                role="log"
                aria-label="教室訊息"
                tabIndex={0}
                aria-live="polite"
                onScroll={() => {
                  if (log.current)
                    follow.current =
                      log.current.scrollHeight -
                        log.current.scrollTop -
                        log.current.clientHeight <
                      80;
                }}
              >
                {!activity.length && (
                  <div className="classroom-comms-empty">
                    <Radio size={25} />
                    <h3>
                      {role === "teacher"
                        ? "在這裡廣播課堂訊息"
                        : "老師的訊息會即時出現在這裡"}
                    </h3>
                    <p>
                      切換頁面或編輯程式時仍可收發。收到訊息不會切換你的頁面或改動程式。
                    </p>
                  </div>
                )}
                {activity.map((item) => (
                  <article
                    key={item.id}
                    className={`classroom-message ${item.outgoing ? "outgoing" : ""}`}
                  >
                    <div>
                      <strong>{item.author}</strong>
                      <time>{time(item.at)}</time>
                    </div>
                    {item.kind === "feedback" && (
                      <span className="classroom-message-kind">
                        程式檢查 · {item.filename}
                      </span>
                    )}
                    <p>{item.text}</p>
                  </article>
                ))}
              </div>
              <form
                className="classroom-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (props.onText(text)) {
                    setText("");
                    follow.current = true;
                  }
                }}
              >
                <label>
                  {role === "teacher" ? "廣播訊息給全體同學" : "訊息傳給老師"}
                  <textarea
                    aria-label={
                      role === "teacher" ? "廣播訊息給全體同學" : "訊息傳給老師"
                    }
                    value={text}
                    maxLength={MAX_CLASSROOM_TEXT}
                    placeholder={
                      role === "teacher"
                        ? "例如：請先完成第一題，五分鐘後一起討論。"
                        : "寫下問題或回覆老師…"
                    }
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        if (props.onText(text)) {
                          setText("");
                          follow.current = true;
                        }
                      }
                    }}
                  />
                </label>
                <div>
                  <button
                    type="button"
                    className="classroom-clear"
                    disabled={!activity.length}
                    onClick={props.onClearMessages}
                    aria-label="清除本分頁訊息"
                  >
                    <Trash2 size={14} />
                  </button>
                  <span>
                    {text.length}/{MAX_CLASSROOM_TEXT} · Ctrl／⌘ Enter
                  </span>
                  <button
                    className="primary"
                    type="submit"
                    disabled={!role || !connected || !text.trim()}
                  >
                    <Send size={15} />
                    {role === "teacher" ? "廣播訊息" : "傳給老師"}
                  </button>
                </div>
                {role === "teacher" && (
                  <button
                    type="button"
                    className="classroom-send-file"
                    disabled={!connected || props.codeLength > MAX_SHARED_CODE}
                    onClick={() => props.onSendCode("")}
                  >
                    <FileCode2 size={15} />
                    廣播目前程式 · {props.filename}
                  </button>
                )}
              </form>
            </>
          ) : (
            <div className="classroom-code-list">
              {role === "student" && (
                <form
                  className="classroom-submit-code"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (props.onSendCode(question)) setQuestion("");
                  }}
                >
                  <h3>
                    <FileCode2 size={17} />
                    {props.filename}
                  </h3>
                  <p>
                    {props.codeLength.toLocaleString()} 字元 ·
                    只傳給老師，保留送交當時的版本。
                  </p>
                  <label>
                    想請老師檢查的問題（選填）
                    <textarea
                      aria-label="想請老師檢查的問題（選填）"
                      value={question}
                      maxLength={MAX_CLASSROOM_TEXT}
                      onChange={(e) => setQuestion(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          if (props.onSendCode(question)) setQuestion("");
                        }
                      }}
                      placeholder="例如：這個迴圈為什麼少印一行？"
                    />
                  </label>
                  <button
                    type="submit"
                    className="primary"
                    disabled={!connected || props.codeLength > MAX_SHARED_CODE}
                  >
                    <Send size={15} />
                    送交目前程式給老師
                  </button>
                </form>
              )}
              {inbox.length === 0 && role !== "student" && (
                <div className="classroom-comms-empty">
                  <FileCode2 size={26} />
                  <h3>等待同學送交程式</h3>
                  <p>
                    收到後可完整預覽、檢查語法並回覆。你的編輯內容會保持原樣。
                  </p>
                </div>
              )}
              {inbox
                .slice()
                .reverse()
                .map((item) => (
                  <article key={item.key} className="classroom-code-card">
                    <div>
                      <strong>{item.name}</strong>
                      <time>{time(item.at)}</time>
                    </div>
                    <h3>
                      {item.filename}
                      {item.unread && <b>新</b>}
                    </h3>
                    {item.question && <p>{item.question}</p>}
                    <span>
                      {item.code.length.toLocaleString()} 字元
                      {item.feedback ? " · 已回覆" : ""}
                    </span>
                    <div className="classroom-code-actions">
                      <button onClick={() => props.onReview(item.key)}>
                        {item.fromStudent ? "檢查程式" : "預覽程式"}
                      </button>
                      <button onClick={() => props.onSave(item.key)}>
                        另存並開啟
                      </button>
                      <button
                        aria-label={`略過 ${item.name} 的 ${item.filename}`}
                        onClick={() => props.onDismissCode(item.key)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </article>
                ))}
              {submissions.length > 0 && (
                <h3 className="classroom-submissions-title">我的送交紀錄</h3>
              )}
              {submissions
                .slice()
                .reverse()
                .map((item) => (
                  <article
                    className="classroom-code-card classroom-sent-code"
                    key={item.id}
                  >
                    <div>
                      <strong>{item.filename}</strong>
                      <time>{time(item.at)}</time>
                    </div>
                    <p className="classroom-delivery">
                      {item.state === "sent" ? (
                        <Send size={14} />
                      ) : (
                        <CheckCheck size={14} />
                      )}{" "}
                      {item.state === "reviewed"
                        ? "老師已回覆檢查意見"
                        : item.state === "received"
                          ? "老師端已收到"
                          : "已送出，等待老師端確認"}
                    </p>
                    {item.feedback && <blockquote>{item.feedback}</blockquote>}
                    <button onClick={() => setSnapshot(item)}>
                      查看送交版本
                    </button>
                  </article>
                ))}
            </div>
          )}
          {error && !reviewing && (
            <p className="classroom-comms-error" role="alert">
              {error}
            </p>
          )}
          <footer>
            <a href="#/classroom">返回教室與連線設定</a>
            <span>{props.status}</span>
          </footer>
        </div>
      )}
      {reviewing && (
        <CodeReview
          key={reviewing.key}
          item={reviewing}
          error={error}
          onClose={props.onCloseReview}
          onSave={() => props.onSave(reviewing.key)}
          onFeedback={(text) => props.onFeedback(reviewing.key, text)}
        />
      )}
      {snapshot && (
        <Dialog
          title="我送交的程式版本"
          className="classroom-review"
          onClose={() => setSnapshot(null)}
          focusHeading
        >
          <p>
            {snapshot.filename} · {time(snapshot.at)} 送交
          </p>
          {snapshot.question && (
            <blockquote className="classroom-question">
              {snapshot.question}
            </blockquote>
          )}
          <pre
            className="classroom-full-code"
            tabIndex={0}
            aria-label="送交時的 Python 程式"
          >
            <code>{snapshot.code}</code>
          </pre>
        </Dialog>
      )}
    </>
  );
}
