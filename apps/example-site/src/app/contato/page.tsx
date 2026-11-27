import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contato",
  description: "Fale com a Oficina Exemplo por telefone, e-mail ou formulário.",
};

export default function ContactPage() {
  return (
    <>
      <h1>Fale com a gente</h1>
      <p className="lead">Respondemos em até um dia útil.</p>

      <address>
        <p>Telefone: (31) 0000-0000</p>
        <p>Horário: segunda a sexta, das 8h às 18h</p>
      </address>

      <form className="contact-form" action="#" aria-label="Formulário de contato">
        <label>
          Nome
          <input name="name" type="text" placeholder="Seu nome" />
        </label>
        <label>
          Mensagem
          <textarea name="message" rows={4} placeholder="Conte o que precisa" />
        </label>
        <button type="submit" className="button">
          Enviar mensagem
        </button>
      </form>
    </>
  );
}
