"use client";

import { useActionState } from "react";
import { changePassword, type PasswordState } from "@/app/conta/actions";
import { messages } from "@/lib/messages";

const initial: PasswordState = { status: "idle", message: null };

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, initial);
  const m = messages.account;
  return (
    <form action={action} className="stack narrow" aria-label={m.changePassword}>
      <h2>{m.changePassword}</h2>
      <label className="field">
        {m.current}
        <input name="current" type="password" autoComplete="current-password" required />
      </label>
      <label className="field">
        {m.next}
        <input name="next" type="password" autoComplete="new-password" minLength={12} required />
      </label>
      <label className="field">
        {m.confirm}
        <input name="confirm" type="password" autoComplete="new-password" minLength={12} required />
      </label>
      {state.message ? (
        <p role="status" className={state.status === "error" ? "error" : ""}>
          {state.message}
        </p>
      ) : null}
      <button type="submit" disabled={pending}>
        {pending ? m.submitting : m.submit}
      </button>
    </form>
  );
}
