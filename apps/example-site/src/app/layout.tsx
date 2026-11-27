import { StilusLoader } from "@stilus/next/loader";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Oficina Exemplo",
    template: "%s | Oficina Exemplo",
  },
  description: "Site de demonstração usado para desenvolver e testar o Stilus.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <SiteHeader />
        <main className="container">{children}</main>
        <SiteFooter />
        <StilusLoader />
      </body>
    </html>
  );
}
