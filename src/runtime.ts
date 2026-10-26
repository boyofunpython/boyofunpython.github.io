export interface RunResult {
  text: string;
  html?: string;
  error?: string;
  duration: number;
}
let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let rejectReady: ((reason: Error) => void) | null = null;
let pending: { resolve: (value: RunResult) => void; started: number } | null =
  null;
let timer: ReturnType<typeof setTimeout> | undefined;
function startWorker() {
  worker = new Worker(import.meta.env.BASE_URL + "js/studio-worker.js");
  ready = new Promise((resolve, reject) => {
    rejectReady = reject;
    timer = setTimeout(
      () => resetRuntime("Python 載入逾時，請檢查網路後再試一次。"),
      90000,
    );
    worker!.onmessage = ({ data }) => {
      if (data.type === "ready") {
        clearTimeout(timer);
        rejectReady = null;
        resolve();
      }
      if (data.type === "init-error")
        resetRuntime("Python 載入失敗：" + data.error);
      if (data.type === "result" && pending) {
        clearTimeout(timer);
        pending.resolve({
          ...data,
          duration: performance.now() - pending.started,
        });
        pending = null;
      }
    };
    worker!.onerror = () =>
      resetRuntime("Python 載入失敗，請重新整理或稍後再試。");
  });
}
export async function runPython(
  code: string,
  onRunning: () => void,
): Promise<RunResult> {
  if (!worker) startWorker();
  try {
    await ready;
  } catch (error) {
    return { text: "", error: (error as Error).message, duration: 0 };
  }
  onRunning();
  return new Promise((resolve) => {
    pending = { resolve, started: performance.now() };
    timer = setTimeout(
      () => resetRuntime("執行超過 30 秒，已停止。請檢查迴圈後再試一次。"),
      30000,
    );
    worker!.postMessage({ type: "run", code });
  });
}
export function resetRuntime(message = "程式已停止。") {
  clearTimeout(timer);
  worker?.terminate();
  worker = null;
  ready = null;
  rejectReady?.(new Error(message));
  rejectReady = null;
  pending?.resolve({
    text: "",
    error: message,
    duration: performance.now() - pending.started,
  });
  pending = null;
}
