import { courseStore, oldFiles } from "./legacy";
export interface CodeFile {
  id: string;
  name: string;
  code: string;
}
export interface Workspace {
  files: CodeFile[];
  activeId: string;
}
export const STORAGE_KEY = "boyo-studio-v1";
export const starter =
  '# 我的第一支 Python 程式\n# 按下「執行程式」，看看會發生什麼事！\n\nprint("哈囉，世界！")\n\nname = "小小探險家"\nprint("歡迎來到 Python 練習室，" + name)\n';
export async function readWorkspace(): Promise<Workspace> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const data = JSON.parse(raw) as Workspace;
    if (
      !Array.isArray(data.files) ||
      !data.files.length ||
      !data.files.every(
        (f) =>
          typeof f.id === "string" &&
          typeof f.name === "string" &&
          typeof f.code === "string",
      ) ||
      new Set(data.files.map((f) => f.id)).size !== data.files.length
    ) {
      throw new Error(
        "儲存的檔案格式無法讀取。請先備份瀏覽器資料，再重新整理。",
      );
    }
    return {
      files: data.files,
      activeId: data.files.some((f) => f.id === data.activeId)
        ? data.activeId
        : data.files[0].id,
    };
  }
  // Migrate the previous editor without overwriting main.py on every visit.
  let files: CodeFile[] = [];
  try {
    files = await oldFiles();
  } catch {
    /* A new browser has no legacy directory. */
  }
  if (!files.length) {
    let code = starter;
    try {
      code =
        (await (await courseStore()).getItem("user"))?.editorContent ?? starter;
    } catch {
      /* New workspace. */
    }
    files = [{ id: crypto.randomUUID(), name: "main.py", code }];
  }
  return { files, activeId: files[0].id };
}
export function saveWorkspace(workspace: Workspace) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
}
export function fileNameError(
  name: string,
  files: CodeFile[],
  exclude?: string,
) {
  if (!name.trim() || !name.endsWith(".py") || /[/\\\x00-\x1f]/.test(name))
    return "請輸入以 .py 結尾的檔名，不可包含斜線。";
  if (files.some((f) => f.id !== exclude && f.name === name))
    return "這個檔名已經存在，請換一個名稱。";
  return "";
}
