"use client";

import { useState, type FormEvent } from "react";
import { messages } from "./messages.js";

export type LoginFormProps = {
  /** Where to go after a successful login. Only same-site paths are accepted. Defaults to `/`. */
  redirectTo?: string;
  /** Base path of the Stilus route handlers. Defaults to `/api/stilus`. */
  apiBase?: string;
};

function safePath(path: string | undefined): string {
  return path && path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

/** Login form for editors. Posts to the site's own Stilus route, which sets the session cookies. */
export function LoginForm({ redirectTo, apiBase = "/api/stilus" }: LoginFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`${apiBase}/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      if (response.ok) {
        window.location.assign(safePath(redirectTo));
        return;
      }
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setErrorMessage(body?.error?.message ?? messages.genericError);
    } catch {
      setErrorMessage(messages.genericError);
    }
    setSubmitting(false);
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-label={messages.loginTitle}
      style={{ display: "grid", gap: 12, maxWidth: 360 }}
    >
      <h1>{messages.loginTitle}</h1>
      <label style={{ display: "grid", gap: 4 }}>
        {messages.email}
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label style={{ display: "grid", gap: 4 }}>
        {messages.password}
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      <button type="submit" disabled={submitting}>
        {submitting ? messages.submitting : messages.submit}
      </button>
    </form>
  );
}
