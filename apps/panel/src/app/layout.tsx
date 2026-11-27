import type { Metadata } from "next";
import type { ReactNode } from "react";
import { messages } from "@/lib/messages";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: messages.appTitle, template: `%s | ${messages.appTitle}` },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
