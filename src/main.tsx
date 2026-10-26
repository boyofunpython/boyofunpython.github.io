import { createRoot } from "react-dom/client";
import App from "./App";
import "@fontsource-variable/dm-sans";
import "./styles.css";

const manifest = document.createElement("link");
manifest.rel = "manifest";
manifest.href = import.meta.env.BASE_URL + "manifest.json";
document.head.append(manifest);

// Retire the old cache-first worker so it cannot serve an obsolete app shell.
// The modern worker is intentionally network-first and only owns boyo caches.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(import.meta.env.BASE_URL + "serviceWorker.js")
      .catch(() => {
        /* App remains usable without offline caching. */
      });
  });
}
createRoot(document.getElementById("root")!).render(<App />);
