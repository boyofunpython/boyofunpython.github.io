import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Braces,
  ChevronDown,
  Code2,
  Eraser,
  FileCode2,
  History,
  LoaderCircle,
  Play,
  RotateCcw,
  Send,
  Square,
  Terminal,
  Trash2,
} from "lucide-react";
import {
  completePython,
  getRuntimeInfo,
  getVariables,
  resetRuntime,
  runPython,
  submitInput,
  type InputRequest,
  type RuntimeInfo,
  type VariableInfo,
} from "../runtime";
import { Graphics } from "./Graphics";
import { InputPrompt } from "./InputPrompt";
import { Dialog } from "./Dialog";

type Entry = {
  id: number;
  kind: "command" | "stdout" | "stderr" | "input" | "system";
  text: string;
  prefix?: string;
  html?: string;
};
const HISTORY = "boyo-console-history-v2";
function savedHistory(): string[] {
  try {
    const values = JSON.parse(localStorage.getItem(HISTORY) ?? "[]");
    return Array.isArray(values)
      ? values
          .filter((value) => typeof value === "string" && value.length <= 10000)
          .slice(-100)
      : [];
  } catch {
    return [];
  }
}

export function PythonConsole({
  active,
  filename,
  getCode,
}: {
  active: boolean;
  filename: string;
  getCode(): string;
}) {
  const [info, setInfo] = useState<RuntimeInfo | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState(savedHistory);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [input, setInput] = useState<InputRequest | null>(null);
  const [continuation, setContinuation] = useState(false);
  const [status, setStatus] = useState("正在準備 Python…");
  const [variables, setVariables] = useState<VariableInfo[]>([]);
  const [narrow, setNarrow] = useState(
    () => matchMedia("(max-width: 900px)").matches,
  );
  const [inspector, setInspector] = useState(
    () => matchMedia("(min-width: 1100px)").matches,
  );
  const [completions, setCompletions] = useState<string[]>([]);
  const [selectedCompletion, setSelectedCompletion] = useState(0);
  const [stdinText, setStdinText] = useState("");
  const [presetInput, setPresetInput] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const nextId = useRef(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const historyIndex = useRef(history.length);
  const draft = useRef("");

  useEffect(() => {
    const media = matchMedia("(max-width: 900px)");
    const changed = () => {
      setNarrow(media.matches);
      if (media.matches) setInspector(false);
    };
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  const append = (entry: Omit<Entry, "id">) =>
    setEntries((items) => [
      ...items.slice(-499),
      { ...entry, id: ++nextId.current },
    ]);
  useEffect(() => {
    if (!active) {
      if (inFlight.current) resetRuntime();
      return;
    }
    let cancelled = false;
    setStatus("正在準備 Python…");
    getRuntimeInfo()
      .then(async (value) => {
        if (cancelled) return;
        setInfo(value);
        setStatus("準備好了，試著輸入 1 + 2");
        if (!value.interactiveInput) setPresetInput(true);
        try {
          const snapshot = await getVariables();
          if (!cancelled) setVariables(snapshot);
        } catch {
          /* A run may have just reset the namespace. */
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setInfo(null);
          setStatus((error as Error).message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [active, attempt]);
  useEffect(() => {
    if (active && !busy && info) area.current?.focus({ preventScroll: true });
  }, [active, busy, info]);
  useEffect(() => {
    if (active) log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [entries, input, active]);
  useEffect(
    () => () => {
      if (inFlight.current) resetRuntime();
    },
    [],
  );
  function addHistory(source: string) {
    if (!source.trim()) return;
    const next =
      history.at(-1) === source ? history : [...history, source].slice(-100);
    setHistory(next);
    historyIndex.current = next.length;
    try {
      localStorage.setItem(HISTORY, JSON.stringify(next));
    } catch {
      /* History is optional; code files have their own persistent storage. */
    }
  }
  async function execute(source: string, mode: "console" | "run" = "console") {
    if (
      inFlight.current ||
      !info ||
      (!source.trim() && !continuation && mode === "console")
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setCompletions([]);
    setStatus("執行中…");
    if (mode === "console") {
      append({
        kind: "command",
        prefix: continuation ? "..." : ">>>",
        text: source,
      });
      addHistory(source);
      setCommand("");
    } else {
      append({ kind: "system", text: `執行 ${filename}` });
      setContinuation(false);
    }
    try {
      const result = await runPython(
        source,
        () => setStatus("執行中…"),
        {
          stdinLines: presetInput ? stdinText.split("\n") : undefined,
          onInput(request) {
            setInput(request);
            if (request) setStatus("等待你的輸入");
          },
          onOutput(text, stream) {
            setEntries((items) => {
              const last = items.at(-1);
              return last?.kind === stream
                ? [...items.slice(0, -1), { ...last, text: last.text + text }]
                : [
                    ...items.slice(-499),
                    { id: ++nextId.current, kind: stream, text },
                  ];
            });
          },
        },
        mode,
        filename,
      );
      if (result.error) append({ kind: "stderr", text: result.error });
      if (result.html) append({ kind: "stdout", text: "", html: result.html });
      setContinuation(!!result.incomplete);
      setStatus(
        result.error
          ? "這次執行已停止，可修改後再試。"
          : result.incomplete
            ? "這個區塊尚未結束；繼續輸入，或送出空行完成。"
            : "執行完成，變數可在下一個指令繼續使用。",
      );
      if (!result.reset && !result.incomplete) {
        try {
          setVariables(await getVariables());
        } catch {
          /* A reset clears the current namespace. */
        }
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
      setInput(null);
    }
  }
  function answer(value: string | null) {
    if (!input) return;
    append({
      kind: "input",
      text: value === null ? "〈結束輸入〉" : `${input.prompt}${value}`,
    });
    submitInput(input.id, value);
  }
  function reset() {
    resetRuntime();
    setInfo(null);
    setContinuation(false);
    setVariables([]);
    setInput(null);
    append({ kind: "system", text: "Python 環境已重設，程式檔案仍保留。" });
    setAttempt((value) => value + 1);
  }
  function exportLog() {
    const text = entries
      .map((entry) => `${entry.prefix ? entry.prefix + " " : ""}${entry.text}`)
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "博幼-Python-Console.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function applyCompletion(value: string) {
    const cursor = area.current?.selectionStart ?? command.length;
    const prefix =
      command.slice(0, cursor).match(/[\w.\u0080-\uffff]+$/)?.[0] ?? "";
    const next =
      command.slice(0, cursor - prefix.length) + value + command.slice(cursor);
    setCommand(next);
    setCompletions([]);
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(
        cursor - prefix.length + value.length,
        cursor - prefix.length + value.length,
      );
    });
  }
  async function autocomplete() {
    if (busy) return;
    const cursor = area.current?.selectionStart ?? command.length;
    const prefix = command.slice(0, cursor).match(/[\w.\u0080-\uffff]+$/)?.[0];
    if (!prefix) return;
    try {
      const values = await completePython(prefix);
      setCompletions(values);
      setSelectedCompletion(0);
      if (values.length === 1) applyCompletion(values[0]);
    } catch {
      setStatus("無法取得補全，請稍後再試。");
    }
  }
  function keydown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
      event.preventDefault();
      setEntries([]);
      return;
    }
    if (event.ctrlKey && event.code === "Space") {
      event.preventDefault();
      autocomplete();
      return;
    }
    if (event.key === "Escape" && completions.length) {
      event.preventDefault();
      setCompletions([]);
      return;
    }
    if (
      completions.length &&
      (event.key === "ArrowDown" || event.key === "ArrowUp")
    ) {
      event.preventDefault();
      setSelectedCompletion(
        (index) =>
          (index + (event.key === "ArrowDown" ? 1 : completions.length - 1)) %
          completions.length,
      );
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (completions.length) applyCompletion(completions[selectedCompletion]);
      else execute(command);
      return;
    }
    if (
      event.key === "ArrowUp" &&
      !command.slice(0, area.current?.selectionStart ?? 0).includes("\n")
    ) {
      event.preventDefault();
      if (historyIndex.current === history.length) draft.current = command;
      historyIndex.current = Math.max(0, historyIndex.current - 1);
      setCommand(history[historyIndex.current] ?? command);
    }
    if (
      event.key === "ArrowDown" &&
      !command.slice(area.current?.selectionEnd ?? 0).includes("\n")
    ) {
      event.preventDefault();
      historyIndex.current = Math.min(history.length, historyIndex.current + 1);
      setCommand(
        historyIndex.current === history.length
          ? draft.current
          : history[historyIndex.current],
      );
    }
  }
  return (
    <section
      className="console-view"
      hidden={!active}
      aria-label="Python Console"
    >
      <h1 className="sr-only">博幼 Python Console</h1>
      <div className="console-toolbar">
        <div className="console-title">
          <Terminal size={18} />
          <strong>Python Console</strong>
          <span className="runtime-badge">
            {info ? `Python ${info.python}` : "載入中"}
          </span>
        </div>
        <div className="console-tools">
          <button
            className="primary"
            disabled={!info || busy}
            onClick={() => execute(getCode(), "run")}
          >
            <Play size={15} fill="currentColor" /> 執行目前檔案
          </button>
          <button
            className="icon-button"
            aria-label="清空 Console 畫面"
            title="清空畫面，保留變數"
            onClick={() => setEntries([])}
          >
            <Eraser size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="重設 Console 環境"
            title="重設環境與變數"
            onClick={reset}
          >
            <RotateCcw size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="下載 Console 紀錄"
            title="下載紀錄"
            onClick={exportLog}
            disabled={!entries.length}
          >
            <ArrowDownToLine size={17} />
          </button>
          <button
            className={`icon-button ${inspector ? "selected" : ""}`}
            aria-label="顯示變數與提示"
            aria-pressed={inspector}
            title="變數與提示"
            onClick={() => setInspector((value) => !value)}
          >
            <Braces size={18} />
          </button>
        </div>
      </div>
      <div className={`console-layout ${inspector ? "show-inspector" : ""}`}>
        <div className="console-terminal">
          <div
            ref={log}
            className="console-log"
            role="log"
            aria-label="Console 紀錄"
            aria-live="off"
            tabIndex={0}
          >
            {!entries.length && (
              <div className="console-welcome">
                <span className="console-prompt">&gt;&gt;&gt;</span>
                <div>
                  <h2>在這裡，和 Python 對話。</h2>
                  <p>
                    輸入一行指令，立刻看到結果。也可以執行{" "}
                    <strong>{filename}</strong>，再查詢程式裡的變數。
                  </p>
                  <div className="console-starters">
                    {[
                      "1 + 2",
                      'print("哈囉，博幼！")',
                      'name = input("你叫什麼名字？")',
                    ].map((value) => (
                      <button
                        key={value}
                        disabled={busy || !info}
                        onClick={() => {
                          setCommand(value);
                          area.current?.focus();
                        }}
                      >
                        <Code2 size={14} />
                        <code>{value}</code>
                        <ArrowRight size={14} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {entries.map((entry) => (
              <div
                className={`console-entry entry-${entry.kind}`}
                key={entry.id}
              >
                {entry.prefix && (
                  <span className="console-prompt">{entry.prefix}</span>
                )}
                <div>
                  {entry.text && <pre>{entry.text}</pre>}
                  {entry.html && <Graphics html={entry.html} />}
                </div>
              </div>
            ))}
          </div>
          <div className="console-status" role="status">
            {busy ? (
              <LoaderCircle size={14} className="spin" />
            ) : (
              <span className="status-dot" />
            )}
            {status}
            {busy && (
              <button
                onClick={() => {
                  resetRuntime();
                  setInfo(null);
                  setVariables([]);
                  setContinuation(false);
                  setAttempt((value) => value + 1);
                }}
              >
                <Square size={13} /> 停止執行
              </button>
            )}
            {!info && !busy && (
              <button
                onClick={() => {
                  resetRuntime();
                  setAttempt((value) => value + 1);
                }}
              >
                重新載入
              </button>
            )}
          </div>
          {input ? (
            <InputPrompt
              key={input.id}
              request={input}
              onSubmit={answer}
              onEOF={() => answer(null)}
            />
          ) : (
            <form
              className="console-composer"
              onSubmit={(event) => {
                event.preventDefault();
                execute(command);
              }}
            >
              <span className="console-prompt" aria-hidden="true">
                {continuation ? "..." : ">>>"}
              </span>
              <div className="console-command-wrap">
                <textarea
                  ref={area}
                  aria-label={
                    continuation
                      ? "Python Console 續行指令"
                      : "Python Console 指令"
                  }
                  aria-describedby="console-keyboard-help"
                  value={command}
                  onChange={(event) => {
                    setCommand(event.target.value);
                    setCompletions([]);
                    historyIndex.current = history.length;
                  }}
                  onKeyDown={keydown}
                  disabled={busy || !info}
                  rows={Math.min(6, Math.max(1, command.split("\n").length))}
                  spellCheck={false}
                  autoComplete="off"
                />
                {completions.length > 0 && (
                  <div
                    className="console-completions"
                    role="listbox"
                    aria-label="程式補全"
                  >
                    {completions.map((value, index) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={index === selectedCompletion}
                        key={value}
                        onClick={() => applyCompletion(value)}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                className="primary"
                aria-label="送出 Console 指令"
                disabled={busy || !info || (!command.trim() && !continuation)}
                type="submit"
              >
                <Send size={17} />
              </button>
            </form>
          )}
          {presetInput && (
            <label className="preset-input">
              預先輸入（每行一筆，下次執行時依序使用）
              <textarea
                aria-label="預先輸入"
                rows={2}
                value={stdinText}
                onChange={(event) => setStdinText(event.target.value)}
                disabled={busy}
              />
            </label>
          )}
          <div id="console-keyboard-help" className="console-keyboard-help">
            <span>
              Enter 執行 · Shift+Enter 換行 · ↑↓ 歷史 · Ctrl+Space 補全
            </span>
            <span>停止執行會重設環境，程式檔仍會保留。</span>
          </div>
        </div>
        {inspector && !narrow && (
          <aside className="console-inspector" aria-label="變數與提示">
            <h2>
              <Braces size={17} /> 目前的變數
            </h2>
            {variables.length ? (
              <dl className="variables-list">
                {variables.map((variable) => (
                  <div key={variable.name}>
                    <dt>
                      <code>{variable.name}</code>
                      <span>{variable.type}</span>
                    </dt>
                    <dd>{variable.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="muted">
                執行程式、建立變數後，會在這裡看到它們的值與型別。
              </p>
            )}
            <details className="console-guide">
              <summary>
                <BookOpen size={16} /> 操作小提示 <ChevronDown size={14} />
              </summary>
              <p>
                直接輸入運算式，如 6 * 7，會顯示結果。輸入 for 或 def
                區塊時，可逐行輸入，最後送出空行完成。
              </p>
              <p>
                input() 會出現本系統的輸入欄位，函式和迴圈裡的輸入也能使用。
              </p>
              <p>清空畫面會保留變數；重設環境才會清除變數。</p>
            </details>
            <label className="console-preset-toggle">
              <input
                type="checkbox"
                checked={presetInput}
                onChange={(event) => setPresetInput(event.target.checked)}
              />{" "}
              使用預先輸入
            </label>
            <div className="console-history-tools">
              <History size={15} />
              <span>歷史保存在此瀏覽器</span>
              <button
                disabled={!history.length}
                onClick={() => {
                  setHistory([]);
                  historyIndex.current = 0;
                  try {
                    localStorage.removeItem(HISTORY);
                  } catch {
                    /* In-memory history is still cleared. */
                  }
                  setStatus("指令歷史已清除");
                }}
              >
                <Trash2 size={14} /> 清除
              </button>
            </div>
          </aside>
        )}
        {inspector && narrow && active && (
          <Dialog title="變數與提示" onClose={() => setInspector(false)}>
            <div className="console-inspector mobile-inspector">
              <h2>
                <Braces size={17} /> 目前的變數
              </h2>
              {variables.length ? (
                <dl className="variables-list">
                  {variables.map((variable) => (
                    <div key={variable.name}>
                      <dt>
                        <code>{variable.name}</code>
                        <span>{variable.type}</span>
                      </dt>
                      <dd>{variable.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="muted">
                  執行程式、建立變數後，會在這裡看到它們的值與型別。
                </p>
              )}
              <details className="console-guide">
                <summary>
                  <BookOpen size={16} /> 操作小提示 <ChevronDown size={14} />
                </summary>
                <p>
                  直接輸入運算式，如 6 * 7，會顯示結果。輸入 for 或 def
                  區塊時，可逐行輸入，最後送出空行完成。
                </p>
                <p>
                  input() 會出現本系統的輸入欄位，函式和迴圈裡的輸入也能使用。
                </p>
                <p>清空畫面會保留變數；重設環境才會清除變數。</p>
              </details>
              <label className="console-preset-toggle">
                <input
                  type="checkbox"
                  checked={presetInput}
                  onChange={(event) => setPresetInput(event.target.checked)}
                />{" "}
                使用預先輸入
              </label>
              <div className="console-history-tools">
                <History size={15} />
                <span>歷史保存在此瀏覽器</span>
                <button
                  disabled={!history.length}
                  onClick={() => {
                    setHistory([]);
                    historyIndex.current = 0;
                    try {
                      localStorage.removeItem(HISTORY);
                    } catch {
                      /* In-memory history is still cleared. */
                    }
                    setStatus("指令歷史已清除");
                  }}
                >
                  <Trash2 size={14} /> 清除
                </button>
              </div>
            </div>
          </Dialog>
        )}
      </div>
    </section>
  );
}
