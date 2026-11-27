// Editor overlay. Loaded on demand by the loader, only when the `stilus_edit=1` flag is set.
// Plain DOM on purpose: it edits server-rendered elements without touching React state, and the
// page reloads after every save so React never sees a DOM it did not render.
import {
  clearEditState,
  isEditingEnabled,
  normalizeEditedText,
  popUndo,
  pushUndo,
  readUndoStack,
  setEditingEnabled,
  setFlash,
  takeFlash,
} from "./edit-state.js";
import { messages } from "./messages.js";

const OVERLAY_ATTRIBUTE = "data-stilus-overlay";
const KEY_SELECTOR = "[data-stilus-key]";
const RELOAD_DELAY_MS = 400;

const STYLES = `
[${OVERLAY_ATTRIBUTE}="bar"] {
  position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 2147483647;
  display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-radius: 8px;
  background: #1d1d1f; color: #fff; font: 14px/1.4 system-ui, sans-serif;
  box-shadow: 0 4px 16px rgba(0,0,0,.25); max-width: calc(100vw - 32px);
}
[${OVERLAY_ATTRIBUTE}="bar"] button {
  font: inherit; color: inherit; background: #3a3a3c; border: 0; border-radius: 6px;
  padding: 4px 10px; cursor: pointer;
}
[${OVERLAY_ATTRIBUTE}="bar"] button:disabled { opacity: .5; cursor: default; }
[${OVERLAY_ATTRIBUTE}="bar"] button[aria-pressed="true"] { background: #2f7d5b; }
[${OVERLAY_ATTRIBUTE}="bar"] [role="status"] { min-width: 12em; }
[${OVERLAY_ATTRIBUTE}="bar"] [data-tone="error"] { color: #ff9f9f; }
html[data-stilus-editing] ${KEY_SELECTOR}:hover { outline: 2px dashed #2f7d5b; outline-offset: 2px; cursor: text; }
${KEY_SELECTOR}[data-stilus-active] { outline: 2px solid #2f7d5b; outline-offset: 2px; }
`;

type ApiAnswer = {
  value?: string;
  revalidated?: boolean;
  error?: { code?: string; message?: string };
};

export type OverlayOptions = { apiBase?: string };

let mounted = false;

