export type EditorMode = "split" | "text" | "block";
export interface Mirror {
  getCode(): string;
  setCode(code: string): void;
  setMode(mode: EditorMode): void;
  refresh(): void;
  configuration: { height: number; toolbox: string };
  blockEditor: { remakeToolbox(): void; workspace: { dispose(): void } };
  textEditor: {
    resizeResponsively(): void;
    textSidebar: HTMLDivElement;
    codeMirror: {
      getValue(): string;
      setValue(code: string): void;
      focus(): void;
      getInputField(): HTMLTextAreaElement;
      setOption(name: string, value: unknown): void;
      toTextArea(): void;
    };
  };
  addChangeListener(callback: (event: { value: string }) => void): void;
}
interface LegacyFs {
  readDirectory(
    path: string,
  ): Promise<{ files: { name: string; fullPath: string }[] }>;
  readFile(path: string): Promise<string>;
}
interface LocalStore {
  getItem(key: string): Promise<{ editorContent?: string } | null>;
  setItem(key: string, data: unknown): Promise<void>;
}
export interface Connection {
  peer: string;
  open: boolean;
  metadata?: { name?: string };
  on(event: string, fn: (data?: unknown) => void): void;
  send(data: unknown): void;
  close(): void;
}
export interface PeerClient {
  id?: string;
  on(event: string, fn: (data: unknown) => void): void;
  connect(id: string, options: { metadata: { name: string } }): Connection;
  destroy(): void;
}
declare global {
  interface Window {
    BlockMirror: new (config: Record<string, unknown>) => Mirror;
    localforage: { createInstance(config: { name: string }): LocalStore };
    "indexeddb-fs": { createFs(): LegacyFs };
    Peer: new (config: Record<string, unknown>) => PeerClient;
  }
}
const base = import.meta.env.BASE_URL;
const scripts = new Map<string, Promise<void>>();
export function loadScript(path: string) {
  if (!scripts.has(path))
    scripts.set(
      path,
      new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = base + path;
        script.onload = () => resolve();
        script.onerror = () => {
          scripts.delete(path);
          script.remove();
          reject(new Error("載入失敗，請檢查網路後重新整理。"));
        };
        document.head.append(script);
      }),
    );
  return scripts.get(path)!;
}
export async function loadEditor() {
  for (const path of [
    "codemirror/codemirror.css",
    "codemirror/show-hint.css",
    "blockmirror/block_mirror.css",
  ]) {
    if (document.querySelector(`link[data-editor="${path}"]`)) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = base + path;
    link.dataset.editor = path;
    document.head.append(link);
  }
  for (const path of [
    "js/diff.min.js",
    "blockly/blockly_compressed.js",
    "blockly/blocks_compressed.js",
    "blockly/python_compressed.js",
    "blockly/msg/js/zh-hant.js",
    "codemirror/codemirror.js",
    "codemirror/show-hint.js",
    "codemirror/python-hint.js",
    "codemirror/python.js",
    "blockmirror/skulpt_parser.js",
    "blockmirror/block_mirror.js",
  ])
    await loadScript(path);
}
export async function courseStore() {
  await loadScript("js/localforge.js");
  return window.localforage.createInstance({ name: "futurecoder" });
}
export async function oldFiles() {
  await loadScript("js/indexfs.min.js");
  const fs = window["indexeddb-fs"].createFs();
  const directory = await fs.readDirectory("root");
  return Promise.all(
    directory.files
      .filter((f) => f.name.endsWith(".py"))
      .map(async (f) => {
        let name = f.name;
        try {
          name = decodeURIComponent(name);
        } catch {
          /* Keep the original name. */
        }
        return {
          id: crypto.randomUUID(),
          name,
          code: await fs.readFile(f.fullPath),
        };
      }),
  );
}
