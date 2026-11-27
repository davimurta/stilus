// Small, DOM-free helpers of the editor overlay (unit tested).

export const EDIT_FLAG = "stilus_edit";

/** True when the readable `stilus_edit=1` flag is set. It only turns the UI on. */
export function hasEditFlag(cookieString: string): boolean {
  return cookieString.split(";").some((part) => part.trim() === `${EDIT_FLAG}=1`);
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const UNDO_KEY = "stilus:undo";
const ENABLED_KEY = "stilus:enabled";
const FLASH_KEY = "stilus:flash";
const MAX_UNDO = 50;

/** Keys saved in this tab, most recent last. Survives the reload that follows each save. */
export function readUndoStack(storage: StorageLike): string[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(UNDO_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function pushUndo(storage: StorageLike, key: string): void {
  const stack = [...readUndoStack(storage), key].slice(-MAX_UNDO);
  storage.setItem(UNDO_KEY, JSON.stringify(stack));
}

export function popUndo(storage: StorageLike): string | undefined {
  const stack = readUndoStack(storage);
  const key = stack.pop();
  storage.setItem(UNDO_KEY, JSON.stringify(stack));
  return key;
}

export function clearEditState(storage: StorageLike): void {
  storage.removeItem(UNDO_KEY);
  storage.removeItem(ENABLED_KEY);
}

/** Editing is on by default once the editor is logged in. */
export function isEditingEnabled(storage: StorageLike): boolean {
  return storage.getItem(ENABLED_KEY) !== "0";
}

export function setEditingEnabled(storage: StorageLike, enabled: boolean): void {
  storage.setItem(ENABLED_KEY, enabled ? "1" : "0");
}

/** A status message to show again after the page reloads (e.g. "Salvo."). */
export function setFlash(storage: StorageLike, message: string): void {
  storage.setItem(FLASH_KEY, message);
}

export function takeFlash(storage: StorageLike): string | null {
  const message = storage.getItem(FLASH_KEY);
  storage.removeItem(FLASH_KEY);
  return message;
}

/** Normalizes what the browser gives back from a contentEditable element. */
export function normalizeEditedText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\n$/, "");
}
