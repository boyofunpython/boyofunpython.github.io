import { formatPolicy } from "../src/ai/policy.ts";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
const directory = new URL("../public/vendor/", import.meta.url);
// These ignored directories contain only this script's generated output.
await rm(directory, { recursive: true, force: true });
await rm(new URL("../public/python/", import.meta.url), {
  recursive: true,
  force: true,
});
await mkdir(directory, { recursive: true });
for (const file of [
  "pyodide.mjs",
  "pyodide.asm.mjs",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json",
]) {
  await cp(
    new URL("../node_modules/pyodide/" + file, import.meta.url),
    new URL("pyodide/" + file, directory),
    { recursive: true },
  );
}
await cp(
  new URL("../node_modules/blockly/media/", import.meta.url),
  new URL("blockly/", directory),
  { recursive: true },
);
for (const file of ["studio_runtime.py", "ast_blocks.py", "boyo_turtle"])
  await cp(
    new URL("../python/" + file, import.meta.url),
    new URL("../public/python/" + file, import.meta.url),
    { recursive: true, filter: (source) => !source.includes("__pycache__") },
  );
await cp(
  new URL("../manifest.json", import.meta.url),
  new URL("../public/manifest.json", import.meta.url),
);
await cp(
  new URL("../images/icons/", import.meta.url),
  new URL("../public/images/icons/", import.meta.url),
  { recursive: true },
);
const pkg = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const versions = {
  application: pkg.version,
  dependencies: pkg.dependencies,
  node: pkg.engines.node,
  checked: "2026-10-26",
};
await writeFile(
  new URL("../public/versions.json", import.meta.url),
  JSON.stringify(versions, null, 2) + "\n",
);
const lock = JSON.parse(
  await readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
);
const notices = [];
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path || entry.dev) continue;
  const root = new URL("../" + path + "/", import.meta.url);
  let metadata;
  try {
    metadata = JSON.parse(
      await readFile(new URL("package.json", root), "utf8"),
    );
  } catch {
    continue;
  } // Optional platform packages may not be installed.
  const texts = {};
  for (const name of await readdir(root))
    if (/^(licen[cs]e|copying|notice|ofl)(\.|$)/i.test(name)) {
      try {
        texts[name] = await readFile(new URL(name, root), "utf8");
      } catch {
        /* Some packages use a directory of licenses. */
      }
    }
  notices.push({
    name: metadata.name,
    version: metadata.version,
    license: metadata.license,
    repository: metadata.repository,
    texts,
  });
}
await writeFile(
  new URL("../public/third-party-licenses.json", import.meta.url),
  JSON.stringify(notices, null, 2) + "\n",
);

await mkdir(new URL("../public/ai/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../public/ai/python-system.txt", import.meta.url),
  formatPolicy(
    await readFile(
      new URL("../src/ai/python-system.txt", import.meta.url),
      "utf8",
    ),
  ),
);
