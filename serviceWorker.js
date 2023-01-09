const cacheName = "boyo-blockly-py-0.2.3"
const assets = [
    "/pwa-scaffold.js",
    "/js/qrcode.js",
    "/js/py-worker.js",
    "/js/webworker.js",
    "/js/jsdom.js",
    "/js/download.min.js",
    "/js/indexfs.min.js",
    "/js/floatingui_core.js",
    "/js/floatingui_dom.js",
    "/js/popupcontainer.js",
    "/js/diff.min.js",
    "/js/peerjs.min.js",
    "/js/peer.js",
    "/peer.js",
    "/main.js",
    "/turtle/custom_turtle_for_Pyodide-1.0-py3-none-any.whl",
    "/pyscript/pyodideworker.py",

    "/pyodide/pyodide.js",
    "/pyodide/package.json",
    "/pyodide/repodata.json",
    "/pyodide/pyodide_py.tar",
    "/pyodide/pyodide.asm.js",
    "/pyodide/pyodide.asm.data",
    "/pyodide/pyodide.asm.wasm",
    "/pyodide/packaging-21.3-py3-none-any.whl",
    "/pyodide/micropip-0.1.0-py3-none-any.whl",
    "/pyodide/pyparsing-3.0.9-py3-none-any.whl",
    "/pyodide/numpy-1.22.4-cp310-cp310-emscripten_3_1_21_wasm32.whl",
    "/pyodide/future-0.18.2-py3-none-any.whl",
    "/pyodide/distutils-1.0.0.zip",

    "/images/icons/android-chrome-192x192.png",
    "/images/icons/android-chrome-512x512.png",
    "/images/icons/android-chrome-maskable-192x192.png",
    "/images/icons/android-chrome-maskable-512x512.png",
    "/images/icons/apple-touch-icon-120x120.png",
    "/images/icons/apple-touch-icon-152x152.png",
    "/images/icons/apple-touch-icon-180x180.png",
    "/images/icons/apple-touch-icon-60x60.png",
    "/images/icons/apple-touch-icon-76x76.png",
    "/images/icons/apple-touch-icon.png",
    "/images/icons/favicon-16x16.png",
    "/images/icons/favicon-32x32.png",
    "/images/icons/msapplication-icon-144x144.png",
    "/images/icons/mstile-150x150.png",
    "/images/icons/safari-pinned-tab.svg",

    "/css/milligram.min.css",
    "/css/site.css",
    "/blockly/blockly_compressed.js",
    "/blockly/blocks_compressed.js",
    "/blockly/python_compressed.js",
    "/blockly/msg/js/zh-hant.js",
    "/codemirror/codemirror.css",
    "/codemirror/fullscreen.css",
    "/codemirror/show-hint.css",
    "/codemirror/codemirror.js",
    "/codemirror/show-hint.js",
    "/codemirror/python-hint.js",
    "/codemirror/fullscreen.js",
    "/codemirror/python.js",
    "/blockmirror/block_mirror.css",
    "/blockmirror/skulpt_parser.js",
    "/blockmirror/block_mirror.js",
    "/icons/stylesheet.css",
    "/icons/icon-works-webfont.eot",
    "/icons/icon-works-webfont.svg",
    "/icons/icon-works-webfont.ttf",
    "/icons/icon-works-webfont.woff",
]

self.addEventListener("install", installEvent => {
    console.log("installing WebWorker")
    installEvent.waitUntil((async () => {
        const cache = await caches.open(cacheName);
        console.log('[Service Worker] Caching all: app shell and content');
        await cache.addAll(assets);
    })());
})

self.addEventListener('fetch', (e) => {
    if (e.request.url.match('^https://0\.peerjs\.com') ||
        e.request.url.match('^https://killkli\.ddns\.net')) {
        return false;
    }
    e.respondWith((async () => {
        const r = await caches.match(e.request);
        console.log(`[Service Worker] Fetching resource: ${e.request.url}`);
        if (r) { return r; }
        const response = await fetch(e.request);
        const cache = await caches.open(cacheName);
        console.log(`[Service Worker] Caching new resource: ${e.request.url}`);
        cache.put(e.request, response.clone());
        return response;
    })());
});

self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys().then((keyList) => {
        return Promise.all(keyList.map((key) => {
            if (key === cacheName) { return; }
            return caches.delete(key);
        }));
    }));
});

async function updateCache() {
    // 查找 SERVICE WORKER 的所有快取
    const cacheNames = await caches.keys();
    // 循環遍歷所有快取
    for (let cacheName of cacheNames) {
        // 查找快取中的所有項目
        const cache = await caches.open(cacheName);
        const requests = await cache.keys();

        // 循環遍歷快取中的所有項目
        for (let request of requests) {
            // 重新抓取快取項目的資源
            try {
                const response = await cache.match(request);
                const newResponse = await fetch(request);
                await cache.put(request, newResponse);
            } catch (e) {
                console.log(e)
            }
        }
    }
}

setInterval(updateCache, 1000 * 60 * 60 * 24);