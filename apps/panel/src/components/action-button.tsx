"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/sites/[siteId]/actions";

type Props = {
  action: (previous: ActionState, form: FormData) => Promise<ActionState>;
  label: string;
  pendingLabel?: string;
  hidden?: Record<string, string>;
  className?: string;
};

const initial: ActionState = { status: "idle", message: null };

/** A one-button form for a Server Action, with its result message next to it. */
export function ActionButton({ action, label, pendingLabel, hidden = {}, className }: Props) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="inline-action">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" disabled={pending} className={className}>
        {pending && pendingLabel ? pendingLabel : label}
      </button>
      {state.message ? (
        <span role="status" className={state.status === "error" ? "error" : "muted"}>
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
