import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";

// Native SMIL animates in a script-free sandbox. Do not re-mount the iframe
// on ordinary resizes, so enlarging a result preserves its animation timeline.
export function Graphics({ html }: { html: string }) {
  const [replay, setReplay] = useState(0);
  const { source, ratio } = useMemo(() => {
    const document = new DOMParser().parseFromString(html, "text/html");
    const svg = document.querySelector("svg");
    const viewBox = svg
      ?.getAttribute("viewBox")
      ?.trim()
      .split(/[\s,]+/)
      .map(Number);
    const width =
      viewBox?.[2] ?? parseFloat(svg?.getAttribute("width") ?? "500");
    const height =
      viewBox?.[3] ?? parseFloat(svg?.getAttribute("height") ?? "500");
    return {
      ratio: width > 0 && height > 0 ? width / height : 1,
      source: `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:"><style>html,body{margin:0;width:100%;background:white}body{font:14px monospace}svg{display:block;max-width:100%;height:auto;margin:auto}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`,
    };
  }, [html]);
  return (
    <section className="graphics" aria-label="繪圖結果">
      <div className="graphics-toolbar">
        <h3>繪圖結果</h3>
        <button
          onClick={() => setReplay((n) => n + 1)}
          aria-label="重播繪圖動畫"
        >
          <RotateCcw size={15} /> 重播動畫
        </button>
      </div>
      <iframe
        key={replay}
        title="Python 繪圖結果"
        sandbox=""
        className="graphics-output"
        style={{ aspectRatio: String(ratio) }}
        srcDoc={source}
      />
    </section>
  );
}
