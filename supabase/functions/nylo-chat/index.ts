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

  // Summarize transactions by category
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
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Create authenticated Supabase client
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

    const systemPrompt = `Você é o Nox IA, um assessor financeiro pessoal inteligente e amigável. Responda sempre em português brasileiro.

Suas capacidades:
- Ajudar usuários a entender seus gastos e finanças
- Dar dicas de economia e planejamento financeiro
- Analisar padrões de gastos
- Sugerir melhorias no orçamento
- Responder dúvidas sobre investimentos de forma educativa
- Comparar gastos entre meses
- Calcular quanto o usuário pode gastar por dia

Regras:
- Seja conciso e direto, mas acolhedor
- Use emojis moderadamente para tornar a conversa mais leve
- Nunca dê conselhos de investimento específicos (ações, criptomoedas etc)
- Sempre sugira que o usuário consulte um profissional para decisões importantes
- Formate respostas com markdown quando apropriado (listas, negrito, etc)
- Use os dados reais do usuário para dar respostas personalizadas e precisas
- Quando o usuário perguntar sobre gastos, USE os dados abaixo para responder com valores reais
- Se não houver dados suficientes, informe e sugira que o usuário cadastre suas transações

${financialContext}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
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
