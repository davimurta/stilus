import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getPanelUser } from "@/lib/auth";
import { messages } from "@/lib/messages";

export const metadata: Metadata = { title: messages.login.title };

export default async function LoginPage() {
  if (await getPanelUser()) redirect("/sites");
  return (
    <main>
      <LoginForm />
    </main>
  );
}
