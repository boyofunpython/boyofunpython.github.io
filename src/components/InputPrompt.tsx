import { useEffect, useRef, useState } from "react";
import { CornerDownLeft } from "lucide-react";
import type { InputRequest } from "../runtime";

export function InputPrompt({
  request,
  onSubmit,
  onEOF,
}: {
  request: InputRequest;
  onSubmit(value: string): void;
  onEOF(): void;
}) {
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.scrollIntoView({ block: "nearest" });
  }, []);
  return (
    <form
      className="input-prompt"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
      }}
    >
      <label htmlFor="python-input">
        <span>Python 正在等待輸入</span>
        <strong>{request.prompt || "請輸入一行文字"}</strong>
      </label>
      <div>
        <input
          data-dialog-autofocus
          ref={input}
          id="python-input"
          aria-label="Python 互動輸入"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          maxLength={10000}
        />
        <button className="primary" type="submit">
          <CornerDownLeft size={16} /> 送出
        </button>
      </div>
      <button type="button" className="input-eof" onClick={onEOF}>
        結束輸入（EOF）
      </button>
    </form>
  );
}
