import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sobre",
  description: "Conheça a história e a equipe da Oficina Exemplo.",
};

export default function AboutPage() {
  return (
    <article>
      <h1>Sobre a Oficina Exemplo</h1>
      <p className="lead">Uma empresa familiar que cresceu consertando o que outros descartam.</p>

      <h2>Nossa história</h2>
      <p>
        Começamos em uma garagem, em 2004, com uma bancada e muita vontade de resolver problemas.
        Hoje atendemos centenas de clientes por mês, sem perder o cuidado do primeiro dia.
      </p>

      <h2>Como trabalhamos</h2>
      <p>
        Explicamos o problema antes de mexer em qualquer coisa. Se não vale a pena consertar, a
        gente fala.
      </p>
    </article>
  );
}
