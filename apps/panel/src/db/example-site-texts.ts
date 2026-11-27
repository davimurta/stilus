/**
 * Texts of apps/example-site, used by the development seed.
 * Values equal the defaults written in the example-site code.
 */
export type SeedText = {
  key: string;
  page: string;
  description: string;
  value: string;
  kind: "line" | "multiline";
  maxLength: number;
};

const line = (key: string, page: string, description: string, value: string): SeedText => ({
  key,
  page,
  description,
  value,
  kind: "line",
  maxLength: 160,
});

const multiline = (key: string, page: string, description: string, value: string): SeedText => ({
  key,
  page,
  description,
  value,
  kind: "multiline",
  maxLength: 1000,
});

export const exampleSiteTexts: SeedText[] = [
  line("layout.header.brand", "layout", "Nome da marca no cabeçalho", "Oficina Exemplo"),
  line("layout.nav.home", "layout", "Menu: início", "Início"),
  line("layout.nav.about", "layout", "Menu: sobre", "Sobre"),
  line("layout.nav.contact", "layout", "Menu: contato", "Contato"),
  line(
    "layout.footer.note",
    "layout",
    "Rodapé",
    "Oficina Exemplo. Site de demonstração do Stilus.",
  ),

  line("home.meta.title", "home", "Título da aba", "Início | Oficina Exemplo"),
  line(
    "home.meta.description",
    "home",
    "Descrição para buscadores",
    "Consertos e manutenção com atendimento rápido e preço justo.",
  ),
  line("home.hero.title", "home", "Título principal", "Consertos rápidos, feitos com cuidado"),
  multiline(
    "home.hero.lead",
    "home",
    "Subtítulo do topo",
    "Há mais de 20 anos cuidando dos equipamentos da sua casa e da sua empresa.",
  ),
  line("home.hero.cta", "home", "Botão do topo", "Peça um orçamento"),
  line("home.features.same-day.title", "home", "Destaque 1: título", "Atendimento no mesmo dia"),
  multiline(
    "home.features.same-day.body",
    "home",
    "Destaque 1: texto",
    "Chamados abertos até as 14h são atendidos no mesmo dia útil.",
  ),
  line("home.features.warranty.title", "home", "Destaque 2: título", "Garantia de 90 dias"),
  multiline(
    "home.features.warranty.body",
    "home",
    "Destaque 2: texto",
    "Todo serviço tem garantia por escrito, sem letras miúdas.",
  ),
  line("home.features.free-quote.title", "home", "Destaque 3: título", "Orçamento sem custo"),
  multiline(
    "home.features.free-quote.body",
    "home",
    "Destaque 3: texto",
    "Você só paga se aprovar o serviço.",
  ),

  line("about.meta.title", "sobre", "Título da aba", "Sobre"),
  line(
    "about.meta.description",
    "sobre",
    "Descrição para buscadores",
    "Conheça a história e a equipe da Oficina Exemplo.",
  ),
  line("about.title", "sobre", "Título da página", "Sobre a Oficina Exemplo"),
  multiline(
    "about.lead",
    "sobre",
    "Subtítulo",
    "Uma empresa familiar que cresceu consertando o que outros descartam.",
  ),
  line("about.history.title", "sobre", "Seção história: título", "Nossa história"),
  multiline(
    "about.history.body",
    "sobre",
    "Seção história: texto",
    "Começamos em uma garagem, em 2004, com uma bancada e muita vontade de resolver problemas. Hoje atendemos centenas de clientes por mês, sem perder o cuidado do primeiro dia.",
  ),
  line("about.process.title", "sobre", "Seção como trabalhamos: título", "Como trabalhamos"),
  multiline(
    "about.process.body",
    "sobre",
    "Seção como trabalhamos: texto",
    "Explicamos o problema antes de mexer em qualquer coisa. Se não vale a pena consertar, a gente fala.",
  ),

  line("contact.meta.title", "contato", "Título da aba", "Contato"),
  line(
    "contact.meta.description",
    "contato",
    "Descrição para buscadores",
    "Fale com a Oficina Exemplo por telefone, e-mail ou formulário.",
  ),
  line("contact.title", "contato", "Título da página", "Fale com a gente"),
  line("contact.lead", "contato", "Subtítulo", "Respondemos em até um dia útil."),
  line("contact.phone", "contato", "Telefone", "Telefone: (31) 0000-0000"),
  line("contact.hours", "contato", "Horário", "Horário: segunda a sexta, das 8h às 18h"),
  line("contact.form.name-label", "contato", "Formulário: rótulo do nome", "Nome"),
  line("contact.form.name-placeholder", "contato", "Formulário: dica do nome", "Seu nome"),
  line("contact.form.message-label", "contato", "Formulário: rótulo da mensagem", "Mensagem"),
  line(
    "contact.form.message-placeholder",
    "contato",
    "Formulário: dica da mensagem",
    "Conte o que precisa",
  ),
  line("contact.form.submit", "contato", "Formulário: botão", "Enviar mensagem"),
];
