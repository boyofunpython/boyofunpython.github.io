import { createHash } from "node:crypto";
import { readdir, readFile, writeFile, mkdir, cp } from "node:fs/promises";
import path from "node:path";
async function files(directory) {
  const output = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const name = path.join(directory, item.name);
    output.push(...(item.isDirectory() ? await files(name) : [name]));
  }
  return output;
}
const paths = (await files("dist")).map((name) => name.replace(/^dist\//, ""));
const hash = createHash("sha256");
for (const name of paths) hash.update(await readFile("dist/" + name));
const version = hash.digest("hex").slice(0, 12);
const precache = [
  "./",
  ...paths.filter((name) => !name.endsWith(".map")).map((name) => "./" + name),
];
const source = await readFile("src/sw-template.js", "utf8");
await writeFile(
  "dist/serviceWorker.js",
  source
    .replace("__CACHE_VERSION__", version)
    .replace("__PRECACHE__", JSON.stringify(precache)),
);
