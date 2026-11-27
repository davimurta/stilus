import { Text, t } from "@stilus/next";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: await t("about.meta.title", "Sobre"),
    description: await t(
      "about.meta.description",
      "Conheça a história e a equipe da Oficina Exemplo.",
    ),
  };
}

export default function AboutPage() {
  return (
    <article>
      <Text as="h1" k="about.title">
        Sobre a Oficina Exemplo
      </Text>
      <Text as="p" className="lead" multiline k="about.lead">
        Uma empresa familiar que cresceu consertando o que outros descartam.
      </Text>

      <Text as="h2" k="about.history.title">
        Nossa história
      </Text>
      <Text as="p" multiline k="about.history.body">
        Começamos em uma garagem, em 2004, com uma bancada e muita vontade de resolver problemas.
        Hoje atendemos centenas de clientes por mês, sem perder o cuidado do primeiro dia.
      </Text>

      <Text as="h2" k="about.process.title">
        Como trabalhamos
      </Text>
      <Text as="p" multiline k="about.process.body">
        Explicamos o problema antes de mexer em qualquer coisa. Se não vale a pena consertar, a
        gente fala.
      </Text>
    </article>
  );
}
