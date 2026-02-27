// Auto-categorization: keyword-based category matcher for Edge Functions

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Alimentação": [
    "almoço", "almoco", "jantar", "café", "cafe", "lanche", "restaurante", "pizzaria",
    "hamburguer", "burger", "sushi", "padaria", "mercado", "supermercado", "açougue",
    "ifood", "rappi", "uber eats", "delivery", "marmita", "comida", "refeição",
    "mcdonald", "subway", "starbucks", "feira", "hortifruti", "sacolão",
    "bar", "cerveja", "choperia", "sorvete", "doceria", "salgado",
  ],
  "Transporte": [
    "gasolina", "combustível", "combustivel", "etanol", "álcool", "diesel",
    "uber", "99", "cabify", "taxi", "táxi", "ônibus", "onibus", "metrô", "metro",
    "estacionamento", "pedágio", "pedagio", "oficina", "mecânico", "mecanico",
    "ipva", "lavagem", "lavar carro", "troca de óleo", "pneu",
    "passagem", "avião", "aviao", "voo",
  ],
  "Moradia": [
    "aluguel", "condomínio", "condominio", "iptu", "luz", "energia", "eletricidade",
    "água", "agua", "gás", "gas", "internet", "wifi", "celular", "telefone",
    "tv", "streaming", "manutenção", "manutencao", "reparo", "reforma",
  ],
  "Saúde": [
    "farmácia", "farmacia", "remédio", "remedio", "medicamento", "médico", "medico",
    "consulta", "exame", "dentista", "hospital", "clínica", "clinica", "plano de saúde",
    "plano de saude", "psicólogo", "psicologo", "terapia", "academia", "suplemento",
  ],
  "Educação": [
    "faculdade", "curso", "escola", "material escolar", "livro", "apostila",
    "udemy", "alura", "cursinho", "aula", "professor", "treinamento",
  ],
  "Lazer": [
    "cinema", "teatro", "show", "ingresso", "netflix", "spotify", "disney",
    "amazon prime", "hbo", "globoplay", "youtube premium", "game", "jogo",
    "playstation", "xbox", "steam", "viagem", "hotel", "pousada",
    "airbnb", "passeio", "festa", "balada", "gamersclub",
  ],
  "Vestuário": [
    "roupa", "camisa", "camiseta", "calça", "calca", "tênis", "tenis", "sapato",
    "vestido", "blusa", "jaqueta", "casaco", "shein", "renner", "riachuelo", "zara",
  ],
};

export function autoCategorize(
  description: string,
  userCategories: { id: string; name: string }[],
): { id: string; name: string } | null {
  if (!description || userCategories.length === 0) return null;
  const descLower = description.toLowerCase().trim();

  for (const [categoryName, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => descLower.includes(kw))) {
      const userCat = userCategories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
      if (userCat) return userCat;
    }
  }
  return null;
}
