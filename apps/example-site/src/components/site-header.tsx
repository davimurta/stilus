import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container">
        <Link href="/" className="brand">
          Oficina Exemplo
        </Link>
        <nav aria-label="Principal">
          <Link href="/">Início</Link>
          <Link href="/sobre">Sobre</Link>
          <Link href="/contato">Contato</Link>
        </nav>
      </div>
    </header>
  );
}
