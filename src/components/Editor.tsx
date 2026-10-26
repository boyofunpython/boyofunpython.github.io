import { useEffect, useRef, useState } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { loadEditor, type EditorMode, type Mirror } from "../legacy";

export function Editor({
  code,
  mode,
  toolbox,
  onChange,
  onReady,
}: {
  code: string;
  mode: EditorMode;
  toolbox: string;
  onChange: (code: string) => void;
  onReady: (mirror: Mirror) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const mirror = useRef<Mirror | null>(null);
  const latest = useRef({ code, mode, toolbox, onChange, onReady });
  latest.current = { code, mode, toolbox, onChange, onReady };
  const [state, setState] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    setState("loading");
    let observer: ResizeObserver;
    loadEditor()
      .then(() => {
        if (cancelled || !host.current) return;
        const instance = new window.BlockMirror({
          container: host.current,
          toolbox: latest.current.toolbox,
          height: Math.max(240, host.current.clientHeight),
          blockDelay: false,
          viewMode: latest.current.mode,
        });
        mirror.current = instance;
        instance.textEditor.codeMirror
          .getInputField()
          .setAttribute("aria-label", "Python 程式碼");
        host.current
          .querySelector(".injectionDiv")
          ?.setAttribute("role", "region");
        instance.textEditor.textSidebar.classList.add("mirror-text-spacer");
        instance.textEditor.codeMirror.setOption("indentUnit", 4);
        instance.textEditor.codeMirror.setOption("tabSize", 4);
        instance.textEditor.codeMirror.setOption("extraKeys", {
          Tab: "indentMore",
          "Shift-Tab": "indentLess",
          Esc: () => instance.textEditor.codeMirror.getInputField().blur(),
        });
        instance.textEditor.codeMirror
          .getInputField()
          .setAttribute("aria-describedby", "editor-keyboard-help");
        instance.setCode(latest.current.code);
        instance.addChangeListener((event) =>
          latest.current.onChange(event.value),
        );
        latest.current.onReady(instance);
        setState("ready");
        const resize = () => {
          const height = host.current?.clientHeight ?? 0;
          if (!height) return;
          instance.configuration.height = height;
          instance.textEditor.resizeResponsively();
          instance.refresh();
        };
        observer = new ResizeObserver(() => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(resize);
        });
        observer.observe(host.current);
        frame = requestAnimationFrame(resize);
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      cancelAnimationFrame(frame);
      mirror.current?.blockEditor.workspace.dispose();
      mirror.current?.textEditor.codeMirror.toTextArea();
      mirror.current = null;
      host.current?.replaceChildren();
    };
  }, [attempt]);
  useEffect(() => {
    if (mirror.current && mirror.current.getCode() !== code)
      mirror.current.setCode(code);
  }, [code]);
  useEffect(() => {
    mirror.current?.setMode(mode);
    mirror.current?.refresh();
  }, [mode]);
  useEffect(() => {
    if (!mirror.current) return;
    mirror.current.configuration.toolbox = toolbox;
    mirror.current.blockEditor.remakeToolbox();
  }, [toolbox]);
  return (
    <div className="editor-wrap">
      {state !== "ready" && (
        <div className="editor-loading" role="status">
          {state === "loading" ? (
            <>
              <LoaderCircle className="spin" /> 正在準備編輯器…
            </>
          ) : (
            <>
              <TriangleAlert /> 編輯器載入失敗，請檢查網路。
              <button onClick={() => setAttempt((n) => n + 1)}>
                重新載入編輯器
              </button>
            </>
          )}
        </div>
      )}
      <div
        ref={host}
        className="mirror-host"
        role="group"
        aria-label="Python 程式編輯器"
      />
    </div>
  );
}
