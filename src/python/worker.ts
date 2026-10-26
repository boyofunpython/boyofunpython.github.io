import { PYTHON_LIMITS } from "./limits";
import { createSvgDocument } from "./svg-document";
import { CALL_SPECS } from "../editor/catalog-data";
import type { PyodideInterface } from "pyodide";
import type { WorkerRequest } from "./protocol";

const scope = self as unknown as {
  postMessage(data: unknown): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};
let py: PyodideInterface;
let ready: Promise<void>;
let queue = Promise.resolve();
let text = "";
let buffered: Record<string, string> = { stdout: "", stderr: "" };
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let lastFlush = 0;
function flush() {
  clearTimeout(flushTimer);
  flushTimer = undefined;
  for (const [stream, chunk] of Object.entries(buffered)) {
    if (chunk)
      scope.postMessage({ type: "output", id: activeId, text: chunk, stream });
  }
  buffered = { stdout: "", stderr: "" };
  lastFlush = performance.now();
}
let activeId = 0;
let inputCounter = 0;
let stdinLines: string[] = [];
let pendingInput: { id: string; resolve(value: string | null): void } | null =
  null;
let resultElement: { innerHTML: string };
function write(chunk: string, stream: string) {
  if (text.length + chunk.length > PYTHON_LIMITS.outputChars)
    throw new Error("輸出超過 100,000 字元，請減少列印次數。");
  text += chunk;
  buffered[stream] = (buffered[stream] ?? "") + chunk;
  if (performance.now() - lastFlush >= 32) flush();
  else if (!flushTimer)
    flushTimer = setTimeout(() => {
      flushTimer = undefined;
      flush();
    }, 32);
}
async function init(base: string, id: number) {
  const { loadPyodide } = (await import(
    /* @vite-ignore */ new URL("vendor/pyodide/pyodide.mjs", base).href
  )) as typeof import("pyodide");
  py = await loadPyodide({
    indexURL: new URL("vendor/pyodide/", base).href,
    packageBaseUrl: "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/",
    stdout: () => {},
    stderr: () => {},
  });
  const { document, result } = createSvgDocument();
  resultElement = result;
  Object.assign(globalThis, { document });
  py.registerJsModule("boyo", {
    document,
    write,
    request_input(prompt: string) {
      if (stdinLines.length) {
        const value = stdinLines.shift()!;
        write(prompt + value + "\n", "stdout");
        return value;
      }
      if (
        typeof (WebAssembly as unknown as { Suspending?: unknown })
          .Suspending !== "function"
      )
        return null;
      flush();
      return new Promise<string | null>((resolve) => {
        const inputId = `${activeId}-${++inputCounter}`;
        pendingInput = { id: inputId, resolve };
        scope.postMessage({ type: "input", id: activeId, inputId, prompt });
      });
    },
  });
  py.FS.mkdirTree("/home/pyodide/boyo_turtle");
  for (const file of ["__init__.py", "myturtle.py", "svg.py"]) {
    const response = await fetch(new URL("python/boyo_turtle/" + file, base));
    if (!response.ok) throw new Error("無法載入海龜繪圖程式");
    py.FS.writeFile("/home/pyodide/boyo_turtle/" + file, await response.text());
  }
  py.globals.set("_studio_block_catalog", JSON.stringify(CALL_SPECS));
  for (const file of ["studio_runtime.py", "ast_blocks.py"]) {
    const response = await fetch(new URL("python/" + file, base));
    if (!response.ok) throw new Error("無法載入 Python 輔助程式");
    await py.runPythonAsync(await response.text());
  }
  const python = py.runPython("sys.version.split()[0]") as string;
  scope.postMessage({
    type: "ready",
    id,
    info: {
      python,
      pyodide: py.version,
      interactiveInput:
        typeof (WebAssembly as unknown as { Suspending?: unknown })
          .Suspending === "function",
    },
  });
}
scope.onmessage = ({ data }) => {
  if (data.type === "init") {
    ready = init(data.base, data.id);
    ready.catch((error) =>
      scope.postMessage({ type: "fatal", error: String(error) }),
    );
    return;
  }
  if (data.type === "input") {
    if (pendingInput?.id === data.inputId) {
      pendingInput.resolve(data.value);
      pendingInput = null;
    }
    return;
  }
  queue = queue
    .then(async () => {
      await ready;
      py.globals.set("_studio_source", "code" in data ? data.code : "");
      if (data.type === "run" || data.type === "console") {
        activeId = data.id;
        text = "";
        buffered = { stdout: "", stderr: "" };
        lastFlush = 0;
        resultElement.innerHTML = "";
        stdinLines = [...(data.stdinLines ?? [])];
        py.globals.set("_studio_filename", data.filename ?? "main.py");
        py.globals.set("_studio_mode", data.type);
        let incomplete = false;
        let error: string | undefined;
        try {
          await py.loadPackagesFromImports(data.code);
          scope.postMessage({ type: "running", id: data.id });
          const outcome = JSON.parse(
            (await py.runPythonAsync(
              "await _studio_dispatch(_studio_source, _studio_filename, _studio_mode)",
            )) as string,
          );
          incomplete = !!outcome.incomplete;
          error = outcome.error;
        } catch (failure) {
          error =
            (failure as Error).message ||
            String(failure) ||
            "Python 執行失敗。";
        }
        flush();
        const html = resultElement.innerHTML;
        scope.postMessage({
          type: "result",
          id: data.id,
          result: { text, html, incomplete, error },
        });
        activeId = 0;
        pendingInput = null;
        return;
      }
      try {
        let value: unknown;
        if (data.type === "parse")
          value = JSON.parse(
            py.runPython("parse_blocks(_studio_source)") as string,
          );
        if (data.type === "variables")
          value = JSON.parse(py.runPython("_studio_variables()") as string);
        if (data.type === "complete")
          value = JSON.parse(
            py.runPython("_studio_complete(_studio_source)") as string,
          );
        scope.postMessage({ type: "response", id: data.id, value });
      } catch (error) {
        scope.postMessage({
          type: "response",
          id: data.id,
          error: String(error),
        });
      }
    })
    .catch((error) =>
      scope.postMessage({
        type: "response",
        id: data.id,
        error: String(error),
      }),
    );
};
