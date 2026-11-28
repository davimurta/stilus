import { Text, t } from "@davimurta/stilus-next";
import type { Metadata } from "next";
import Link from "next/link";

export async function generateMetadata(): Promise<Metadata> {
  return {
    // The layout's title.template only applies to child segments, not to this root page.
    title: { absolute: await t("home.meta.title", "Início | Oficina Exemplo") },
    description: await t(
      "home.meta.description",
      "Consertos e manutenção com atendimento rápido e preço justo.",
    ),
  };
}

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <Text as="h1" k="home.hero.title" description="Título principal">
          Consertos rápidos, feitos com cuidado
        </Text>
        <Text as="p" className="lead" multiline k="home.hero.lead">
          Há mais de 20 anos cuidando dos equipamentos da sua casa e da sua empresa.
        </Text>
        <Text as={Link} href="/contato" className="button" k="home.hero.cta">
          Peça um orçamento
        </Text>
      </section>

      <ul className="features">
        <li>
          <Text as="h2" k="home.features.same-day.title">
            Atendimento no mesmo dia
          </Text>
          <Text as="p" multiline k="home.features.same-day.body">
            Chamados abertos até as 14h são atendidos no mesmo dia útil.
          </Text>
        </li>
        <li>
          <Text as="h2" k="home.features.warranty.title">
            Garantia de 90 dias
          </Text>
          <Text as="p" multiline k="home.features.warranty.body">
            Todo serviço tem garantia por escrito, sem letras miúdas.
          </Text>
        </li>
        <li>
          <Text as="h2" k="home.features.free-quote.title">
            Orçamento sem custo
          </Text>
          <Text as="p" multiline k="home.features.free-quote.body">
            Você só paga se aprovar o serviço.
          </Text>
        </li>
      </ul>
    </>
  );
}
