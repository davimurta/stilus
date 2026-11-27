"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/actions";
import { messages } from "@/lib/messages";

const initial: LoginState = { error: null };

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initial);
  return (
    <form action={action} className="stack narrow" aria-label={messages.login.title}>
      <h1>{messages.login.title}</h1>
      <label className="field">
        {messages.login.email}
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label className="field">
        {messages.login.password}
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state.error ? (
        <p role="alert" className="error">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending}>
        {pending ? messages.login.submitting : messages.login.submit}
      </button>
    </form>
  );
}
