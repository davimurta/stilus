"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/app/sites/[siteId]/actions";
import { messages } from "@/lib/messages";

type Props = {
  action: (previous: ActionState, form: FormData) => Promise<ActionState>;
  value: string;
  kind: "line" | "multiline";
  maxLength: number | null;
};

const initial: ActionState = { status: "idle", message: null };

/** Characters as people count them (code points), like the API does. */
const length = (value: string) => [...value].length;

export function TextEditor({ action, value, kind, maxLength }: Props) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [draft, setDraft] = useState(value);
  // When the server value changes (save, restore), show it without losing the status message.
  const [serverValue, setServerValue] = useState(value);
  if (value !== serverValue) {
    setServerValue(value);
    setDraft(value);
  }
  const over = maxLength !== null && length(draft) > maxLength;

  return (
    <form action={formAction} className="stack" aria-label={messages.text.current}>
      <label className="field">
        {messages.text.current}
        {kind === "multiline" ? (
          <textarea
            name="value"
            rows={5}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        ) : (
          <input name="value" value={draft} onChange={(e) => setDraft(e.target.value)} />
        )}
      </label>
      <p className={over ? "error" : "muted"} aria-live="polite">
        {over && maxLength !== null
          ? messages.text.overLimit(maxLength)
          : messages.text.counter(length(draft), maxLength)}
      </p>
      <div>
        <button type="submit" disabled={pending || over}>
          {pending ? messages.text.saving : messages.text.save}
        </button>
      </div>
      {state.message ? (
        <p role="status" className={state.status === "error" ? "error" : ""}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