export function mountOverlay({ apiBase = "/api/stilus" }: OverlayOptions = {}): void {
  if (mounted) return;
  mounted = true;

  const storage = window.sessionStorage;
  const root = document.documentElement;
  let active: { element: HTMLElement; key: string; original: string } | null = null;
  let busy = false;

  const style = document.createElement("style");
  style.setAttribute(OVERLAY_ATTRIBUTE, "style");
  style.textContent = STYLES;
  document.head.append(style);

  const bar = document.createElement("div");
  bar.setAttribute(OVERLAY_ATTRIBUTE, "bar");
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", messages.toolbarLabel);

  const toggle = button("", () => setEnabled(!isEditingEnabled(storage)));
  const status = document.createElement("span");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const undoButton = button(messages.undo, () => void undoLast());
  const logoutButton = button(messages.logout, () => void logout());
  bar.append(toggle, status, undoButton, logoutButton);
  document.body.append(bar);

  function button(label: string, onClick: () => void): HTMLButtonElement {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    element.addEventListener("click", onClick);
    return element;
  }

  function setStatus(text: string, tone: "info" | "error" = "info") {
    status.textContent = text;
    status.dataset.tone = tone;
  }

  function refreshControls() {
    const enabled = isEditingEnabled(storage);
    toggle.textContent = enabled ? messages.editOn : messages.editOff;
    toggle.setAttribute("aria-pressed", String(enabled));
    undoButton.disabled = busy || readUndoStack(storage).length === 0;
    logoutButton.disabled = busy;
    if (enabled) root.setAttribute("data-stilus-editing", "");
    else root.removeAttribute("data-stilus-editing");
  }

  function setEnabled(enabled: boolean) {
    if (!enabled && active) cancel();
    setEditingEnabled(storage, enabled);
    refreshControls();
    setStatus(enabled ? messages.idle : messages.idleOff);
  }

  async function call(
    path: string,
    body: unknown,
  ): Promise<{ ok: boolean; status: number; data: ApiAnswer }> {
    const response = await fetch(`${apiBase}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
    const data = (await response.json().catch(() => ({}))) as ApiAnswer;
    return { ok: response.ok, status: response.status, data };
  }

  /** Reloads so the page shows the server HTML with the new text; the message survives it. */
  function reloadWith(message: string) {
    setStatus(message);
    setFlash(storage, message);
    window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
  }

  function start(element: HTMLElement) {
    const key = element.getAttribute("data-stilus-key");
    if (!key) return;
    active = { element, key, original: element.textContent ?? "" };
    element.setAttribute("data-stilus-active", "");
    try {
      element.contentEditable = "plaintext-only";
    } catch {
      element.contentEditable = "true";
    }
    element.spellcheck = true;
    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    setStatus(messages.editing);
  }

  function finish() {
    if (!active) return;
    active.element.removeAttribute("contenteditable");
    active.element.removeAttribute("data-stilus-active");
    active = null;
  }

  function cancel() {
    if (!active) return;
    active.element.textContent = active.original;
    finish();
    setStatus(messages.idle);
  }

  async function save() {
    if (!active || busy) return;
    const { element, key, original } = active;
    const value = normalizeEditedText(element.innerText);
    if (value === original) {
      finish();
      setStatus(messages.idle);
      return;
    }

    busy = true;
    refreshControls();
    setStatus(messages.saving);
    try {
      const result = await call("save", { key, value });
      if (!result.ok) {
        // Keep the element in edit mode so the editor can fix it (e.g. too long).
        setStatus(result.data.error?.message ?? messages.saveError, "error");
        if (result.status === 401) window.location.reload();
        return;
      }
      finish();
      pushUndo(storage, key);
      if (result.data.revalidated === false) {
        setStatus(messages.savedPending);
        return;
      }
      reloadWith(messages.saved);
    } catch {
      setStatus(messages.saveError, "error");
    } finally {
      busy = false;
      refreshControls();
    }
  }

  async function undoLast() {
    if (busy) return;
    if (active) cancel();
    const key = popUndo(storage);
    if (!key) {
      setStatus(messages.nothingToUndo);
      refreshControls();
      return;
    }
    busy = true;
    refreshControls();
    setStatus(messages.undoing);
    try {
      const result = await call("undo", { key });
      if (!result.ok) {
        setStatus(result.data.error?.message ?? messages.saveError, "error");
        return;
      }
      if (result.data.revalidated === false) setStatus(messages.savedPending);
      else reloadWith(messages.undone);
    } catch {
      pushUndo(storage, key);
      setStatus(messages.saveError, "error");
    } finally {
      busy = false;
      refreshControls();
    }
  }

  async function logout() {
    busy = true;
    refreshControls();
    try {
      await call("logout", {});
    } finally {
      clearEditState(storage);
      window.location.reload();
    }
  }

  // Capture phase: in edit mode a click on a link or button edits it instead of navigating.
  document.addEventListener(
    "click",
    (event) => {
      if (!isEditingEnabled(storage) || !(event.target instanceof Element)) return;
      if (bar.contains(event.target)) return;
      const element = event.target.closest<HTMLElement>(KEY_SELECTOR);
      if (!element) return;
      event.preventDefault();
      event.stopPropagation();
      if (active?.element === element) return;
      if (active) void save();
      if (!busy) start(element);
    },
    true,
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (!active || event.target !== active.element) return;
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      } else if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void save();
      }
    },
    true,
  );

  document.addEventListener(
    "focusout",
    (event) => {
      if (active && event.target === active.element) void save();
    },
    true,
  );

  // Inside editable text, a pasted value must stay plain text (no markup from the clipboard).
  document.addEventListener(
    "paste",
    (event) => {
      if (!active || event.target !== active.element) return;
      event.preventDefault();
      const text = event.clipboardData?.getData("text/plain") ?? "";
      const selection = window.getSelection();
      if (!selection?.rangeCount) return;
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
    },
    true,
  );

  refreshControls();
  setStatus(takeFlash(storage) ?? (isEditingEnabled(storage) ? messages.idle : messages.idleOff));
}
