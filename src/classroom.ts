export const CLASSROOM_TIMEOUT = 20_000;
export const MAX_SHARED_CODE = 1_000_000;
export const MAX_INBOX = 20;
export const MAX_CLASSROOM_TEXT = 2000;
export const MAX_CLASSROOM_HISTORY = 100;
export type ClassroomRole = "teacher" | "student";
export type CodePacket = {
  type: "teacherInfo" | "code";
  code: string;
  id?: string;
  filename: string;
  question: string;
};
export type ClassroomPacket =
  | CodePacket
  | { type: "message"; id: string; text: string }
  | { type: "feedback"; id: string; submissionId: string; text: string }
  | { type: "receipt"; submissionId: string };
export interface ClassroomActivity {
  id: string;
  kind: "message" | "feedback";
  text: string;
  author: string;
  outgoing: boolean;
  unread: boolean;
  at: number;
  filename?: string;
}
export interface ClassroomCode {
  key: string;
  submissionId?: string;
  code: string;
  name: string;
  filename: string;
  question: string;
  at: number;
  unread: boolean;
  fromStudent: boolean;
  peerId: string;
  session: number;
  feedback?: string;
}
export interface SentSubmission {
  id: string;
  code: string;
  filename: string;
  question: string;
  at: number;
  state: "sent" | "received" | "reviewed";
  feedback?: string;
}
export function classroomFilename(
  value: unknown,
  fallback = "main.py",
): string {
  return typeof value === "string" &&
    /^[^/\\\x00-\x1f]{1,120}\.py$/.test(value.trim())
    ? value.trim()
    : fallback;
}
export function readClassroomPacket(
  raw: unknown,
  role: ClassroomRole,
): ClassroomPacket | null {
  if (!raw || typeof raw !== "object" || !("type" in raw)) return null;
  const data = raw as Record<string, unknown>;
  const validId = (id: unknown): id is string =>
    typeof id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
  const text = (value: unknown): value is string =>
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= MAX_CLASSROOM_TEXT;
  if (data.type === "message" && validId(data.id) && text(data.text))
    return { type: "message", id: data.id, text: data.text.trim() };
  if (
    role === "student" &&
    data.type === "feedback" &&
    validId(data.id) &&
    validId(data.submissionId) &&
    text(data.text)
  )
    return {
      type: "feedback",
      id: data.id,
      submissionId: data.submissionId,
      text: data.text.trim(),
    };
  if (
    role === "student" &&
    data.type === "receipt" &&
    validId(data.submissionId)
  )
    return { type: "receipt", submissionId: data.submissionId };
  if (
    data.type === (role === "teacher" ? "code" : "teacherInfo") &&
    typeof data.code === "string" &&
    data.code.length <= MAX_SHARED_CODE &&
    (data.id === undefined || validId(data.id)) &&
    (data.question === undefined ||
      (typeof data.question === "string" &&
        data.question.length <= MAX_CLASSROOM_TEXT))
  ) {
    return {
      type: data.type as CodePacket["type"],
      code: data.code,
      id: data.id as string | undefined,
      filename: classroomFilename(
        data.filename,
        role === "teacher" ? "FromStudent.py" : "FromTeacher.py",
      ),
      question: typeof data.question === "string" ? data.question : "",
    };
  }
  return null;
}
export function classroomShareURL(id: string, pageURL: string): string {
  const page = new URL(pageURL);
  // Share only the room ID, not unrelated query parameters from the teacher URL.
  page.search = "";
  page.searchParams.set("peer", id);
  page.hash = "/classroom";
  return page.href;
}
export function classroomName(metadata: unknown): string {
  if (
    metadata &&
    typeof metadata === "object" &&
    "name" in metadata &&
    typeof metadata.name === "string"
  )
    return metadata.name.trim().slice(0, 40) || "同學";
  return "同學";
}
