import type {
  AstResult,
  InputRequest,
  RunHandlers,
  RunResult,
  RuntimeInfo,
  VariableInfo,
  WorkerRequest,
} from "./python/protocol";
export type {
  RunResult,
  RuntimeInfo,
  InputRequest,
  RunHandlers,
  VariableInfo,
} from "./python/protocol";
let worker: Worker | null = null;
let ready: Promise<RuntimeInfo> | null = null;
let nextId = 0;
let starting: number | null = null;
const requests = new Map<
  number,
  { resolve(value: unknown): void; reject(error: Error): void }
>();
let initTimer: ReturnType<typeof setTimeout> | undefined;
let run: {
  id: number;
  resolve(result: RunResult): void;
  handlers: RunHandlers;
  onRunning(): void;
  started: number;
  timer?: ReturnType<typeof setTimeout>;
  remaining: number;
  phaseStart: number;
  input: string | null;
  output: string;
} | null = null;
function armTimeout() {
  if (!run) return;
  run.phaseStart = performance.now();
  run.timer = setTimeout(
    () => resetRuntime("執行超過 30 秒，已停止。請檢查迴圈後再試一次。"),
    run.remaining,
  );
}
function start() {
  worker = new Worker(new URL("./python/worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = ({ data }) => {
    if (data.type === "ready") {
      clearTimeout(initTimer);
      requests.get(data.id)?.resolve(data.info);
      requests.delete(data.id);
      return;
    }
    if (data.type === "fatal") {
      resetRuntime("Python 載入失敗：" + data.error);
      return;
    }
    if (data.type === "response") {
      const pending = requests.get(data.id);
      requests.delete(data.id);
      if (data.error) pending?.reject(new Error(data.error));
      else pending?.resolve(data.value);
      return;
    }
    if (!run || data.id !== run.id) return;
    if (data.type === "running") {
      clearTimeout(run.timer);
      run.started = performance.now();
      run.onRunning();
      armTimeout();
    }
    if (data.type === "output") {
      run.output += data.text;
      run.handlers.onOutput?.(data.text, data.stream);
    }
    if (data.type === "input") {
      clearTimeout(run.timer);
      run.remaining = Math.max(
        1,
        run.remaining - (performance.now() - run.phaseStart),
      );
      run.input = data.inputId;
      if (run.handlers.onInput)
        run.handlers.onInput({ id: data.inputId, prompt: data.prompt });
      else {
        resetRuntime("此程式需要互動輸入，請在 Python Console 執行。");
      }
    }
    if (data.type === "result") {
      clearTimeout(run.timer);
      run.handlers.onInput?.(null);
      run.resolve({
        ...data.result,
        duration: performance.now() - run.started,
      });
      run = null;
    }
  };
  worker.onerror = () =>
    resetRuntime("Python 執行環境載入失敗，請檢查網路後再試。");
  const id = ++nextId;
  ready = new Promise((resolve, reject) => {
    requests.set(id, {
      resolve: (value) => resolve(value as RuntimeInfo),
      reject,
    });
  });
  initTimer = setTimeout(
    () => resetRuntime("Python 載入逾時，請檢查網路後再試。"),
    90000,
  );
  worker.postMessage({
    type: "init",
    id,
    base: new URL(import.meta.env.BASE_URL, document.baseURI).href,
  } satisfies WorkerRequest);
}
export function getRuntimeInfo(): Promise<RuntimeInfo> {
  if (!worker) start();
  return ready!;
}
async function request<T>(
  type: "parse" | "complete" | "variables",
  code = "",
): Promise<T> {
  await getRuntimeInfo();
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    requests.set(id, { resolve: (value) => resolve(value as T), reject });
    worker!.postMessage({ type, id, code } satisfies WorkerRequest);
  });
}
export const parsePython = (code: string) => request<AstResult>("parse", code);
export const completePython = (code: string) =>
  request<string[]>("complete", code);
export const getVariables = () => request<VariableInfo[]>("variables");
export async function runPython(
  code: string,
  onRunning: () => void,
  handlers: RunHandlers = {},
  mode: "run" | "console" = "run",
  filename = "main.py",
): Promise<RunResult> {
  if (run || starting !== null)
    return { text: "", error: "已有程式正在執行，請先停止。", duration: 0 };
  const reservation = ++nextId;
  starting = reservation;
  try {
    await getRuntimeInfo();
  } catch (error) {
    if (starting === reservation) starting = null;
    return {
      text: "",
      error: (error as Error).message,
      duration: 0,
      reset: true,
    };
  }
  if (starting !== reservation)
    return { text: "", error: "程式已停止。", duration: 0, reset: true };
  starting = null;
  const id = ++nextId;
  return new Promise((resolve) => {
    run = {
      id,
      resolve,
      handlers,
      onRunning,
      started: performance.now(),
      remaining: 30000,
      phaseStart: performance.now(),
      input: null,
      output: "",
      timer: setTimeout(
        () => resetRuntime("Python 套件準備超過 90 秒，請檢查網路後再試。"),
        90000,
      ),
    };
    worker!.postMessage({
      type: mode,
      id,
      code,
      filename,
      stdinLines: handlers.stdinLines,
    } satisfies WorkerRequest);
  });
}
export function submitInput(id: string, value: string | null) {
  if (!run || run.input !== id) return false;
  run.input = null;
  run.handlers.onInput?.(null);
  armTimeout();
  worker!.postMessage({
    type: "input",
    inputId: id,
    value,
  } satisfies WorkerRequest);
  return true;
}
export function resetRuntime(message = "程式已停止，執行環境已重設。") {
  clearTimeout(initTimer);
  worker?.terminate();
  worker = null;
  ready = null;
  starting = null;
  const error = new Error(message);
  for (const pending of requests.values()) pending.reject(error);
  requests.clear();
  if (run) {
    clearTimeout(run.timer);
    run.handlers.onInput?.(null);
    run.resolve({
      text: run.output,
      error: message,
      reset: true,
      duration: performance.now() - run.started,
    });
    run = null;
  }
}
