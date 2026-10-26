/* Classic worker: the vendored Pyodide distribution uses importScripts. */
importScripts("../pyodide/pyodide.js", "./jsdom.js");
const dom = new jsdom.JSDOM();
self.document = dom.window.document;
self.HTMLElement = dom.window.HTMLElement;
self.customElements = dom.window.customElements;
self.DOMParser = dom.window.DOMParser;
self.sharedCanvas = { canvas: null };
// Retain the original remote CSV/data helper used by existing lessons.
self.loadFile = (path, arraybuffer = false) => {
  const request = new XMLHttpRequest();
  if (arraybuffer) request.responseType = "arraybuffer";
  request.open(
    "GET",
    new URL(path, "https://boyofunpython.ddns.net:8787/"),
    false,
  );
  request.send();
  if (request.status !== 200) throw new Error("無法讀取檔案：" + path);
  return arraybuffer ? request.response : request.responseText;
};
const output = document.createElement("div");
output.id = "result";
document.body.append(output);
let text = "";
self.studioWrite = (chunk) => {
  if (text.length + chunk.length > 100000)
    throw new Error("輸出超過 100,000 字元，請減少列印次數。");
  text += chunk;
};
const ready = (async () => {
  self.pyodide = await loadPyodide({
    indexURL: new URL("../pyodide/", self.location.href).href,
  });
  const helpers = await fetch(
    new URL("../pyscript/pyodideworker.py", self.location.href),
  );
  if (!helpers.ok) throw new Error("無法載入 Python 輔助程式");
  await pyodide.runPythonAsync(await helpers.text());
  await pyodide.loadPackage("micropip");
  const micropip = pyodide.pyimport("micropip");
  try {
    await micropip.install(
      new URL(
        "../turtle/custom_turtle_for_Pyodide-1.0-py3-none-any.whl",
        self.location.href,
      ).href,
    );
  } finally {
    micropip.destroy();
  }
  const adapter = await fetch(
    new URL("../python/studio_runtime.py", self.location.href),
  );
  if (!adapter.ok) throw new Error("無法載入繪圖輔助程式");
  await pyodide.runPythonAsync(await adapter.text());
  self.postMessage({ type: "ready" });
})();
ready.catch((error) =>
  self.postMessage({ type: "init-error", error: String(error) }),
);
self.onmessage = async ({ data }) => {
  if (data.type !== "run") return;
  try {
    await ready;
    text = "";
    output.innerHTML = "";
    await pyodide.runPythonAsync("myturtle.restart()");
    await pyodide.loadPackagesFromImports(data.code);
    const result = await pyodide.runPythonAsync(data.code);
    if (result !== undefined && result !== null) {
      const value = String(result);
      if (/^\s*<svg[\s>]/.test(value)) output.innerHTML += value;
      else text += value;
      if (typeof result.destroy === "function") result.destroy();
    }
    self.postMessage({
      type: "result",
      text,
      html: output.innerHTML,
    });
  } catch (error) {
    self.postMessage({
      type: "result",
      text,
      html: output.innerHTML,
      error: error.message || String(error),
    });
  }
};
