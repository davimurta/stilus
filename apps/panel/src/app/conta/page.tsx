import type { Metadata } from "next";
import { PanelHeader } from "@/components/header";
import { PasswordForm } from "@/components/password-form";
import { messages } from "@/lib/messages";
import { requirePanelUser } from "@/lib/panel-access";

export const metadata: Metadata = { title: messages.account.title };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AccountPage({ searchParams }: Props) {
  const user = await requirePanelUser();
  const changed = (await searchParams).senha === "trocada";
  return (
    <>
      <PanelHeader user={user} />
      <main className="stack">
        <h1>{messages.account.title}</h1>
        <p className="muted">
          {user.name} · {user.email}
        </p>
        {changed ? <p role="status">{messages.account.done}</p> : null}
        <PasswordForm />
      </main>
    </>
  );
}
