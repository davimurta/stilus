import { Text } from "@stilus/next";
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container">
        <Text as={Link} href="/" className="brand" k="layout.header.brand">
          Oficina Exemplo
        </Text>
        <nav aria-label="Principal">
          <Text as={Link} href="/" k="layout.nav.home">
            Início
          </Text>
          <Text as={Link} href="/sobre" k="layout.nav.about">
            Sobre
          </Text>
          <Text as={Link} href="/contato" k="layout.nav.contact">
            Contato
          </Text>
        </nav>
      </div>
    </header>
  );
}
