// Auto-categorization: keyword-based category matcher
// Maps common transaction descriptions to default category names

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Alimentação": [
    "almoço", "almoco", "jantar", "café", "cafe", "lanche", "restaurante", "pizzaria",
    "hamburguer", "burger", "sushi", "padaria", "mercado", "supermercado", "açougue",
    "ifood", "rappi", "uber eats", "delivery", "marmita", "comida", "refeição",
    "mcdonald", "mcdonalds", "subway", "starbucks", "feira", "hortifruti", "sacolão",
    "bar", "cerveja", "choperia", "sorvete", "doceria", "confeitaria", "salgado",
  ],
  "Transporte": [
    "gasolina", "combustível", "combustivel", "etanol", "álcool", "diesel",
    "uber", "99", "cabify", "taxi", "táxi", "ônibus", "onibus", "metrô", "metro",
    "estacionamento", "pedágio", "pedagio", "oficina", "mecânico", "mecanico",
    "ipva", "seguro auto", "lavagem", "lavar carro", "troca de óleo", "pneu",
    "passagem", "avião", "aviao", "voo", "rodoviária", "rodoviaria",
  ],
  "Moradia": [
    "aluguel", "condomínio", "condominio", "iptu", "luz", "energia", "eletricidade",
    "água", "agua", "gás", "gas", "internet", "wifi", "celular", "telefone",
    "tv", "streaming", "manutenção", "manutencao", "reparo", "reforma",
    "seguro residencial", "pintura", "encanador", "eletricista",
  ],
  "Saúde": [
    "farmácia", "farmacia", "remédio", "remedio", "medicamento", "médico", "medico",
    "consulta", "exame", "dentista", "hospital", "clínica", "clinica", "plano de saúde",
    "plano de saude", "psicólogo", "psicologo", "terapia", "vacina", "óculos", "oculos",
    "academia", "suplemento", "vitamina",
  ],
  "Educação": [
    "faculdade", "curso", "escola", "mensalidade escolar", "material escolar",
    "livro", "apostila", "udemy", "alura", "cursinho", "aula", "professor",
    "treinamento", "workshop", "palestra", "congresso", "certificação",
  ],
  "Lazer": [
    "cinema", "teatro", "show", "ingresso", "netflix", "spotify", "disney",
    "amazon prime", "hbo", "globoplay", "youtube premium", "game", "jogo",
    "playstation", "xbox", "steam", "nintendo", "viagem", "hotel", "pousada",
    "airbnb", "passeio", "parque", "praia", "festa", "balada", "boate",
    "assinatura", "gamersclub",
  ],
  "Vestuário": [
    "roupa", "camisa", "camiseta", "calça", "calca", "tênis", "tenis", "sapato",
    "vestido", "blusa", "jaqueta", "casaco", "meia", "cueca", "lingerie",
    "acessório", "acessorio", "relógio", "relogio", "anel", "brinco",
    "shein", "renner", "c&a", "riachuelo", "zara", "nike", "adidas",
  ],
};

/**
 * Given a transaction description, returns the best matching category name
 * from the user's available categories. Returns null if no match found.
 */
export function autoCategorize(
  description: string,
  userCategories: { id: string; name: string }[],
): { id: string; name: string } | null {
  if (!description || userCategories.length === 0) return null;

  const descLower = description.toLowerCase().trim();

  // Try to match keywords to a default category name
  for (const [categoryName, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const matched = keywords.some(kw => descLower.includes(kw));
    if (matched) {
      // Find the user's category that matches this name
      const userCat = userCategories.find(
        c => c.name.toLowerCase() === categoryName.toLowerCase()
      );
      if (userCat) return userCat;
    }
  }

  return null;
}
