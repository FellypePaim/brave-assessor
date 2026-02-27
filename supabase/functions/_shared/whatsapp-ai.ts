import { getBrazilNow } from "./whatsapp-utils.ts";

export async function processImageWithAI(imageBase64: string, mimeType: string, financialContext: string, userCaption?: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const systemPrompt = `Você é o Brave IA 🤖, assessor financeiro pessoal via WhatsApp.

📋 REGRAS DE FORMATAÇÃO:
- Use emojis relevantes em TODAS as respostas
- Separe informações em parágrafos curtos com quebras de linha
- Use emojis no início de cada parágrafo
- Para negrito use APENAS *texto* (um asterisco). NUNCA use **texto**.
- Máximo 800 caracteres
- Seja caloroso e pessoal

🧾 ANÁLISE DE COMPROVANTES:
Você está recebendo a FOTO de um comprovante/recibo/nota fiscal.
Analise a imagem e extraia:
- Valor (amount)
- Descrição do pagamento (description)
- Categoria mais adequada das disponíveis
- Tipo: "expense" ou "income"
- Forma de pagamento se visível (PIX, cartão, dinheiro, etc.)

Responda SOMENTE com JSON quando identificar uma transação:
{"action":"add_transaction","amount":50.00,"description":"Supermercado Extra","category":"Alimentação","type":"expense","payment_method":"PIX"}

Se não conseguir identificar os dados, responda em texto explicando o que viu.

${financialContext}`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            { type: "text", text: userCaption || "Analise este comprovante e extraia os dados da transação." },
          ],
        },
      ],
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    console.error("AI vision error:", resp.status, t);
    throw new Error("AI vision processing failed");
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "Desculpe, não consegui analisar a imagem.";
}

