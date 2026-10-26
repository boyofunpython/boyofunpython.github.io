// This list is augmented with content-hashed build assets by copy-static.mjs.
const PRECACHE = ["./", "./manifest.json"];
const CACHE = "boyo-studio-v1";
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE);
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (
          (key.startsWith("boyo-blockly-py-") ||
            key.startsWith("boyo-studio-")) &&
          key !== CACHE
        )
          await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.includes("/course/")
  )
    return;
  event.respondWith(
    (async () => {
      let cache;
      try {
        cache = await caches.open(CACHE);
      } catch {
        /* Storage can be unavailable. */
      }
      const immutable =
        /\/(assets|pyodide|blockly|blockmirror|codemirror)\//.test(
          url.pathname,
        );
      if (immutable && cache) {
        const cached = await cache.match(request, { ignoreVary: true });
        if (cached) return cached;
      }
      try {
        const response = await fetch(request);
        // Cache quota failures must never turn a successful network fetch into
        // a broken response (the bundled Python packages can be large).
        if (cache && response.ok && response.type === "basic") {
          try {
            await cache.put(request, response.clone());
          } catch {
            /* Keep the network response. */
          }
        }
        return response;
      } catch {
        const cached = await cache?.match(request, { ignoreVary: true });
        if (cached) return cached;
        return new Response("離線時無法載入此資源，請連上網路後再試。", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    })(),
  );
});
