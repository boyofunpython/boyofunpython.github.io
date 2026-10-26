import { cp, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
// Keep the bundled Python distribution and existing course available without
// asking the bundler to transform third-party classic scripts or WASM files.
for (const path of [
  "blockly",
  "blockmirror",
  "codemirror",
  "pyodide",
  "pyscript",
  "python",
  "turtle",
  "course",
  "images",
  "js",
  "manifest.json",
  "serviceWorker.js",
]) {
  await cp(path, `dist/${path}`, { recursive: true });
}
const editorAssets = [
  "js/diff.min.js",
  "blockly/blockly_compressed.js",
  "blockly/blocks_compressed.js",
  "blockly/python_compressed.js",
  "blockly/msg/js/zh-hant.js",
  "codemirror/codemirror.js",
  "codemirror/codemirror.css",
  "codemirror/show-hint.js",
  "codemirror/show-hint.css",
  "codemirror/python-hint.js",
  "codemirror/python.js",
  "blockmirror/skulpt_parser.js",
  "blockmirror/block_mirror.js",
  "blockmirror/block_mirror.css",
  "js/indexfs.min.js",
  "js/localforge.js",
];
const assets = (await readdir("dist/assets")).map((file) => "assets/" + file);
const precache = [
  "./",
  "./manifest.json",
  ...[...editorAssets, ...assets].map((file) => "./" + file),
];
// A version derived from the complete modern app makes cache activation and
// changes to unbundled runtime adapters deterministic across releases.
const hash = createHash("sha256");
for (const file of [
  "index.html",
  "manifest.json",
  "serviceWorker.js",
  "js/studio-worker.js",
  "python/studio_runtime.py",
  ...assets,
])
  hash.update(await readFile("dist/" + file));
let worker = await readFile("serviceWorker.js", "utf8");
worker = worker.replace(
  /const PRECACHE = \[[\s\S]*?\];/,
  "const PRECACHE = " + JSON.stringify(precache) + ";",
);
worker = worker.replace(
  /["']boyo-studio-v1["']/,
  `'boyo-studio-${hash.digest("hex").slice(0, 12)}'`,
);
await writeFile("dist/serviceWorker.js", worker);