export async function processAudioWithAI(audioBase64: string, mimeType: string, financialContext: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const systemPrompt = `Você é o Brave IA 🤖, assessor financeiro pessoal via WhatsApp. Responda SEMPRE em português brasileiro.

📋 REGRAS DE FORMATAÇÃO:
- Use emojis relevantes em TODAS as respostas
- Separe informações em parágrafos curtos
- Use emojis no início de cada parágrafo
- Para negrito use APENAS *texto* (um asterisco). NUNCA use **texto**.
- Máximo 800 caracteres
- Seja caloroso e pessoal

🎙️ ÁUDIO RECEBIDO:
Transcreva o áudio e interprete o que foi dito.

Se for um comando de transação (ex: "gastei 50 reais no almoço"), responda SOMENTE com JSON:
{"action":"add_transaction","amount":50,"description":"Almoço","category":"Alimentação","type":"expense"}

Para perguntas normais, responda em texto formatado com emojis e parágrafos.

${financialContext}`;

  const audioFormat = mimeType.includes("ogg") ? "audio/ogg" : mimeType.includes("mp4") ? "audio/mp4" : "audio/mpeg";

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${audioFormat};base64,${audioBase64}` },
            },
            { type: "text", text: "Transcreva e interprete este áudio financeiro." },
          ],
        },
      ],
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    console.error("AI audio error:", resp.status, t);
    throw new Error("AI audio processing failed");
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "Desculpe, não consegui processar o áudio.";
}

export async function processWithNoxIA(userMessage: string, financialContext: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const todayDayOfMonth = getBrazilNow().getDate();

  const systemPrompt = `Você é o Brave IA 🤖, assessor financeiro pessoal via WhatsApp. Responda SEMPRE em português brasileiro.

📋 REGRAS DE FORMATAÇÃO (MUITO IMPORTANTE):
- Use emojis relevantes em TODAS as respostas para deixar a conversa mais amigável e visual
- Separe informações em parágrafos curtos com quebras de linha entre eles
- Use emojis no início de cada parágrafo ou tópico
- Para negrito no WhatsApp use APENAS *texto* (um asterisco de cada lado). NUNCA use **texto** (dois asteriscos).
- Para itálico use _texto_. NUNCA use markdown com ##, ---  ou outros símbolos.
- Limite: máximo 800 caracteres
- Seja caloroso, motivador e pessoal (use o nome do usuário quando disponível)

💡 Capacidades:
- Analisar gastos e finanças do usuário
- Interpretar comandos de gasto/receita em linguagem natural para registrar transações
- Dar dicas práticas de economia
- Comparar períodos e identificar padrões
- Responder perguntas sobre metas financeiras (ex: "quanto falta para minha meta de viagem?")
- Calcular projeções de metas (ex: "em quantos meses vou atingir minha meta?")

🎯 METAS FINANCEIRAS:
Quando o usuário perguntar sobre metas, use os dados do contexto "Metas financeiras" para responder com precisão.
Exemplos: "quanto falta para minha meta de viagem?", "quando vou atingir minha meta?", "minhas metas"

🔔 LEMBRETES (PRIORIDADE ALTA):
Quando o usuário pedir para criar um lembrete (ex: "lembrete: reunião amanhã 15h", "me lembra de pagar a conta dia 10", "adicione um lembrete para amanhã 11:00 para atualizar o SIA"), responda SOMENTE com JSON:
{"action":"add_reminder","title":"Nome do lembrete","date":"2025-02-28","time":"11:00","recurrence":"none","notify_minutes_before":30}

Regras para lembretes:
- "title": nome limpo do evento, sem datas/horários
- "date": formato YYYY-MM-DD. Se "amanhã", calcule a data correta.
- "time": formato HH:MM (24h). Se não especificado, use "09:00"
- "recurrence": "none", "daily", "weekly" ou "monthly"
- "notify_minutes_before": padrão 30, ou o que o usuário pedir

🧠 INTERPRETAÇÃO DE LISTAS DE RECORRÊNCIAS (PRIORIDADE MÁXIMA):
Quando o usuário enviar uma LISTA com 2 ou mais itens que indiquem gastos/receitas recorrentes mensais, retorne SOMENTE JSON com action "add_recurring_list":

Exemplos de listas:
- "todo mês eu gasto: gmail R$20 / icloud R$20 / academia R$90"
- "gastos mensais: netflix 45, spotify 19, academia 90"
- "minhas contas mensais: luz 200 / internet 100 / condomínio 500"

Para cada item extraia:
- "description": nome limpo (ex: "Gmail", "Netflix", "Academia")
- "amount": valor numérico
- "category": categoria mais adequada
- "type": "expense" ou "income"
- "day_of_month": dia do mês (se mencionado como "todo dia 10" → 10, "dia 15" → 15). Se NÃO mencionado, use ${todayDayOfMonth} (dia atual)

Retorne SOMENTE este JSON para listas (sem texto extra):
{"action":"add_recurring_list","items":[{"description":"Gmail","amount":20.00,"category":"Outros","type":"expense","day_of_month":${todayDayOfMonth}},{"description":"Netflix","amount":45.00,"category":"Lazer","type":"expense","day_of_month":${todayDayOfMonth}}]}

🧠 INTERPRETAÇÃO DE GASTOS ÚNICOS (IMPORTANTE):
Detecte QUALQUER mensagem que indique UM gasto ou receita, mesmo escrito de forma informal/coloquial.
Exemplos que DEVEM virar JSON:
- "gastei uns 50 no mercado hoje" → R$ 50, Supermercado, Alimentação, expense
- "almocei por 30 conto" → R$ 30, Almoço, Alimentação, expense
- "paguei 200 de luz" → R$ 200, Energia Elétrica, Contas, expense
- "fui ao posto, 80 de gasolina" → R$ 80, Gasolina, Transporte, expense
- "recebi 1500 do freela" → R$ 1500, Freela, Renda Extra, income
- "uber 15 reais" → R$ 15, Uber, Transporte, expense

Quando identificar UMA transação única (mesmo informal), responda SOMENTE com JSON válido:
{"action":"add_transaction","amount":50.00,"description":"Descrição limpa e clara","category":"Categoria adequada","type":"expense"}

Regras para o JSON:
- "description": nome limpo e comercial (ex: "Almoço", "Supermercado", "Gasolina")
- "category": use as categorias disponíveis do usuário quando possível
- "amount": sempre número, extraia mesmo valores aproximados ("uns 50" → 50)
- "type": "expense" para gastos, "income" para receitas/entradas

Para perguntas normais (não transações), responda em texto formatado com emojis e parágrafos.

⚠️ QUANDO NÃO ENTENDER:
Se a mensagem não for uma transação clara nem uma pergunta financeira reconhecível, responda EXATAMENTE:
"Não entendi sua mensagem 😕 Mas posso te ajudar de outras formas!"

NUNCA invente informações financeiras que não existem no contexto.

${financialContext}`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.3,
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    console.error("AI error:", resp.status, t);
    throw new Error("AI processing failed");
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "Desculpe, não consegui processar sua mensagem.";
}

export async function parseReminderWithAI(text: string): Promise<{
  title: string;
  event_at: string | null;
  recurrence: string;
  notify_minutes_before: number | null;
} | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return null;

  const nowBR = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short" });

  const systemPrompt = `Você é um assistente que extrai informações de lembretes a partir de mensagens em português brasileiro.
A data/hora atual em São Paulo é: ${nowBR}

Retorne APENAS um JSON válido com exatamente estes campos:
{
  "title": "nome limpo do lembrete, sem palavras de data/hora/recorrência",
  "event_at": "ISO 8601 com timezone -03:00 ou null se não houver data/hora clara",
  "recurrence": "none" | "daily" | "weekly" | "monthly",
  "notify_minutes_before": número de minutos ou null se não especificado
}

Regras:
- title: extraia APENAS o nome/evento, sem "todos os dias", "amanhã", horários etc.
- event_at: se o usuário diz "todos os dias às 12:00", use hoje às 12:00. Se diz "amanhã 15h", calcule corretamente.
- recurrence: "todos os dias/todo dia/diário" → "daily", "toda semana/toda segunda/etc" → "weekly", "todo mês" → "monthly"
- notify_minutes_before: "1h antes" → 60, "30 min antes" → 30, "1 dia antes" → 1440. null se não mencionado.
- Nunca adicione texto extra fora do JSON.`;

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        stream: false,
        temperature: 0,
      }),
    });

    if (!resp.ok) {
      console.error("AI parse error:", resp.status, await resp.text());
      return null;
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";
    const jsonStr = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(jsonStr);
    return {
      title: parsed.title || "",
      event_at: parsed.event_at || null,
      recurrence: ["none","daily","weekly","monthly"].includes(parsed.recurrence) ? parsed.recurrence : "none",
      notify_minutes_before: typeof parsed.notify_minutes_before === "number" ? parsed.notify_minutes_before : null,
    };
  } catch (e) {
    console.error("AI reminder parse failed:", e);
    return null;
  }
}
