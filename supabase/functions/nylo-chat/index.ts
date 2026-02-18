import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getUserFinancialData(supabase: any) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0];
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0];

  const [
    { data: profile },
    { data: wallets },
    { data: categories },
    { data: goals },
    { data: thisMonthTx },
    { data: lastMonthTx },
    { data: cards },
  ] = await Promise.all([
    supabase.from("profiles").select("display_name, monthly_income, subscription_plan").single(),
    supabase.from("wallets").select("name, type, balance"),
    supabase.from("categories").select("name, icon, budget_limit"),
    supabase.from("financial_goals").select("name, target_amount, current_amount, deadline"),
    supabase.from("transactions").select("amount, type, description, date, category_id, categories(name)").gte("date", startOfMonth).lte("date", endOfMonth).order("date", { ascending: false }),
    supabase.from("transactions").select("amount, type, description, date, category_id, categories(name)").gte("date", startOfLastMonth).lte("date", endOfLastMonth).order("date", { ascending: false }),
    supabase.from("cards").select("name, brand, last_4_digits, credit_limit, due_day"),
  ]);

  const summarizeByCategory = (txs: any[]) => {
    const map: Record<string, { total: number; count: number }> = {};
    let totalIncome = 0, totalExpense = 0;
    for (const tx of txs || []) {
      const cat = tx.categories?.name || "Sem categoria";
      if (!map[cat]) map[cat] = { total: 0, count: 0 };
      map[cat].total += Number(tx.amount);
      map[cat].count++;
      if (tx.type === "income") totalIncome += Number(tx.amount);
      else totalExpense += Number(tx.amount);
    }
    return { byCategory: map, totalIncome, totalExpense, count: (txs || []).length };
  };

  const thisMonth = summarizeByCategory(thisMonthTx);
  const lastMonth = summarizeByCategory(lastMonthTx);
  const totalBalance = (wallets || []).reduce((s: number, w: any) => s + Number(w.balance), 0);

  return `
## Dados Financeiros do Usuário

**Nome:** ${profile?.display_name || "Não informado"}
**Renda mensal:** R$ ${profile?.monthly_income ? Number(profile.monthly_income).toFixed(2) : "Não informada"}
**Plano:** ${profile?.subscription_plan || "free"}

### Carteiras (Saldo total: R$ ${totalBalance.toFixed(2)})
${(wallets || []).map((w: any) => `- ${w.name} (${w.type}): R$ ${Number(w.balance).toFixed(2)}`).join("\n") || "Nenhuma carteira cadastrada"}

### Cartões
${(cards || []).map((c: any) => `- ${c.name} ${c.brand || ""} (****${c.last_4_digits || "?"}) - Limite: R$ ${c.credit_limit ? Number(c.credit_limit).toFixed(2) : "?"} - Vencimento dia ${c.due_day || "?"}`).join("\n") || "Nenhum cartão cadastrado"}

### Categorias e Orçamentos
${(categories || []).map((c: any) => `- ${c.name}: Limite R$ ${c.budget_limit ? Number(c.budget_limit).toFixed(2) : "sem limite"}`).join("\n") || "Nenhuma categoria"}

### Mês Atual (${startOfMonth} a ${endOfMonth})
- Total de transações: ${thisMonth.count}
- Receitas: R$ ${thisMonth.totalIncome.toFixed(2)}
- Despesas: R$ ${thisMonth.totalExpense.toFixed(2)}
- Saldo do mês: R$ ${(thisMonth.totalIncome - thisMonth.totalExpense).toFixed(2)}
${Object.entries(thisMonth.byCategory).map(([cat, d]) => `  - ${cat}: R$ ${d.total.toFixed(2)} (${d.count}x)`).join("\n")}

### Últimas 10 transações do mês
${(thisMonthTx || []).slice(0, 10).map((t: any) => `- ${t.date} | ${t.type === "income" ? "+" : "-"}R$ ${Number(t.amount).toFixed(2)} | ${t.description} | ${t.categories?.name || "Sem categoria"}`).join("\n") || "Nenhuma transação"}

### Mês Anterior (${startOfLastMonth} a ${endOfLastMonth})
- Receitas: R$ ${lastMonth.totalIncome.toFixed(2)}
- Despesas: R$ ${lastMonth.totalExpense.toFixed(2)}
${Object.entries(lastMonth.byCategory).map(([cat, d]) => `  - ${cat}: R$ ${d.total.toFixed(2)} (${d.count}x)`).join("\n")}

### Metas Financeiras
${(goals || []).map((g: any) => `- ${g.name}: R$ ${Number(g.current_amount).toFixed(2)} / R$ ${Number(g.target_amount).toFixed(2)} (${((Number(g.current_amount) / Number(g.target_amount)) * 100).toFixed(0)}%) ${g.deadline ? `- Prazo: ${g.deadline}` : ""}`).join("\n") || "Nenhuma meta cadastrada"}
`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { messages, imageBase64, imageMimeType } = body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    let financialContext = "";

    if (authHeader) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      try {
        financialContext = await getUserFinancialData(supabase);
      } catch (e) {
        console.error("Error fetching user data:", e);
        financialContext = "\n(Não foi possível carregar os dados financeiros do usuário)\n";
      }
    }

    const systemPrompt = `Você é o Nox IA 🤖, um assessor financeiro pessoal inteligente e acolhedor. Responda sempre em português brasileiro.

📋 REGRAS DE FORMATAÇÃO (MUITO IMPORTANTE):
- Use emojis relevantes e expressivos em TODAS as respostas
- Separe informações em parágrafos curtos com quebras de linha entre eles
- Use emojis no início de cada parágrafo ou tópico principal
- Seja caloroso, motivador e pessoal — use o nome do usuário quando disponível
- Formate com markdown (negrito, listas) quando ajudar na leitura

💡 Capacidades:
- Analisar gastos e finanças com os dados reais do usuário
- Identificar padrões de gastos e sugerir melhorias
- Calcular quanto pode gastar por dia/semana
- Comparar meses e categorias
- Dar dicas práticas de economia
- Analisar comprovantes e recibos enviados como imagem
- Responder dúvidas sobre finanças pessoais de forma educativa

⚠️ Regras:
- Nunca dê conselhos de investimento específicos (ações, cripto, etc.)
- Sempre sugira consultar um profissional para decisões importantes
- Se não houver dados suficientes, informe e sugira cadastrar transações
- Use SEMPRE os dados reais do usuário para respostas personalizadas e precisas

🧾 Se receber imagem de comprovante:
- Extraia valor, descrição, categoria e forma de pagamento
- Confirme os dados de forma amigável e pergunte se o usuário quer registrar a transação

${financialContext}`;

    // Build messages with optional image in the last user message
    const processedMessages = [...messages];
    if (imageBase64 && imageMimeType && processedMessages.length > 0) {
      const lastMsg = processedMessages[processedMessages.length - 1];
      if (lastMsg.role === "user") {
        processedMessages[processedMessages.length - 1] = {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${imageMimeType};base64,${imageBase64}` },
            },
            {
              type: "text",
              text: lastMsg.content || "Analise este comprovante e extraia os dados da transação.",
            },
          ],
        };
      }
    }

    // Use vision model when image is present, otherwise fast model
    const model = imageBase64 ? "google/gemini-2.5-flash" : "google/gemini-3-flash-preview";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...processedMessages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Muitas solicitações. Tente novamente em alguns segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro ao conectar com IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("nylo-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
