const CACHE = "boyo-studio-__CACHE_VERSION__";
const PRECACHE = __PRECACHE__;
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
    request.cache === "no-store" ||
    request.headers.has("Authorization") ||
    request.headers.has("x-goog-api-key") ||
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
