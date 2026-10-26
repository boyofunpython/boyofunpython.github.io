export interface RunResult {
  text: string;
  html?: string;
  error?: string;
  duration: number;
  incomplete?: boolean;
  reset?: boolean;
}
export interface RuntimeInfo {
  python: string;
  pyodide: string;
  interactiveInput: boolean;
}
export interface InputRequest {
  id: string;
  prompt: string;
}
export interface VariableInfo {
  name: string;
  type: string;
  value: string;
}
export interface RunHandlers {
  onOutput?: (text: string, stream: "stdout" | "stderr") => void;
  onInput?: (request: InputRequest | null) => void;
  stdinLines?: string[];
}
export interface AstResult {
  state?: Record<string, unknown>;
  error?: string;
  line?: number;
}
export type WorkerRequest =
  | { id: number; type: "init"; base: string }
  | {
      id: number;
      type: "parse" | "run" | "console" | "complete";
      code: string;
      filename?: string;
      stdinLines?: string[];
    }
  | { id: number; type: "info" | "variables" }
  | { type: "input"; inputId: string; value: string | null };
