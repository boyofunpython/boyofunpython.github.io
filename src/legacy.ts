/** Compatibility reads only: new editing/runtime code has no legacy globals. */
import localforage from "localforage";
export type EditorMode = "split" | "text" | "block";
export interface EditorApi {
  getCode(): string;
  setCode(code: string): void;
  focus(): void;
}
export function courseStore() {
  return localforage.createInstance({ name: "futurecoder" });
}
export async function oldFiles() {
  // Read the old indexeddb-fs records directly. Never initialize or rewrite the
  // old database merely by visiting the modern editor.
  if (
    indexedDB.databases &&
    !(await indexedDB.databases()).some(
      (database) => database.name === "indexeddb-fs",
    )
  )
    return [];
  return new Promise<{ id: string; name: string; code: string }[]>(
    (resolve, reject) => {
      const opening = indexedDB.open("indexeddb-fs");
      opening.onupgradeneeded = () => {
        opening.transaction?.abort();
        resolve([]);
      };
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const database = opening.result;
        if (!database.objectStoreNames.contains("files")) {
          database.close();
          resolve([]);
          return;
        }
        const transaction = database.transaction("files", "readonly");
        const request = transaction.objectStore("files").getAll();
        request.onsuccess = () =>
          resolve(
            request.result
              .filter(
                (record: {
                  name?: string;
                  directory?: string;
                  type?: string;
                  data?: unknown;
                }) =>
                  record.type === "file" &&
                  record.directory === "root" &&
                  record.name?.endsWith(".py") &&
                  typeof record.data === "string",
              )
              .map((record: { name: string; data: string }) => {
                let name = record.name;
                try {
                  name = decodeURIComponent(name);
                } catch {
                  /* Preserve original names. */
                }
                return { id: crypto.randomUUID(), name, code: record.data };
              }),
          );
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => database.close();
        transaction.onabort = () => {
          database.close();
          reject(transaction.error);
        };
      };
    },
  );
}
