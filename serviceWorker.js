const CACHE = "boyo-studio-63780e7a07c8";
const PRECACHE = ["./","./assets/Editor-BuF71eYQ.js","./assets/apple-touch-icon-152x152-ByG8WrgY.png","./assets/classroom-peer-DiwMdWVe.js","./assets/dm-sans-latin-ext-wght-normal-BOFOeGcA.woff2","./assets/dm-sans-latin-wght-normal-Xz1IZZA0.woff2","./assets/favicon-32x32-JzmtfEEb.png","./assets/index-B7YZ4TLQ.css","./assets/index-DAXjRA17.js","./assets/peerjs-CfemTNxx.js","./assets/rolldown-runtime-COiEfhsA.js","./assets/worker-C5Le2eqG.js","./course/index.html","./images/icons/android-chrome-192x192.png","./images/icons/android-chrome-512x512.png","./images/icons/android-chrome-maskable-192x192.png","./images/icons/android-chrome-maskable-512x512.png","./images/icons/apple-touch-icon-120x120.png","./images/icons/apple-touch-icon-152x152.png","./images/icons/apple-touch-icon-180x180.png","./images/icons/apple-touch-icon-60x60.png","./images/icons/apple-touch-icon-76x76.png","./images/icons/apple-touch-icon.png","./images/icons/favicon-16x16.png","./images/icons/favicon-32x32.png","./images/icons/msapplication-icon-144x144.png","./images/icons/mstile-150x150.png","./images/icons/safari-pinned-tab.svg","./index.html","./lessons/FUTURECODER-LICENSE","./lessons/futurecoder-pages.json","./manifest.json","./python/ast_blocks.py","./python/boyo_turtle/LICENSE","./python/boyo_turtle/__init__.py","./python/boyo_turtle/myturtle.py","./python/boyo_turtle/svg.py","./python/studio_runtime.py","./third-party-licenses.json","./vendor/blockly/1x1.gif","./vendor/blockly/click.mp3","./vendor/blockly/delete-icon.svg","./vendor/blockly/delete.mp3","./vendor/blockly/disconnect.mp3","./vendor/blockly/drop.mp3","./vendor/blockly/dropdown-arrow.svg","./vendor/blockly/foldout-icon.svg","./vendor/blockly/handclosed.cur","./vendor/blockly/handdelete.cur","./vendor/blockly/handopen.cur","./vendor/blockly/pilcrow.png","./vendor/blockly/quote0.png","./vendor/blockly/quote1.png","./vendor/blockly/resize-handle.svg","./vendor/blockly/sprites.svg","./vendor/pyodide/pyodide-lock.json","./vendor/pyodide/pyodide.asm.mjs","./vendor/pyodide/pyodide.asm.wasm","./vendor/pyodide/pyodide.mjs","./vendor/pyodide/python_stdlib.zip","./versions.json"];
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE);
      await self.skipWaiting();
    })(),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (
          (key.startsWith("boyo-studio-") ||
            key.startsWith("boyo-blockly-py-")) &&
          key !== CACHE
        )
          await caches.delete(key);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const runtimePackage =
    url.origin === "https://cdn.jsdelivr.net" &&
    url.pathname.startsWith("/pyodide/v314.0.7/full/");
  if (
    request.method !== "GET" ||
    (url.origin !== location.origin && !runtimePackage)
  )
    return;
  event.respondWith(
    (async () => {
      let cache;
      try {
        cache = await caches.open(CACHE);
      } catch {
        /* Network remains usable without storage. */
      }
      const stableAsset = /\/(assets|vendor|python)\//.test(url.pathname);
      if ((stableAsset || runtimePackage) && cache) {
        const stored = await cache.match(request, { ignoreVary: true });
        if (stored) return stored;
      }
      try {
        const response = await fetch(request);
        if (response.ok && cache) {
          try {
            await cache.put(request, response.clone());
          } catch {
            /* Quota failures must not break successful fetches. */
          }
        }
        return response;
      } catch {
        return (
          (await cache?.match(request, { ignoreVary: true })) ??
          new Response("尚未下載此資源，請先連上網路。", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      }
    })(),
  );
});
