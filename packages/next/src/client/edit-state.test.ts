import { describe, expect, it } from "vitest";
import {
  clearEditState,
  hasEditFlag,
  isEditingEnabled,
  normalizeEditedText,
  popUndo,
  pushUndo,
  readUndoStack,
  setEditingEnabled,
  setFlash,
  takeFlash,
} from "./edit-state.js";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe("hasEditFlag", () => {
  it.each([
    ["stilus_edit=1", true],
    ["a=b; stilus_edit=1; c=d", true],
    ["", false],
    ["stilus_edit=0", false],
    ["stilus_edit=", false],
    ["xstilus_edit=1", false],
    ["stilus_edit=1x", false],
    ["stilus_session=abc", false],
  ])("%j → %s", (cookie, expected) => {
    expect(hasEditFlag(cookie)).toBe(expected);
  });
});

describe("undo stack", () => {
  it("pops keys in reverse order of saving", () => {
    const storage = memoryStorage();
    pushUndo(storage, "home.a");
    pushUndo(storage, "home.b");
    pushUndo(storage, "home.a");
    expect(popUndo(storage)).toBe("home.a");
    expect(popUndo(storage)).toBe("home.b");
    expect(popUndo(storage)).toBe("home.a");
    expect(popUndo(storage)).toBeUndefined();
  });

  it("keeps at most 50 entries", () => {
    const storage = memoryStorage();
    for (let index = 0; index < 60; index += 1) pushUndo(storage, `home.k${index}`);
    const stack = readUndoStack(storage);
    expect(stack).toHaveLength(50);
    expect(stack[0]).toBe("home.k10");
  });

  it("ignores corrupted storage", () => {
    const storage = memoryStorage();
    storage.setItem("stilus:undo", "{not json");
    expect(readUndoStack(storage)).toEqual([]);
    storage.setItem("stilus:undo", JSON.stringify(["home.a", 3, null]));
    expect(readUndoStack(storage)).toEqual(["home.a"]);
  });

  it("is cleared with the editing state on logout", () => {
    const storage = memoryStorage();
    pushUndo(storage, "home.a");
    setEditingEnabled(storage, false);
    clearEditState(storage);
    expect(readUndoStack(storage)).toEqual([]);
    expect(isEditingEnabled(storage)).toBe(true);
  });
});

describe("editing toggle", () => {
  it("is on by default and remembers when turned off", () => {
    const storage = memoryStorage();
    expect(isEditingEnabled(storage)).toBe(true);
    setEditingEnabled(storage, false);
    expect(isEditingEnabled(storage)).toBe(false);
    setEditingEnabled(storage, true);
    expect(isEditingEnabled(storage)).toBe(true);
  });
});

describe("normalizeEditedText", () => {
  it("normalizes line endings, non-breaking spaces and the trailing line break", () => {
    expect(normalizeEditedText("a\r\nb\u00a0c\n")).toBe("a\nb c");
  });

  it("keeps HTML-looking text as plain text", () => {
    expect(normalizeEditedText("<b>x</b>")).toBe("<b>x</b>");
  });
});

describe("flash message", () => {
  it("is shown once after the reload", () => {
    const storage = memoryStorage();
    expect(takeFlash(storage)).toBeNull();
    setFlash(storage, "Salvo.");
    expect(takeFlash(storage)).toBe("Salvo.");
    expect(takeFlash(storage)).toBeNull();
  });
});
