import { LoginForm } from "@stilus/next/client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Entrar para editar",
  robots: { index: false, follow: false },
};

export default function EditLoginPage() {
  return <LoginForm />;
}
