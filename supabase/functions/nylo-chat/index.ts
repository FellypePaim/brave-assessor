import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { callGemini, callGeminiStream, geminiStreamToOpenAI } from "../_shared/gemini-client.ts";

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
    { data: profile }, { data: wallets }, { data: categories }, { data: goals },
    { data: thisMonthTx }, { data: lastMonthTx }, { data: cards }, { data: reminders }, { data: recurring },
  ] = await Promise.all([
    supabase.from("profiles").select("display_name, monthly_income, subscription_plan").single(),
    supabase.from("wallets").select("name, type, balance, id"),
    supabase.from("categories").select("name, icon, budget_limit, id"),
    supabase.from("financial_goals").select("name, target_amount, current_amount, deadline, id"),
    supabase.from("transactions").select("amount, type, description, date, category_id, categories(name)").gte("date", startOfMonth).lte("date", endOfMonth).order("date", { ascending: false }),
    supabase.from("transactions").select("amount, type, description, date, category_id, categories(name)").gte("date", startOfLastMonth).lte("date", endOfLastMonth).order("date", { ascending: false }),
    supabase.from("cards").select("name, brand, last_4_digits, credit_limit, due_day, id"),
    supabase.from("reminders").select("title, event_at, recurrence, is_active, id").eq("is_active", true).order("event_at", { ascending: true }).limit(10),
    supabase.from("recurring_transactions").select("description, amount, type, day_of_month, is_active").eq("is_active", true),
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
${(wallets || []).map((w: any) => `- ${w.name} (${w.type}): R$ ${Number(w.balance).toFixed(2)}`).join("\n") || "Nenhuma carteira"}

### Cartões
${(cards || []).map((c: any) => `- ${c.name} ${c.brand || ""} (****${c.last_4_digits || "?"}) - Limite: R$ ${c.credit_limit ? Number(c.credit_limit).toFixed(2) : "?"} - Venc dia ${c.due_day || "?"}`).join("\n") || "Nenhum cartão"}

### Categorias
${(categories || []).map((c: any) => `- ${c.name}: Limite R$ ${c.budget_limit ? Number(c.budget_limit).toFixed(2) : "sem limite"}`).join("\n") || "Nenhuma categoria"}

### Mês Atual
- Transações: ${thisMonth.count} | Receitas: R$ ${thisMonth.totalIncome.toFixed(2)} | Despesas: R$ ${thisMonth.totalExpense.toFixed(2)}
${Object.entries(thisMonth.byCategory).map(([cat, d]) => `  - ${cat}: R$ ${d.total.toFixed(2)} (${d.count}x)`).join("\n")}

### Últimas 10 transações
${(thisMonthTx || []).slice(0, 10).map((t: any) => `- ${t.date} | ${t.type === "income" ? "+" : "-"}R$ ${Number(t.amount).toFixed(2)} | ${t.description} | ${t.categories?.name || "?"}`).join("\n") || "Nenhuma"}

### Mês Anterior
- Receitas: R$ ${lastMonth.totalIncome.toFixed(2)} | Despesas: R$ ${lastMonth.totalExpense.toFixed(2)}

### Metas
${(goals || []).map((g: any) => `- ${g.name}: R$ ${Number(g.current_amount).toFixed(2)} / R$ ${Number(g.target_amount).toFixed(2)} (${((Number(g.current_amount) / Number(g.target_amount)) * 100).toFixed(0)}%) ${g.deadline ? `Prazo: ${g.deadline}` : ""}`).join("\n") || "Nenhuma meta"}

### Lembretes Ativos
${(reminders || []).map((r: any) => `- ${r.title}: ${new Date(r.event_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })} ${r.recurrence !== "none" ? `(${r.recurrence})` : ""}`).join("\n") || "Nenhum"}

### Recorrências
${(recurring || []).map((r: any) => `- ${r.description}: R$ ${Number(r.amount).toFixed(2)} (${r.type}) dia ${r.day_of_month}`).join("\n") || "Nenhuma"}
`;
}

async function executeAction(supabaseAdmin: any, userId: string, aiText: string): Promise<{ executed: boolean; message: string }> {
  const patterns = [
    { r: /\{[\s\S]*"action"\s*:\s*"add_transaction"[\s\S]*\}/, h: "add_transaction" },
    { r: /\{[\s\S]*"action"\s*:\s*"add_goal"[\s\S]*\}/, h: "add_goal" },
    { r: /\{[\s\S]*"action"\s*:\s*"deposit_goal"[\s\S]*\}/, h: "deposit_goal" },
    { r: /\{[\s\S]*"action"\s*:\s*"edit_goal"[\s\S]*\}/, h: "edit_goal" },
    { r: /\{[\s\S]*"action"\s*:\s*"delete_goal"[\s\S]*\}/, h: "delete_goal" },
    { r: /\{[\s\S]*"action"\s*:\s*"add_wallet"[\s\S]*\}/, h: "add_wallet" },
    { r: /\{[\s\S]*"action"\s*:\s*"edit_wallet"[\s\S]*\}/, h: "edit_wallet" },
    { r: /\{[\s\S]*"action"\s*:\s*"add_category"[\s\S]*\}/, h: "add_category" },
    { r: /\{[\s\S]*"action"\s*:\s*"edit_category"[\s\S]*\}/, h: "edit_category" },
    { r: /\{[\s\S]*"action"\s*:\s*"add_card"[\s\S]*\}/, h: "add_card" },
    { r: /\{[\s\S]*"action"\s*:\s*"edit_card"[\s\S]*\}/, h: "edit_card" },
    { r: /\{[\s\S]*"action"\s*:\s*"add_reminder"[\s\S]*\}/, h: "add_reminder" },
  ];

  const fmt = (v: number) => `R$ ${v.toFixed(2)}`;

  for (const { r, h } of patterns) {
    const match = aiText.match(r);
    if (!match) continue;
    try {
      const a = JSON.parse(match[0]);
      switch (h) {
        case "add_transaction": {
          const { data: cats } = await supabaseAdmin.from("categories").select("id, name").eq("user_id", userId);
          const cat = (cats || []).find((c: any) => c.name.toLowerCase() === (a.category || "").toLowerCase());
          const { data: ws } = await supabaseAdmin.from("wallets").select("id, balance").eq("user_id", userId).order("created_at").limit(1);
          const w = ws?.[0];
          await supabaseAdmin.from("transactions").insert({ user_id: userId, amount: Number(a.amount), description: a.description, type: a.type || "expense", category_id: cat?.id || null, wallet_id: w?.id || null, date: new Date().toISOString().split("T")[0] });
          if (w) { const ch = a.type === "income" ? Number(a.amount) : -Number(a.amount); await supabaseAdmin.from("wallets").update({ balance: Number(w.balance) + ch }).eq("id", w.id); }
          return { executed: true, message: `✅ **Transação registrada!**\n\n📝 ${a.description}\n💵 ${fmt(Number(a.amount))}\n📂 ${a.category || "Sem categoria"}` };
        }
        case "add_goal": {
          await supabaseAdmin.from("financial_goals").insert({ user_id: userId, name: a.name, target_amount: Number(a.target_amount), current_amount: 0, deadline: a.deadline || null, color: a.color || "#10b981" });
          return { executed: true, message: `🎯 **Meta criada!**\n\n📝 ${a.name}\n💰 Alvo: ${fmt(Number(a.target_amount))}` };
        }
        case "deposit_goal": {
          const { data: gs } = await supabaseAdmin.from("financial_goals").select("*").eq("user_id", userId);
          const g = (gs || []).find((g: any) => g.name.toLowerCase().includes((a.search || "").toLowerCase()));
          if (!g) return { executed: true, message: `❓ Meta "${a.search}" não encontrada.` };
          const n = Number(g.current_amount) + Number(a.amount);
          await supabaseAdmin.from("financial_goals").update({ current_amount: n }).eq("id", g.id);
          return { executed: true, message: `💰 **Aporte registrado!**\n\n🎯 ${g.name}\n➕ ${fmt(Number(a.amount))}\n📊 ${fmt(n)} / ${fmt(Number(g.target_amount))} (${((n / Number(g.target_amount)) * 100).toFixed(0)}%)` };
        }
        case "edit_goal": {
          const { data: gs } = await supabaseAdmin.from("financial_goals").select("*").eq("user_id", userId);
          const g = (gs || []).find((g: any) => g.name.toLowerCase().includes((a.search || "").toLowerCase()));
          if (!g) return { executed: true, message: `❓ Meta "${a.search}" não encontrada.` };
          const u: any = {}; if (a.field === "name") u.name = a.new_value; else if (a.field === "target_amount") u.target_amount = Number(a.new_value); else if (a.field === "deadline") u.deadline = a.new_value;
          await supabaseAdmin.from("financial_goals").update(u).eq("id", g.id);
          return { executed: true, message: `✅ Meta **${g.name}** atualizada!` };
        }
        case "delete_goal": {
          const { data: gs } = await supabaseAdmin.from("financial_goals").select("*").eq("user_id", userId);
          const g = (gs || []).find((g: any) => g.name.toLowerCase().includes((a.search || "").toLowerCase()));
          if (!g) return { executed: true, message: `❓ Meta "${a.search}" não encontrada.` };
          await supabaseAdmin.from("financial_goals").delete().eq("id", g.id);
          return { executed: true, message: `🗑️ Meta **${g.name}** excluída!` };
        }
        case "add_wallet": {
          await supabaseAdmin.from("wallets").insert({ user_id: userId, name: a.name, type: a.type || "checking", balance: Number(a.balance || 0) });
          return { executed: true, message: `💳 **Carteira criada!** ${a.name}` };
        }
        case "edit_wallet": {
          const { data: ws } = await supabaseAdmin.from("wallets").select("*").eq("user_id", userId);
          const w = (ws || []).find((w: any) => w.name.toLowerCase().includes((a.search || "").toLowerCase()));
          if (!w) return { executed: true, message: `❓ Carteira "${a.search}" não encontrada.` };
          const u: any = {}; if (a.field === "balance") u.balance = Number(a.new_value); else if (a.field === "name") u.name = a.new_value;
          await supabaseAdmin.from("wallets").update(u).eq("id", w.id);
          return { executed: true, message: `✅ Carteira **${w.name}** atualizada!` };
        }
        case "add_category": {
          await supabaseAdmin.from("categories").insert({ user_id: userId, name: a.name, icon: a.icon || "tag", color: a.color || "#6b7280", budget_limit: a.budget_limit ? Number(a.budget_limit) : null });
          return { executed: true, message: `📂 **Categoria criada!** ${a.name}` };
        }
        case "edit_category": {
          const { data: cs } = await supabaseAdmin.from("categories").select("*").eq("user_id", userId);
          const c = (cs || []).find((c: any) => c.name.toLowerCase().includes((a.search || "").toLowerCase()));
          if (!c) return { executed: true, message: `❓ Categoria "${a.search}" não encontrada.` };
          const u: any = {}; if (a.field === "budget_limit") u.budget_limit = Number(a.new_value); else if (a.field === "name") u.name = a.new_value;
          await supabaseAdmin.from("categories").update(u).eq("id", c.id);
          return { executed: true, message: `✅ Categoria **${c.name}** atualizada!` };
        }
        case "add_card": {
          await supabaseAdmin.from("cards").insert({ user_id: userId, name: a.name, brand: a.brand || null, last_4_digits: a.last_4_digits || null, credit_limit: a.credit_limit ? Number(a.credit_limit) : null, due_day: a.due_day ? Number(a.due_day) : null });
          return { executed: true, message: `💳 **Cartão adicionado!** ${a.name}` };
        }
        case "edit_card": {
          const { data: cs } = await supabaseAdmin.from("cards").select("*").eq("user_id", userId);
          const c = (cs || []).find((c: any) => c.name.toLowerCase().includes((a.search || "").toLowerCase()));
          if (!c) return { executed: true, message: `❓ Cartão "${a.search}" não encontrado.` };
          const u: any = {}; if (a.field === "credit_limit") u.credit_limit = Number(a.new_value); else if (a.field === "due_day") u.due_day = Number(a.new_value);
          await supabaseAdmin.from("cards").update(u).eq("id", c.id);
          return { executed: true, message: `✅ Cartão **${c.name}** atualizado!` };
        }
        case "add_reminder": {
          let eventAt: string | null = null;
          if (a.date && a.time) eventAt = new Date(`${a.date}T${a.time}:00-03:00`).toISOString();
          else if (a.date) eventAt = new Date(`${a.date}T09:00:00-03:00`).toISOString();
          if (!eventAt || isNaN(new Date(eventAt).getTime())) return { executed: true, message: "❓ Não consegui entender a data/hora." };
          await supabaseAdmin.from("reminders").insert({ user_id: userId, title: a.title, event_at: eventAt, recurrence: a.recurrence || "none", notify_minutes_before: a.notify_minutes_before ?? 30, is_active: true, is_sent: false });
          const dt = new Date(eventAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
          return { executed: true, message: `🔔 **Lembrete criado!**\n\n📝 ${a.title}\n📅 ${dt}` };
        }
      }
    } catch (e) { console.error("Action error:", e); }
  }
  return { executed: false, message: "" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { messages, imageBase64, imageMimeType } = body;

    const GOOGLE_AI_KEY = Deno.env.get("GOOGLE_AI_KEY");
    if (!GOOGLE_AI_KEY) throw new Error("GOOGLE_AI_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    let financialContext = "";
    let userId: string | null = null;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (authHeader) {
      const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
      try {
        const { data: { user } } = await supabase.auth.getUser();
        userId = user?.id || null;
        financialContext = await getUserFinancialData(supabase);
      } catch (e) {
        console.error("Error fetching user data:", e);
        financialContext = "\n(Não foi possível carregar os dados financeiros)\n";
      }
    }

    const systemPrompt = `Você é o Brave IA 🤖, assessor financeiro pessoal. Responda em português brasileiro.

📋 FORMATAÇÃO: Use emojis, parágrafos curtos, markdown. Seja caloroso e pessoal.

💡 Capacidades executivas (responda SOMENTE com JSON quando executar):
- Registrar transações: {"action":"add_transaction","amount":50,"description":"Almoço","category":"Alimentação","type":"expense"}
- Criar metas: {"action":"add_goal","name":"Viagem","target_amount":5000,"deadline":"2026-06-30"}
- Aportar em meta: {"action":"deposit_goal","search":"Viagem","amount":200}
- Editar meta: {"action":"edit_goal","search":"Viagem","field":"target_amount","new_value":8000}
- Excluir meta: {"action":"delete_goal","search":"Viagem"}
- Criar carteira: {"action":"add_wallet","name":"Nubank","type":"checking","balance":0}
- Editar carteira: {"action":"edit_wallet","search":"Nubank","field":"balance","new_value":1500}
- Criar categoria: {"action":"add_category","name":"Pets","icon":"dog","budget_limit":300}
- Editar categoria: {"action":"edit_category","search":"Alimentação","field":"budget_limit","new_value":800}
- Adicionar cartão: {"action":"add_card","name":"Nubank","brand":"Visa","credit_limit":5000,"due_day":10}
- Editar cartão: {"action":"edit_card","search":"Nubank","field":"credit_limit","new_value":8000}
- Criar lembrete: {"action":"add_reminder","title":"Reunião","date":"2026-03-01","time":"15:00","recurrence":"none","notify_minutes_before":30}

💡 Capacidades consultivas (responda em texto):
- Analisar gastos, comparar meses, identificar padrões
- Dicas de economia, projeções de metas
- Analisar comprovantes em imagem

⚠️ Nunca invente dados. Use sempre os dados reais do contexto.

${financialContext}`;

    const processedMessages = [...messages];
    if (imageBase64 && imageMimeType && processedMessages.length > 0) {
      const lastMsg = processedMessages[processedMessages.length - 1];
      if (lastMsg.role === "user") {
        processedMessages[processedMessages.length - 1] = {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${imageMimeType};base64,${imageBase64}` } },
            { type: "text", text: lastMsg.content || "Analise este comprovante." },
          ],
        };
      }
    }

    // Check if message might trigger an action
    const lastContent = typeof processedMessages[processedMessages.length - 1]?.content === "string" ? processedMessages[processedMessages.length - 1].content : "";
    const actionKeywords = /gast|pagu|receb|comprei|almoc|uber|criar?\s+(meta|carteira|categoria|cart[aã]o|lembrete)|depositar|aportar|atualizar\s+saldo|adicionar\s+cart|mudar\s+or[cç]amento|lembrete|excluir|deletar|remover\s+meta/i;

    if (userId && actionKeywords.test(lastContent)) {
      const aiText = await callGemini({ model: "gemini-2.5-flash", systemPrompt, messages: processedMessages, temperature: 0.3 });
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      const result = await executeAction(supabaseAdmin, userId, aiText);

      const responseText = result.executed ? result.message : aiText;
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const chunkSize = 50;
          for (let i = 0; i < responseText.length; i += chunkSize) {
            const chunk = { choices: [{ delta: { content: responseText.slice(i, i + chunkSize) }, index: 0 }] };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
    }

    const geminiResp = await callGeminiStream({ model: "gemini-2.5-flash", systemPrompt, messages: processedMessages });
    return new Response(geminiStreamToOpenAI(geminiResp), { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
  } catch (e) {
    console.error("nylo-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
