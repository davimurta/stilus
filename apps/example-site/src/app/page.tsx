import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  // The layout's title.template only applies to child segments, not to this root page.
  title: { absolute: "Início | Oficina Exemplo" },
  description: "Consertos e manutenção com atendimento rápido e preço justo.",
};

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <h1>Consertos rápidos, feitos com cuidado</h1>
        <p className="lead">
          Há mais de 20 anos cuidando dos equipamentos da sua casa e da sua empresa.
        </p>
        <Link href="/contato" className="button">
          Peça um orçamento
        </Link>
      </section>

      <ul className="features">
        <li>
          <h2>Atendimento no mesmo dia</h2>
          <p>Chamados abertos até as 14h são atendidos no mesmo dia útil.</p>
        </li>
        <li>
          <h2>Garantia de 90 dias</h2>
          <p>Todo serviço tem garantia por escrito, sem letras miúdas.</p>
        </li>
        <li>
          <h2>Orçamento sem custo</h2>
          <p>Você só paga se aprovar o serviço.</p>
        </li>
      </ul>
    </>
  );
}
