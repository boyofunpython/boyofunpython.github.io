import {
  useCallback,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  CheckCheck,
  CircleHelp,
  Code2,
  ExternalLink,
  FileCode2,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Puzzle,
  RotateCcw,
  Search,
  SplitSquareHorizontal,
  Sparkles,
  Terminal,
  Trash2,
  TriangleAlert,
  Upload,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
const Editor = lazy(() =>
  import("./components/Editor").then((module) => ({ default: module.Editor })),
);
import { Dialog } from "./components/Dialog";
import { ResultsDialog } from "./components/ResultsDialog";
import { Classroom } from "./components/Classroom";
import { PythonConsole } from "./components/PythonConsole";
const AIAssistant = lazy(() =>
  import("./components/AIAssistant").then((module) => ({
    default: module.AIAssistant,
  })),
);
import { type EditorMode, type EditorApi } from "./legacy";
import { examples } from "./examples";
import {
  fileNameError,
  readWorkspace,
  saveWorkspace,
  type CodeFile,
  type Workspace,
} from "./storage";
import {
  resetRuntime,
  runPython,
  submitInput,
  type InputRequest,
  type RunResult,
} from "./runtime";

type View = "workspace" | "examples" | "classroom" | "console" | "assistant";
type Modal = "new" | "rename" | "delete" | "help" | null;
const viewFromHash = (): View =>
  location.hash === "#/assistant"
    ? "assistant"
    : location.hash === "#/examples"
      ? "examples"
      : location.hash === "#/classroom"
        ? "classroom"
        : ["#/console", "#ide", "#/ide"].includes(location.hash)
          ? "console"
          : "workspace";
const modes: { id: EditorMode; label: string; icon: typeof Code2 }[] = [
  { id: "split", label: "分割", icon: SplitSquareHorizontal },
  { id: "text", label: "程式碼", icon: Code2 },
  { id: "block", label: "方塊", icon: Puzzle },
];

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const workspaceRef = useRef<Workspace | null>(null);
  const [startupError, setStartupError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [saved, setSaved] = useState("已儲存在此瀏覽器");
  const [view, setView] = useState<View>(viewFromHash);
  const [openedWorkspace, setOpenedWorkspace] = useState(
    () => viewFromHash() === "workspace",
  );
  const [openedClassroom, setOpenedClassroom] = useState(
    () => viewFromHash() === "classroom",
  );
  useEffect(() => {
    if (view === "classroom") setOpenedClassroom(true);
  }, [view]);
  const [openedAssistant, setOpenedAssistant] = useState(
    () => viewFromHash() === "assistant",
  );
  useEffect(() => {
    if (view === "assistant") setOpenedAssistant(true);
  }, [view]);
  const [mode, setMode] = useState<EditorMode>(() =>
    matchMedia("(max-width: 900px)").matches ? "text" : "split",
  );
  const [toolbox, setToolbox] = useState("normal");
  const [editorReady, setEditorReady] = useState(false);
  const [runState, setRunState] = useState<"idle" | "loading" | "running">(
    "idle",
  );
  const running = useRef(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [runFile, setRunFile] = useState("");
  const [runInput, setRunInput] = useState<InputRequest | null>(null);
  const [liveOutput, setLiveOutput] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [filename, setFilename] = useState("");
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);
  function notify(message: string, tone: "success" | "error" = "success") {
    setToast({ message, tone });
  }
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [navOpen, setNavOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDetailsElement>(null);
  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
  const [online, setOnline] = useState(navigator.onLine);
  const [activeExample, setActiveExample] = useState<
    (typeof examples)[number] | null
  >(null);
  const editorRef = useRef<EditorApi | null>(null);
  const resultReturnFocus = useRef<HTMLElement | null>(null);
  const lastView = useRef(view);
  const importRef = useRef<HTMLInputElement>(null);
  const current = workspace?.files.find((f) => f.id === workspace.activeId);
  const update = useCallback((next: Workspace) => {
    workspaceRef.current = next;
    setWorkspace(next);
    try {
      saveWorkspace(next);
      setStorageError("");
      setSaved("已儲存在此瀏覽器");
    } catch {
      setStorageError(
        "無法儲存到瀏覽器。請先下載檔案備份，再檢查儲存空間或瀏覽器權限。",
      );
      setSaved("尚未儲存，請下載備份");
    }
  }, []);
  useEffect(() => {
    readWorkspace()
      .then(update)
      .catch((error) => setStartupError(String(error.message ?? error)));
    const navigate = () => {
      setView(viewFromHash());
      setNavOpen(false);
    };
    const network = () => setOnline(navigator.onLine);
    window.addEventListener("hashchange", navigate);
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    return () => {
      window.removeEventListener("hashchange", navigate);
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
      resetRuntime();
    };
  }, [update]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(
      () => setToast(null),
      toast.tone === "error" ? 7000 : 4000,
    );
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    document.title = `${view === "workspace" ? "Python 練習室" : view === "examples" ? "靈感範例" : view === "console" ? "Python Console" : view === "assistant" ? "AI 助教" : "一起學習"} · 博幼輕鬆學 Python`;
  }, [view]);
  useEffect(() => {
    if (lastView.current === view) return;
    lastView.current = view;
    if (view === "workspace") setOpenedWorkspace(true);
    const frame = requestAnimationFrame(() => {
      const main = document.getElementById("main-content");
      if (!main) return;
      main.scrollTop = 0;
      const target =
        view === "workspace"
          ? main
          : (Array.from(main.querySelectorAll<HTMLElement>("h1")).find(
              (heading) => heading.getClientRects().length,
            ) ?? main);
      target?.setAttribute("tabindex", "-1");
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [view]);
  const onCodeChange = useCallback(
    (code: string) => {
      const state = workspaceRef.current;
      if (
        !state ||
        state.files.find((f) => f.id === state.activeId)?.code === code
      )
        return;
      update({
        ...state,
        files: state.files.map((f) =>
          f.id === state.activeId ? { ...f, code } : f,
        ),
      });
    },
    [update],
  );
  // Read the live editor as well as state before run/export, including the last keystroke.
  const getCode = () =>
    editorRef.current?.getCode() ??
    workspaceRef.current?.files.find(
      (f) => f.id === workspaceRef.current?.activeId,
    )?.code ??
    "";
  async function execute() {
    if (
      running.current ||
      !editorRef.current ||
      view !== "workspace" ||
      modal ||
      navOpen
    )
      return;
    if (!resultsOpen)
      resultReturnFocus.current = document.activeElement as HTMLElement;
    running.current = true;
    setRunState("loading");
    setResultsOpen(true);
    setResult(null);
    setRunInput(null);
    setLiveOutput("");
    const code = getCode();
    onCodeChange(code);
    setRunFile(
      workspaceRef.current?.files.find(
        (f) => f.id === workspaceRef.current?.activeId,
      )?.name ?? "",
    );
    try {
      setResult(
        await runPython(
          code,
          () => setRunState("running"),
          {
            onInput: setRunInput,
            onOutput: (text) => setLiveOutput((value) => value + text),
          },
          "run",
          workspaceRef.current?.files.find(
            (file) => file.id === workspaceRef.current?.activeId,
          )?.name ?? "main.py",
        ),
      );
    } catch {
      setResult({
        text: "",
        error: "執行失敗，請重設 Python 後再試一次。",
        duration: 0,
      });
    } finally {
      running.current = false;
      setRunState("idle");
    }
  }
  const actions = useRef({
    execute,
    save: () => {
      const state = workspaceRef.current;
      if (state) {
        onCodeChange(getCode());
        update(workspaceRef.current!);
        try {
          saveWorkspace(workspaceRef.current!);
          notify("已儲存目前的程式");
        } catch {
          notify("尚未儲存，請下載檔案備份", "error");
        }
      }
    },
  });
  actions.current = { execute, save: actions.current.save };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape" && fileMenuRef.current?.open) {
        fileMenuRef.current.removeAttribute("open");
        fileMenuRef.current.querySelector("summary")?.focus();
        event.preventDefault();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        if (document.querySelector("dialog[open]")) return;
        event.preventDefault();
        actions.current.execute();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        actions.current.save();
      }
    };
    const outside = (event: PointerEvent) => {
      if (!fileMenuRef.current?.contains(event.target as Node))
        fileMenuRef.current?.removeAttribute("open");
    };
    window.addEventListener("keydown", handler);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("keydown", handler);
      document.removeEventListener("pointerdown", outside);
    };
  }, []);
  function switchFile(file: CodeFile) {
    setNavOpen(false);
    const state = workspaceRef.current;
    if (!state || file.id === state.activeId) return;
    onCodeChange(getCode());
    update({ ...workspaceRef.current!, activeId: file.id });
    setActiveExample(null);
    location.hash = "/";
    setNavOpen(false);
  }
  function uniqueName(proposed: string) {
    const files = workspaceRef.current!.files;
    let name = proposed;
    let i = 2;
    while (files.some((f) => f.name === name))
      name = proposed.replace(/\.py$/, "") + `_${i++}.py`;
    return name;
  }
  function addFile(code: string, name: string) {
    onCodeChange(getCode());
    const state = workspaceRef.current!;
    const file = { id: crypto.randomUUID(), name: uniqueName(name), code };
    update({ files: [...state.files, file], activeId: file.id });
    location.hash = "/";
    setNavOpen(false);
    return file;
  }
  function openModal(next: Modal) {
    setNavOpen(false);
    fileMenuRef.current?.removeAttribute("open");
    setFilename(next === "rename" ? current!.name : "練習.py");
    setFormError("");
    setModal(next);
  }
  function submitFile(event: FormEvent) {
    event.preventDefault();
    if (!workspace || !current) return;
    const name = filename.trim();
    const error = fileNameError(
      name,
      workspace.files,
      modal === "rename" ? current.id : undefined,
    );
    if (error) {
      setFormError(error);
      event.currentTarget.querySelector("input")?.focus();
      return;
    }
    if (modal === "new") {
      addFile("# 在這裡開始你的 Python 練習\n", name);
      setActiveExample(null);
    }
    if (modal === "rename")
      update({
        ...workspace,
        files: workspace.files.map((f) =>
          f.id === current.id ? { ...f, name } : f,
        ),
      });
    setModal(null);
  }
  function download() {
    if (!current) return;
    const url = URL.createObjectURL(
      new Blob([getCode()], { type: "text/x-python;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = current.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("已下載 " + current.name);
  }
  async function importFile(file?: File) {
    if (!file) return;
    if (!file.name.endsWith(".py") || file.size > 1000000) {
      notify("請選擇小於 1 MB 的 .py 檔案", "error");
      return;
    }
    try {
      addFile(await file.text(), file.name);
      setActiveExample(null);
      notify("已匯入 " + file.name);
    } catch {
      notify("無法讀取檔案，請重新選擇。", "error");
    }
  }
  function openConsole() {
    onCodeChange(getCode());
    fileMenuRef.current?.removeAttribute("open");
    setNavOpen(false);
    location.hash = "/console";
  }
  if (!workspace || !current)
    return (
      <div className="startup">
        <div className="brand-mark">
          <Code2 />
        </div>
        <h1>博幼輕鬆學 Python</h1>
        {startupError ? (
          <p role="alert">{startupError}</p>
        ) : (
          <p>
            <LoaderCircle className="spin" size={18} /> 正在開啟你的練習室…
          </p>
        )}
      </div>
    );
  const filtered = examples.filter(
    (e) =>
      (category === "全部" || e.category === category) &&
      (e.title + e.description + e.category).includes(query),
  );
  const isBusy = runState !== "idle";
  return (
    <div
      className={`app-shell ${view === "workspace" ? "is-workspace" : view === "console" || view === "assistant" ? "is-console" : "is-browsing"}`}
    >
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        跳至主要內容
      </a>
      {navOpen && (
        <Dialog
          title="選單與檔案"
          className="nav-drawer"
          closeLabel="關閉導覽選單"
          onClose={() => setNavOpen(false)}
        >
          <nav className="main-nav" aria-label="主要導覽">
            {[
              {
                id: "workspace",
                href: "#/",
                label: "程式練習室",
                icon: LayoutDashboard,
              },
              {
                id: "examples",
                href: "#/examples",
                label: "靈感範例",
                icon: BookOpen,
              },
              {
                id: "console",
                href: "#/console",
                label: "Python Console",
                icon: Terminal,
              },
              {
                id: "assistant",
                href: "#/assistant",
                label: "AI 助教",
                icon: Sparkles,
              },
              {
                id: "classroom",
                href: "#/classroom",
                label: "一起學習",
                icon: Users,
              },
            ].map((item) => (
              <a
                key={item.id}
                href={item.href}
                aria-current={view === item.id ? "page" : undefined}
                onClick={() => setNavOpen(false)}
              >
                <item.icon size={19} />
                {item.label}
              </a>
            ))}
          </nav>
          <div className="drawer-files">
            <div className="file-heading">
              <h3>
                我的檔案 <span>{workspace.files.length}</span>
              </h3>
              <button
                className="icon-button"
                aria-label="新增 Python 檔案"
                onClick={() => openModal("new")}
              >
                <Plus size={19} />
              </button>
            </div>
            <div className="file-list">
              {workspace.files.map((file) => (
                <button
                  key={file.id}
                  className={`file-item ${file.id === current.id ? "selected" : ""}`}
                  onClick={() => switchFile(file)}
                >
                  <FileCode2 size={17} />
                  <span>{file.name}</span>
                  {file.id === current.id && <Check size={15} />}
                </button>
              ))}
            </div>
            <button
              className="import-button"
              onClick={() => {
                setNavOpen(false);
                importRef.current?.click();
              }}
            >
              <Upload size={17} /> 匯入 .py 檔案
            </button>
          </div>
          <div className="drawer-bottom">
            <p>
              <CheckCheck size={15} />
              {saved}
            </p>
            <p className="muted">檔案保存在此瀏覽器，請定期下載備份。</p>
            <span className="network-state">
              {online ? <Wifi size={15} /> : <WifiOff size={15} />}
              {online ? "裝置已連上網路" : "裝置目前離線"}
            </span>
            <button onClick={() => openModal("help")}>
              <CircleHelp size={17} /> 使用小幫手
            </button>
            <a
              className="foundation"
              href="https://www.boyo.org.tw"
              target="_blank"
              rel="noreferrer"
            >
              博幼社會福利基金會 <ExternalLink size={13} />
            </a>
          </div>
        </Dialog>
      )}
      <input
        ref={importRef}
        type="file"
        accept=".py"
        hidden
        onChange={(event) => {
          importFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <div className="main-shell">
        <header className="topbar">
          <div className="app-identity">
            <button
              className="icon-button menu-toggle"
              aria-label="開啟選單"
              aria-haspopup="dialog"
              aria-expanded={navOpen}
              data-focus-fallback
              onClick={() => setNavOpen(true)}
            >
              <Menu size={22} />
            </button>
            <a href="#/" className="brand" aria-label="博幼 Python 練習室">
              <span className="brand-mark">
                <Code2 size={22} />
              </span>
              <span>
                博幼 <strong>Python</strong>
              </span>
            </a>
            <span className="view-label">
              {view === "workspace"
                ? "程式練習室"
                : view === "examples"
                  ? "靈感範例"
                  : view === "console"
                    ? "Python Console"
                    : view === "assistant"
                      ? "AI 助教"
                      : "一起學習"}
            </span>
          </div>
          <div className="topbar-actions">
            <a
              className="header-link"
              href="#/assistant"
              aria-label="AI 助教"
              title="AI 助教"
            >
              <Sparkles size={18} />
              <span>AI 助教</span>
            </a>
            <a
              className="header-link"
              href="#/examples"
              aria-label="靈感範例"
              title="靈感範例"
            >
              <BookOpen size={18} />
              <span>靈感範例</span>
            </a>
            <button
              className="icon-button"
              aria-label="使用小幫手"
              title="使用小幫手"
              onClick={() => openModal("help")}
            >
              <CircleHelp size={19} />
            </button>
            {view === "workspace" ? (
              <button
                className="primary run-button"
                disabled={!editorReady || isBusy}
                onClick={execute}
              >
                <Play size={16} fill="currentColor" />
                <span>執行程式</span>
                <kbd>{shortcut} ↵</kbd>
              </button>
            ) : (
              <a className="button primary" href="#/">
                返回編輯器 <ArrowRight size={16} />
              </a>
            )}
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className={
            view === "workspace" || view === "console" || view === "assistant"
              ? "workspace-main"
              : "content-scroll"
          }
        >
          {storageError && (
            <p className="error-banner" role="alert">
              {storageError}
            </p>
          )}
          <section hidden={view !== "workspace"} className="workspace-view">
            <h1 className="sr-only">Python 程式練習室</h1>
            <span id="editor-keyboard-help" className="sr-only">
              Tab 縮排，Escape 離開程式碼輸入，接著按 Tab 可移至其他工具。
            </span>
            <div className="workspace-toolbar">
              <div className="file-controls">
                <FileCode2 size={18} />
                <label className="sr-only" htmlFor="current-file">
                  目前檔案
                </label>
                <select
                  id="current-file"
                  className="file-picker"
                  value={current.id}
                  onChange={(event) => {
                    const file = workspace.files.find(
                      (f) => f.id === event.target.value,
                    );
                    if (file) switchFile(file);
                  }}
                >
                  {workspace.files.map((file) => (
                    <option key={file.id} value={file.id}>
                      {file.name}
                    </option>
                  ))}
                </select>
                <button
                  className="icon-button"
                  aria-label="新增 Python 檔案"
                  title="新增 Python 檔案"
                  onClick={() => openModal("new")}
                >
                  <Plus size={18} />
                </button>
                <details className="file-menu" ref={fileMenuRef}>
                  <summary aria-label="檔案操作" title="檔案操作">
                    <MoreHorizontal size={20} />
                  </summary>
                  <div
                    onClick={() => fileMenuRef.current?.removeAttribute("open")}
                  >
                    <button onClick={() => importRef.current?.click()}>
                      <Upload size={16} /> 匯入 .py 檔案
                    </button>
                    <button onClick={() => openModal("rename")}>
                      <Pencil size={16} /> 重新命名
                    </button>
                    <button onClick={download}>
                      <ArrowDownToLine size={16} /> 下載 .py 檔案
                    </button>
                    <button onClick={openConsole}>
                      <ExternalLink size={16} /> 開啟 Python Console
                    </button>
                    <button
                      onClick={() => {
                        resetRuntime();
                        setResult(null);
                        notify("Python 環境已重設");
                      }}
                    >
                      <RotateCcw size={16} /> 重設 Python 環境
                    </button>
                    <button
                      className="danger-text"
                      onClick={() => openModal("delete")}
                    >
                      <Trash2 size={16} /> 刪除檔案
                    </button>
                  </div>
                </details>
                <span
                  className={`save-indicator ${storageError ? "unsaved" : ""}`}
                  title={saved}
                >
                  {storageError ? <X size={15} /> : <CheckCheck size={15} />}
                  <span>{storageError ? "尚未儲存" : "已儲存"}</span>
                </span>
              </div>
              <div className="editor-controls">
                <div
                  className="mode-switch"
                  role="group"
                  aria-label="編輯器顯示模式"
                >
                  {modes.map((m) => (
                    <button
                      key={m.id}
                      aria-pressed={mode === m.id}
                      className={mode === m.id ? "selected" : ""}
                      onClick={() => setMode(m.id)}
                    >
                      <m.icon size={16} />
                      {m.label}
                    </button>
                  ))}
                </div>
                <label className="toolbox-label">
                  <span className="sr-only">方塊工具</span>
                  <select
                    aria-label="方塊工具"
                    value={toolbox}
                    disabled={mode === "text"}
                    title={
                      mode === "text"
                        ? "切換至方塊或分割模式後選擇工具"
                        : "選擇方塊工具"
                    }
                    onChange={(event) => setToolbox(event.target.value)}
                  >
                    <option value="normal">基礎工具</option>
                    <option value="full">完整工具</option>
                  </select>
                </label>
              </div>
              <button
                className="last-result"
                disabled={!result && !isBusy}
                onClick={() => {
                  resultReturnFocus.current =
                    document.activeElement as HTMLElement;
                  setResultsOpen(true);
                }}
              >
                <Terminal size={16} />
                <span>上次結果</span>
              </button>
            </div>
            {activeExample && (
              <details className="example-hint">
                <summary>
                  <BookOpen size={16} />
                  {activeExample.title}
                  <span>練習提示</span>
                </summary>
                <p>{activeExample.concept}</p>
              </details>
            )}
            <section className="editor-panel" aria-label="程式編輯區">
              {(openedWorkspace || view === "workspace") && (
                <Suspense
                  fallback={
                    <div className="editor-loading" role="status">
                      <LoaderCircle size={18} className="spin" />{" "}
                      正在載入編輯器…
                    </div>
                  }
                >
                  {" "}
                  <Editor
                    code={current.code}
                    mode={mode}
                    toolbox={toolbox}
                    onChange={onCodeChange}
                    onReady={(mirror) => {
                      editorRef.current = mirror;
                      setEditorReady(true);
                    }}
                  />
                </Suspense>
              )}
            </section>
            <div className="editor-footer">
              <span>
                <span className="status-dot" /> Python 3.14{" "}
                <span className="footer-divider">·</span> UTF-8{" "}
                <span className="footer-divider">·</span>{" "}
                {current.code.split("\n").length} 行
              </span>
              <span>
                {mode === "split"
                  ? "方塊與程式碼同步"
                  : mode === "text"
                    ? "程式碼模式"
                    : "方塊模式"}
                <span className="footer-divider">·</span>
                <span className="shortcut-hint">{shortcut} + Enter 執行</span>
              </span>
            </div>
          </section>
          <PythonConsole
            active={view === "console"}
            filename={current.name}
            getCode={getCode}
          />
          {(openedAssistant || view === "assistant") && (
            <Suspense
              fallback={view === "assistant" ? <p>正在開啟 AI 助教…</p> : null}
            >
              <AIAssistant
                active={view === "assistant"}
                getSnapshot={() => ({
                  id: current.id,
                  name: current.name,
                  code: getCode(),
                })}
                lastOutput={[result?.text, result?.error]
                  .filter(Boolean)
                  .join("\n")}
                lastOutputFile={runFile}
                createFile={(code) => {
                  addFile(code, "ai_example.py");
                  setToast({
                    message: "已另存 AI 建議程式，請閱讀後自行執行。",
                    tone: "success",
                  });
                }}
                applyCode={(snapshot, code) => {
                  if (
                    workspaceRef.current?.activeId !== snapshot.id ||
                    getCode() !== snapshot.code
                  )
                    return false;
                  if (editorRef.current) editorRef.current.setCode(code);
                  onCodeChange(code);
                  location.hash = "/";
                  return true;
                }}
              />
            </Suspense>
          )}
          {view === "examples" && (
            <section className="examples-view">
              <div className="page-intro">
                <span className="eyebrow">A LITTLE INSPIRATION</span>
                <h1>從好奇開始，動手試試。</h1>
                <p>每個範例都是一個小起點。打開、執行，再改成自己的版本。</p>
              </div>
              <div className="examples-filters">
                <div
                  className="category-tabs"
                  role="group"
                  aria-label="範例分類"
                >
                  {["全部", ...new Set(examples.map((e) => e.category))].map(
                    (c) => (
                      <button
                        key={c}
                        aria-pressed={category === c}
                        className={category === c ? "selected" : ""}
                        onClick={() => setCategory(c)}
                      >
                        {c}
                      </button>
                    ),
                  )}
                </div>
                <label className="search-box">
                  <Search size={17} />
                  <input
                    aria-label="搜尋範例"
                    placeholder="搜尋靈感…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              <div className="examples-grid">
                {filtered.map((example) => (
                  <article className="panel example-card" key={example.id}>
                    <div className={"example-art art-" + example.id}>
                      <span>{example.icon}</span>
                      <code>
                        {example.code
                          .split("\n")
                          .find((line) => line && !line.startsWith("#"))}
                      </code>
                    </div>
                    <div className="example-card-body">
                      <div className="example-meta">
                        <span className="tag">{example.category}</span>
                        <span>{example.time}</span>
                      </div>
                      <h2>{example.title}</h2>
                      <p>{example.description}</p>
                      <button
                        onClick={() => {
                          addFile(example.code, example.id + ".py");
                          setActiveExample(example);
                        }}
                      >
                        開啟範例 <ArrowRight size={16} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {!filtered.length && (
                <div className="panel no-results">
                  <Search />
                  <h2>還沒有符合的範例</h2>
                  <p>試試其他關鍵字，或查看所有範例。</p>
                  <button
                    onClick={() => {
                      setQuery("");
                      setCategory("全部");
                    }}
                  >
                    查看所有範例
                  </button>
                </div>
              )}
            </section>
          )}
          {(openedClassroom || view === "classroom") && (
            <Classroom
              active={view === "classroom"}
              filename={current.name}
              getCode={getCode}
              receive={(code, name) => {
                addFile(code, name);
                setActiveExample(null);
                notify("已另存收到的程式");
              }}
            />
          )}
        </main>
      </div>
      {toast && (
        <div
          className={`toast ${toast.tone === "error" ? "toast-error" : ""}`}
          role={toast.tone === "error" ? "alert" : "status"}
        >
          {toast.tone === "error" ? (
            <TriangleAlert size={17} />
          ) : (
            <Check size={17} />
          )}
          {toast.message}
        </div>
      )}
      {resultsOpen && (
        <ResultsDialog
          input={runInput}
          liveOutput={liveOutput}
          onInput={(value) => {
            if (runInput) submitInput(runInput.id, value);
          }}
          restoreFocus={resultReturnFocus.current}
          result={result}
          runState={runState}
          filename={runFile}
          onClose={() => {
            if (running.current) resetRuntime();
            setResultsOpen(false);
          }}
          onStop={() => resetRuntime()}
          onRun={execute}
          onClear={() => setResult(null)}
          onReset={() => {
            resetRuntime();
            setResult(null);
            setResultsOpen(false);
            notify("Python 環境已重設");
          }}
        />
      )}
      {modal && (
        <Dialog
          title={
            modal === "new"
              ? "新增 Python 檔案"
              : modal === "rename"
                ? "重新命名檔案"
                : modal === "delete"
                  ? "刪除這個檔案？"
                  : "練習室使用小幫手"
          }
          onClose={() => setModal(null)}
        >
          {(modal === "new" || modal === "rename") && (
            <form onSubmit={submitFile}>
              <label>
                檔案名稱
                <input
                  autoFocus
                  data-dialog-autofocus
                  aria-invalid={!!formError}
                  value={filename}
                  onChange={(e) => {
                    setFilename(e.target.value);
                    setFormError("");
                  }}
                  maxLength={120}
                  aria-describedby={formError ? "file-error" : undefined}
                />
              </label>
              <p className="muted">使用 .py 結尾，中英文檔名都可以。</p>
              {formError && (
                <p id="file-error" className="error-text" role="alert">
                  {formError}
                </p>
              )}
              <div className="dialog-actions">
                <button type="button" onClick={() => setModal(null)}>
                  取消
                </button>
                <button className="primary" type="submit">
                  {modal === "new" ? "建立檔案" : "儲存名稱"}
                </button>
              </div>
            </form>
          )}
          {modal === "delete" && (
            <>
              <p>「{current.name}」刪除後無法復原。建議先下載備份。</p>
              <div className="dialog-actions">
                <button onClick={() => setModal(null)}>取消</button>
                <button
                  className="danger"
                  onClick={() => {
                    const files = workspace.files.filter(
                      (f) => f.id !== current.id,
                    );
                    if (!files.length)
                      files.push({
                        id: crypto.randomUUID(),
                        name: "main.py",
                        code: "",
                      });
                    update({ files, activeId: files[0].id });
                    setActiveExample(null);
                    setModal(null);
                    notify("檔案已刪除");
                  }}
                >
                  確定刪除
                </button>
              </div>
            </>
          )}
          {modal === "help" && (
            <div className="help-content">
              <p>
                拖拉方塊與編寫 Python 可以自由切換。分割模式會同步顯示兩種寫法。
              </p>
              <dl>
                <div>
                  <dt>執行程式</dt>
                  <dd>
                    <kbd>⌘ / Ctrl + Enter</kbd>
                  </dd>
                </div>
                <div>
                  <dt>儲存程式</dt>
                  <dd>
                    <kbd>⌘ / Ctrl + S</kbd>
                  </dd>
                </div>
              </dl>
              <h3>檔案存在哪裡？</h3>
              <p>
                程式會自動儲存在目前瀏覽器。清除網站資料會移除檔案，記得從檔案選單下載
                .py 備份。
              </p>
              <h3>程式一直執行？</h3>
              <p>
                按「停止執行」中止程式。執行超過 30 秒也會自動停止。重設 Python
                環境會清除執行時的變數，保留你的程式檔案。
              </p>
              <h3>需要互動輸入或查詢變數？</h3>
              <p>
                檔案選單中的「開啟 Python
                Console」會開啟本系統的互動環境。執行目前檔案後，可以直接輸入指令、查詢變數與使用
                input()。
              </p>
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}
