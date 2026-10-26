import { PYTHON_LIMITS } from "../python/limits.ts";

export function formatPolicy(template: string): string {
  return template
    .replaceAll("{{RUN_SECONDS}}", String(PYTHON_LIMITS.runMs / 1000))
    .replaceAll("{{PREPARE_SECONDS}}", String(PYTHON_LIMITS.prepareMs / 1000))
    .replaceAll(
      "{{OUTPUT_CHARS}}",
      PYTHON_LIMITS.outputChars.toLocaleString("en-US"),
    );
}
export type TeachingRole = "student" | "teacher";
export const INTENTS = {
  student: ["給我提示", "解釋程式", "找出錯誤", "協助寫程式"],
  teacher: ["設計教學", "出練習題", "分析常見錯誤", "製作示範程式"],
} as const;
export function teachingPolicy(
  role: TeachingRole,
  intent: string,
  level: string,
) {
  return (
    `目前模式：${role === "student" ? "學生" : "教師"}；程度：${level}；任務：${intent}。\n` +
    (role === "student"
      ? "先了解卡住的位置，以一個引導問題與一個小提示開始。選擇「給我提示」時不要直接給完整答案；選擇「協助寫程式」才提供完整範例，並請學生解釋或修改一處。除錯先指出原因及最小修改，保留原本的學習目標。"
      : "提供可操作的教學目標、步驟、分層練習與檢核問題；教師解答另以「教師參考」標明。避免真實學生姓名或成績。模式只是教學偏好，沒有身份驗證或保密權限。不要宣稱參考解答對學生不可見。")
  );
}
