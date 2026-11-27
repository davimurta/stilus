import { Text, t } from "@stilus/next";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: await t("contact.meta.title", "Contato"),
    description: await t(
      "contact.meta.description",
      "Fale com a Oficina Exemplo por telefone, e-mail ou formulário.",
    ),
  };
}

export default async function ContactPage() {
  const [namePlaceholder, messagePlaceholder] = await Promise.all([
    t("contact.form.name-placeholder", "Seu nome"),
    t("contact.form.message-placeholder", "Conte o que precisa"),
  ]);

  return (
    <>
      <Text as="h1" k="contact.title">
        Fale com a gente
      </Text>
      <Text as="p" className="lead" k="contact.lead">
        Respondemos em até um dia útil.
      </Text>

      <address>
        <Text as="p" k="contact.phone">
          Telefone: (31) 0000-0000
        </Text>
        <Text as="p" k="contact.hours">
          Horário: segunda a sexta, das 8h às 18h
        </Text>
      </address>

      <form className="contact-form" action="#" aria-label="Formulário de contato">
        <label>
          <Text k="contact.form.name-label">Nome</Text>
          <input name="name" type="text" placeholder={namePlaceholder} />
        </label>
        <label>
          <Text k="contact.form.message-label">Mensagem</Text>
          <textarea name="message" rows={4} placeholder={messagePlaceholder} />
        </label>
        <Text as="button" type="submit" className="button" k="contact.form.submit">
          Enviar mensagem
        </Text>
      </form>
    </>
  );
}
