export const CLASSROOM_TIMEOUT = 20_000;
export const MAX_SHARED_CODE = 1_000_000;
export const MAX_INBOX = 20;
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
