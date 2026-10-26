import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Play,
  RotateCcw,
  Square,
  Terminal,
  Trash2,
} from "lucide-react";
import { Dialog } from "./Dialog";
import { Graphics } from "./Graphics";
import { InputPrompt } from "./InputPrompt";
import type { InputRequest, RunResult } from "../runtime";

export function ResultsDialog({
  result,
  runState,
  filename,
  onClose,
  onStop,
  onRun,
  onClear,
  onReset,
  restoreFocus,
  input,
  liveOutput,
  onInput,
}: {
  result: RunResult | null;
  runState: "idle" | "loading" | "running";
  filename: string;
  onClose: () => void;
  onStop: () => void;
  onRun: () => void;
  onClear: () => void;
  onReset: () => void;
  restoreFocus?: HTMLElement | null;
  input: InputRequest | null;
  liveOutput: string;
  onInput(value: string | null): void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const busy = runState !== "idle";
  const wasBusy = useRef(busy);
  useEffect(() => {
    if (wasBusy.current && !busy && document.activeElement === document.body)
      document
        .querySelector<HTMLElement>(".results-dialog .dialog-heading h2")
        ?.focus();
    wasBusy.current = busy;
  }, [busy]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        [result?.text, result?.error].filter(Boolean).join("\n"),
      );
      setCopyStatus("已複製文字結果");
    } catch {
      setCopyStatus("無法複製，請選取結果文字後手動複製。");
    }
  }
  return (
    <Dialog
      title="執行結果"
      className={`results-dialog ${expanded ? "is-expanded" : ""}`}
      onClose={onClose}
      restoreFocus={restoreFocus}
      focusHeading
      closeLabel={busy ? "停止並返回編輯器" : "返回編輯器"}
      headerActions={
        <button
          className="icon-button expand-result"
          aria-label={expanded ? "縮小結果視窗" : "放大結果視窗"}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      }
    >
      <div className="result-summary">
        <span className="run-filename" title={filename}>
          <Terminal size={16} />
          <span>{filename}</span>
        </span>
        <span
          className={`result-label ${result?.error && !busy ? "error-text" : ""}`}
          role="status"
        >
          {busy ? (
            <LoaderCircle size={15} className="spin" />
          ) : result ? (
            result.error ? (
              <Square size={13} />
            ) : (
              <Check size={16} />
            )
          ) : null}
          {busy
            ? input
              ? "等待你的輸入…"
              : runState === "loading"
                ? "正在準備 Python…"
                : "程式執行中…"
            : result
              ? result.error
                ? "執行已停止"
                : "執行完成"
              : "結果已清除"}
          {result && !busy && (
            <span>{(result.duration / 1000).toFixed(2)} 秒</span>
          )}
        </span>
      </div>
      <div
        className={`results-body ${result?.html ? "has-graphics" : ""}`}
        aria-busy={busy}
      >
        {busy && (input || liveOutput) ? (
          <>
            <section className="text-output" aria-label="即時輸出">
              <div className="text-output-heading">
                <h3>文字輸出</h3>
              </div>
              <pre className="result-text">{liveOutput}</pre>
            </section>
            {input ? (
              <InputPrompt
                key={input.id}
                request={input}
                onSubmit={onInput}
                onEOF={() => onInput(null)}
              />
            ) : (
              <p className="live-output-status" role="status">
                程式執行中…
              </p>
            )}
          </>
        ) : busy ? (
          <div className="result-placeholder">
            <LoaderCircle size={30} className="spin" />
            <strong>
              {runState === "loading"
                ? "第一次執行需要載入 Python 環境"
                : "正在執行你的程式"}
            </strong>
            <p>可隨時停止執行，返回編輯器調整程式。</p>
          </div>
        ) : result ? (
          <>
            {(result.text || result.error) && (
              <section className="text-output" aria-label="文字輸出">
                <div className="text-output-heading">
                  <h3>文字輸出</h3>
                  <button onClick={copy}>
                    <Copy size={15} /> 複製文字
                  </button>
                </div>
                {result.text && (
                  <pre className="result-text" tabIndex={0}>
                    {result.text}
                  </pre>
                )}
                {result.error && (
                  <pre className="result-error" tabIndex={0}>
                    {result.error}
                  </pre>
                )}
              </section>
            )}
            {result.html && <Graphics html={result.html} />}
            {!result.text && !result.html && !result.error && (
              <div className="result-placeholder">
                <Check size={28} />
                <strong>程式執行完成，沒有輸出</strong>
                <p>加入 print()，就能在這裡看到文字結果。</p>
              </div>
            )}
          </>
        ) : (
          <div className="result-placeholder">
            <Terminal size={30} />
            <strong>結果已清除</strong>
            <p>重新執行程式，查看新的結果。</p>
          </div>
        )}
      </div>
      <div className="result-copy-status" role="status">
        {copyStatus}
      </div>
      <div className="results-footer">
        <div className="result-secondary-actions">
          <button
            disabled={busy || !result}
            onClick={() => {
              setCopyStatus("");
              onClear();
            }}
          >
            <Trash2 size={15} /> 清除結果
          </button>
          <button disabled={busy} onClick={onReset}>
            <RotateCcw size={15} /> 重設 Python
          </button>
        </div>
        <div className="result-primary-actions">
          <button onClick={onClose}>
            {busy ? "停止並返回編輯器" : "返回編輯器"}
          </button>
          {busy ? (
            <button className="danger" onClick={onStop}>
              <Square size={15} /> 停止執行
            </button>
          ) : (
            <button
              className="primary"
              onClick={() => {
                setCopyStatus("");
                onRun();
              }}
            >
              <Play size={15} fill="currentColor" /> 重新執行
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
