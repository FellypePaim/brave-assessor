import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { callGemini, callGeminiStream, geminiStreamToOpenAI } from "../_shared/gemini-client.ts";
import { extractActionJson, normalizeAmount, cleanDescription, normalizeType, cleanSearchTerm } from "../_shared/ai-response-parser.ts";
import { autoCategorize } from "../_shared/auto-categorize.ts";

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
  const actionNames = [
    "add_transaction", "add_list", "add_recurring_list", "add_goal", "deposit_goal", "edit_goal",
    "delete_goal", "list_goals", "add_wallet", "edit_wallet", "delete_wallet",
    "list_wallets", "add_category", "edit_category", "delete_category", "list_categories",
    "add_card", "edit_card", "delete_card", "list_cards", "add_reminder",
    "delete_reminder", "edit_reminder", "list_reminders", "delete_transaction",
    "edit_transaction", "list_transactions", "list_recurring", "edit_recurring",
    "delete_recurring", "transfer_wallet", "update_profile", "pay_bill", "list_bills",
    "delete_all_reminders", "delete_all_transactions", "delete_all_cards",
    "delete_all_wallets", "delete_all_goals", "delete_all_categories",
    "delete_all_recurring", "reset_all_data",
  ];

  const fmt = (v: number) => `R$ ${v.toFixed(2)}`;

  // Use the robust shared parser to find the action
  let a: any = null;
  let h: string = "";
  for (const name of actionNames) {
    const found = extractActionJson(aiText, name);
    if (found) {
      a = found;
      h = name;
      break;
    }
  }
  if (!a) return { executed: false, message: "" };

  try {
      switch (h) {
        case "add_transaction": {
          const { data: cats } = await supabaseAdmin.from("categories").select("id, name").eq("user_id", userId);
          let cat = (cats || []).find((c: any) => c.name.toLowerCase() === (a.category || "").toLowerCase());
          // Fallback: keyword-based auto-categorization
          if (!cat && a.description) {
            cat = autoCategorize(a.description, cats || []);
          }
          // Support wallet/card selection
          let walletId: string | null = null;
          let cardId: string | null = null;
          if (a.wallet) {
            const { data: ws } = await supabaseAdmin.from("wallets").select("id, name, balance").eq("user_id", userId);
            const w = (ws || []).find((w: any) => w.name.toLowerCase().includes(a.wallet.toLowerCase()));
            if (w) walletId = w.id;
          }
          if (a.card) {
            const { data: cs } = await supabaseAdmin.from("cards").select("id, name").eq("user_id", userId);
            const c = (cs || []).find((c: any) => c.name.toLowerCase().includes(a.card.toLowerCase()));
            if (c) cardId = c.id;
          }
          if (!walletId && !a.wallet) {
            const { data: ws } = await supabaseAdmin.from("wallets").select("id, balance").eq("user_id", userId).order("created_at").limit(1);
            if (ws?.[0]) walletId = ws[0].id;
          }
          const txDate = a.date || new Date().toISOString().split("T")[0];
          await supabaseAdmin.from("transactions").insert({ user_id: userId, amount: Number(a.amount), description: a.description, type: a.type || "expense", category_id: cat?.id || null, wallet_id: walletId, card_id: cardId, date: txDate });
          if (walletId) {
            const { data: wData } = await supabaseAdmin.from("wallets").select("id, balance").eq("id", walletId).maybeSingle();
            if (wData) {
              const ch = a.type === "income" ? Number(a.amount) : -Number(a.amount);
              await supabaseAdmin.from("wallets").update({ balance: Number(wData.balance) + ch }).eq("id", wData.id);
            }
          }
          return { executed: true, message: `✅ **Transação registrada!**\n\n📝 ${a.description}\n💵 ${fmt(Number(a.amount))}\n📂 ${a.category || "Sem categoria"}${a.wallet ? `\n💳 ${a.wallet}` : ""}${a.card ? `\n💳 Cartão: ${a.card}` : ""}` };
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
        case "delete_reminder": {
          const { data: rs } = await supabaseAdmin.from("reminders").select("*").eq("user_id", userId).eq("is_active", true);
          const r = (rs || []).find((r: any) => r.title.toLowerCase().includes((a.search || "").toLowerCase()));
          if (!r) return { executed: true, message: `❓ Lembrete "${a.search}" não encontrado.` };
          await supabaseAdmin.from("reminders").delete().eq("id", r.id);
          return { executed: true, message: `🗑️ Lembrete **${r.title}** excluído!` };
        }
        case "edit_reminder": {
          const { data: rs } = await supabaseAdmin.from("reminders").select("*").eq("user_id", userId).eq("is_active", true);
          const r = (rs || []).find((r: any) => r.title.toLowerCase().includes((a.search || "").toLowerCase()));
          if (!r) return { executed: true, message: `❓ Lembrete "${a.search}" não encontrado.` };
          const u: any = {};
          if (a.field === "title") u.title = a.new_value;
          else if (a.field === "time" && a.new_value) {
            const cd = new Date(r.event_at); const [h, m] = a.new_value.split(":").map(Number);
            cd.setHours(h, m, 0, 0); u.event_at = cd.toISOString(); u.is_sent = false;
          } else if (a.field === "date" && a.new_value) {
            const ct = new Date(r.event_at);
            u.event_at = new Date(`${a.new_value}T${ct.getHours().toString().padStart(2,"0")}:${ct.getMinutes().toString().padStart(2,"0")}:00-03:00`).toISOString();
            u.is_sent = false;
          } else if (a.field === "recurrence") u.recurrence = a.new_value;
          if (Object.keys(u).length > 0) await supabaseAdmin.from("reminders").update(u).eq("id", r.id);
          return { executed: true, message: `✅ Lembrete **${r.title}** atualizado!` };
        }
        case "list_reminders": {
          const { data: rs } = await supabaseAdmin.from("reminders").select("*").eq("user_id", userId).eq("is_active", true).order("event_at").limit(10);
          if (!rs || rs.length === 0) return { executed: true, message: "📭 Nenhum lembrete ativo." };
          const list = rs.map((r: any, i: number) => {
            const dt = new Date(r.event_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
            const rec = r.recurrence !== "none" ? ` 🔁 ${r.recurrence}` : "";
            return `${i + 1}. 🔔 **${r.title}** — ${dt}${rec}`;
          }).join("\n");
          return { executed: true, message: `📋 **Seus lembretes:**\n\n${list}` };
        }
        case "list_goals": {
          const { data: gs } = await supabaseAdmin.from("financial_goals").select("*").eq("user_id", userId).order("created_at");
          if (!gs || gs.length === 0) return { executed: true, message: "📭 Nenhuma meta cadastrada." };
          const list = gs.map((g: any, i: number) => {
            const pct = ((Number(g.current_amount) / Number(g.target_amount)) * 100).toFixed(0);
            return `${i + 1}. 🎯 **${g.name}** — ${fmt(Number(g.current_amount))} / ${fmt(Number(g.target_amount))} (${pct}%)`;
          }).join("\n");
          return { executed: true, message: `🎯 **Suas metas:**\n\n${list}` };
        }
        case "list_wallets": {
          const { data: ws } = await supabaseAdmin.from("wallets").select("*").eq("user_id", userId).order("created_at");
          if (!ws || ws.length === 0) return { executed: true, message: "📭 Nenhuma carteira cadastrada." };
          const total = ws.reduce((s: number, w: any) => s + Number(w.balance), 0);
          const list = ws.map((w: any, i: number) => `${i + 1}. 💳 **${w.name}** (${w.type}) — ${fmt(Number(w.balance))}`).join("\n");
          return { executed: true, message: `💳 **Suas carteiras:**\n\n${list}\n\n💰 **Total: ${fmt(total)}**` };
        }
        case "delete_wallet": {
          const { data: ws } = await supabaseAdmin.from("wallets").select("*").eq("user_id", userId);
          const w = (ws || []).find((w: any) => w.name.toLowerCase().includes((a.search || "").toLowerCase()));
          if (!w) return { executed: true, message: `❓ Carteira "${a.search}" não encontrada.` };
          await supabaseAdmin.from("wallets").delete().eq("id", w.id);
          return { executed: true, message: `🗑️ Carteira **${w.name}** excluída!` };
        }
        case "list_categories": {
          const { data: cs } = await supabaseAdmin.from("categories").select("*").eq("user_id", userId).order("name");
          if (!cs || cs.length === 0) return { executed: true, message: "📭 Nenhuma categoria cadastrada." };
          const list = cs.map((c: any, i: number) => {
            const budget = c.budget_limit ? ` · Limite: ${fmt(Number(c.budget_limit))}` : "";
            return `${i + 1}. 📂 **${c.name}**${budget}`;
          }).join("\n");
          return { executed: true, message: `📂 **Suas categorias:**\n\n${list}` };
        }
        case "delete_category": {
          const { data: cs } = await supabaseAdmin.from("categories").select("*").eq("user_id", userId);
          const c = (cs || []).find((c: any) => c.name.toLowerCase().includes((a.search || "").toLowerCase()));
          if (!c) return { executed: true, message: `❓ Categoria "${a.search}" não encontrada.` };
          await supabaseAdmin.from("categories").delete().eq("id", c.id);
          return { executed: true, message: `🗑️ Categoria **${c.name}** excluída!` };
        }
        case "list_cards": {
          const { data: cs } = await supabaseAdmin.from("cards").select("*").eq("user_id", userId).order("created_at");
          if (!cs || cs.length === 0) return { executed: true, message: "📭 Nenhum cartão cadastrado." };
          const list = cs.map((c: any, i: number) => {
            const digits = c.last_4_digits ? ` (****${c.last_4_digits})` : "";
            const limit = c.credit_limit ? ` · Limite: ${fmt(Number(c.credit_limit))}` : "";
            return `${i + 1}. 💳 **${c.name}**${digits}${limit}`;
          }).join("\n");
          return { executed: true, message: `💳 **Seus cartões:**\n\n${list}` };
        }
        case "delete_card": {
          const { data: cs } = await supabaseAdmin.from("cards").select("*").eq("user_id", userId);
          const c = (cs || []).find((c: any) => c.name.toLowerCase().includes((a.search || "").toLowerCase()));
          if (!c) return { executed: true, message: `❓ Cartão "${a.search}" não encontrado.` };
          await supabaseAdmin.from("cards").delete().eq("id", c.id);
          return { executed: true, message: `🗑️ Cartão **${c.name}** excluído!` };
        }
        case "delete_transaction": {
          const { data: ts } = await supabaseAdmin.from("transactions").select("id, description, amount, type, date, wallet_id")
            .eq("user_id", userId).order("date", { ascending: false }).limit(20);
          const t = (ts || []).find((t: any) => t.description.toLowerCase().includes((a.search || "").toLowerCase()));
          if (!t) return { executed: true, message: `❓ Transação "${a.search}" não encontrada.` };
          if (t.wallet_id) {
            const { data: w } = await supabaseAdmin.from("wallets").select("id, balance").eq("id", t.wallet_id).maybeSingle();
            if (w) {
              const change = t.type === "income" ? -Number(t.amount) : Number(t.amount);
              await supabaseAdmin.from("wallets").update({ balance: Number(w.balance) + change }).eq("id", w.id);
            }
          }
          await supabaseAdmin.from("transactions").delete().eq("id", t.id);
          return { executed: true, message: `🗑️ Transação **${t.description}** (${fmt(Number(t.amount))}) excluída! Saldo atualizado.` };
        }
        case "edit_transaction": {
          const { data: ts } = await supabaseAdmin.from("transactions").select("id, description, amount, type, date, wallet_id, category_id")
            .eq("user_id", userId).order("date", { ascending: false }).limit(20);
          const t = (ts || []).find((t: any) => t.description.toLowerCase().includes((a.search || "").toLowerCase()));
          if (!t) return { executed: true, message: `❓ Transação "${a.search}" não encontrada.` };
          const u: any = {};
          if (a.field === "amount") {
            const oldAmount = Number(t.amount);
            const newAmount = Number(a.new_value);
            u.amount = newAmount;
            if (t.wallet_id) {
              const { data: w } = await supabaseAdmin.from("wallets").select("id, balance").eq("id", t.wallet_id).maybeSingle();
              if (w) {
                const diff = t.type === "income" ? (newAmount - oldAmount) : (oldAmount - newAmount);
                await supabaseAdmin.from("wallets").update({ balance: Number(w.balance) + diff }).eq("id", w.id);
              }
            }
          } else if (a.field === "description") u.description = a.new_value;
          else if (a.field === "category") {
            const { data: cats } = await supabaseAdmin.from("categories").select("id, name").eq("user_id", userId);
            const cat = (cats || []).find((c: any) => c.name.toLowerCase().includes(String(a.new_value).toLowerCase()));
            if (cat) u.category_id = cat.id;
          } else if (a.field === "type") u.type = a.new_value;
          if (Object.keys(u).length > 0) await supabaseAdmin.from("transactions").update(u).eq("id", t.id);
          return { executed: true, message: `✅ Transação **${t.description}** atualizada!` };
        }
        case "list_transactions": {
          const { data: ts } = await supabaseAdmin.from("transactions").select("description, amount, type, date, categories(name)")
            .eq("user_id", userId).order("date", { ascending: false }).limit(10);
          if (!ts || ts.length === 0) return { executed: true, message: "📭 Nenhuma transação recente." };
          const list = ts.map((t: any, i: number) => {
            const emoji = t.type === "income" ? "💰" : "💸";
            const cat = (t as any).categories?.name || "";
            return `${i + 1}. ${emoji} **${t.description}** — ${fmt(Number(t.amount))} · ${new Date(t.date + "T12:00:00").toLocaleDateString("pt-BR")}${cat ? ` · ${cat}` : ""}`;
          }).join("\n");
          return { executed: true, message: `📋 **Últimas transações:**\n\n${list}` };
        }
        case "list_recurring": {
          const { data: rs } = await supabaseAdmin.from("recurring_transactions").select("*").eq("user_id", userId).eq("is_active", true).order("day_of_month");
          if (!rs || rs.length === 0) return { executed: true, message: "📭 Nenhuma recorrência ativa." };
          const total = rs.reduce((s: number, r: any) => s + Number(r.amount), 0);
          const list = rs.map((r: any, i: number) => {
            const emoji = r.type === "income" ? "💰" : "💸";
            return `${i + 1}. ${emoji} **${r.description}** — ${fmt(Number(r.amount))} · dia ${r.day_of_month}`;
          }).join("\n");
          return { executed: true, message: `🔄 **Recorrências ativas:**\n\n${list}\n\n💸 **Total mensal: ${fmt(total)}**` };
        }
        case "edit_recurring": {
          const { data: rs } = await supabaseAdmin.from("recurring_transactions").select("*").eq("user_id", userId).eq("is_active", true);
          const r = (rs || []).find((r: any) => r.description.toLowerCase().includes((a.search || "").toLowerCase()));
          if (!r) return { executed: true, message: `❓ Recorrência "${a.search}" não encontrada.` };
          const u: any = {};
          if (a.field === "amount") u.amount = Number(a.new_value);
          else if (a.field === "description") u.description = a.new_value;
          else if (a.field === "day_of_month") u.day_of_month = Number(a.new_value);
          if (Object.keys(u).length > 0) await supabaseAdmin.from("recurring_transactions").update(u).eq("id", r.id);
          return { executed: true, message: `✅ Recorrência **${r.description}** atualizada!` };
        }
        case "delete_recurring": {
          const { data: rs } = await supabaseAdmin.from("recurring_transactions").select("*").eq("user_id", userId).eq("is_active", true);
          const r = (rs || []).find((r: any) => r.description.toLowerCase().includes((a.search || "").toLowerCase()));
          if (!r) return { executed: true, message: `❓ Recorrência "${a.search}" não encontrada.` };
          await supabaseAdmin.from("recurring_transactions").update({ is_active: false }).eq("id", r.id);
          return { executed: true, message: `🗑️ Recorrência **${r.description}** desativada!` };
        }
        case "transfer_wallet": {
          const { data: ws } = await supabaseAdmin.from("wallets").select("*").eq("user_id", userId);
          const from = (ws || []).find((w: any) => w.name.toLowerCase().includes((a.from || "").toLowerCase()));
          const to = (ws || []).find((w: any) => w.name.toLowerCase().includes((a.to || "").toLowerCase()));
          if (!from) return { executed: true, message: `❓ Carteira de origem "${a.from}" não encontrada.` };
          if (!to) return { executed: true, message: `❓ Carteira de destino "${a.to}" não encontrada.` };
          const amount = Number(a.amount);
          if (Number(from.balance) < amount) return { executed: true, message: `❌ Saldo insuficiente em **${from.name}** (${fmt(Number(from.balance))}).` };
          await supabaseAdmin.from("wallets").update({ balance: Number(from.balance) - amount }).eq("id", from.id);
          await supabaseAdmin.from("wallets").update({ balance: Number(to.balance) + amount }).eq("id", to.id);
          return { executed: true, message: `🔄 **Transferência realizada!**\n\n💳 ${from.name} → ${to.name}\n💵 ${fmt(amount)}\n\n📊 ${from.name}: ${fmt(Number(from.balance) - amount)}\n📊 ${to.name}: ${fmt(Number(to.balance) + amount)}` };
        }
        case "update_profile": {
          const u: any = {};
          if (a.field === "monthly_income") u.monthly_income = Number(a.new_value);
          else if (a.field === "display_name") u.display_name = a.new_value;
          if (Object.keys(u).length > 0) await supabaseAdmin.from("profiles").update(u).eq("id", userId);
          const label = a.field === "monthly_income" ? `Renda mensal atualizada para ${fmt(Number(a.new_value))}` : `Nome atualizado para **${a.new_value}**`;
          return { executed: true, message: `✅ ${label}` };
        }
        case "pay_bill": {
          const { data: ts } = await supabaseAdmin.from("transactions").select("id, description, amount, type, wallet_id, due_date")
            .eq("user_id", userId).eq("is_paid", false).eq("type", "expense").order("due_date").limit(20);
          const t = (ts || []).find((t: any) => t.description.toLowerCase().includes((a.search || "").toLowerCase()));
          if (!t) return { executed: true, message: `❓ Conta "${a.search}" não encontrada entre as pendentes.` };
          await supabaseAdmin.from("transactions").update({ is_paid: true }).eq("id", t.id);
          if (t.wallet_id) {
            const { data: w } = await supabaseAdmin.from("wallets").select("id, balance").eq("id", t.wallet_id).maybeSingle();
            if (w) await supabaseAdmin.from("wallets").update({ balance: Number(w.balance) - Number(t.amount) }).eq("id", w.id);
          }
          return { executed: true, message: `✅ Conta **${t.description}** (${fmt(Number(t.amount))}) marcada como paga!` };
        }
        case "list_bills": {
          const { data: ts } = await supabaseAdmin.from("transactions").select("description, amount, due_date, categories(name)")
            .eq("user_id", userId).eq("is_paid", false).eq("type", "expense").order("due_date").limit(15);
          if (!ts || ts.length === 0) return { executed: true, message: "✅ Nenhuma conta pendente! Tudo em dia! 🎉" };
          const total = ts.reduce((s: number, t: any) => s + Number(t.amount), 0);
          const list = ts.map((t: any, i: number) => {
            const due = t.due_date ? new Date(t.due_date + "T12:00:00").toLocaleDateString("pt-BR") : "sem vencimento";
            return `${i + 1}. 📋 **${t.description}** — ${fmt(Number(t.amount))} · vence ${due}`;
          }).join("\n");
          return { executed: true, message: `📋 **Contas a pagar:**\n\n${list}\n\n💸 **Total: ${fmt(total)}**` };
        }
        case "delete_all_reminders": {
          const { count } = await supabaseAdmin.from("reminders").select("id", { count: "exact", head: true }).eq("user_id", userId);
          if (!count || count === 0) return { executed: true, message: "📭 Nenhum lembrete para apagar." };
          await supabaseAdmin.from("reminders").delete().eq("user_id", userId);
          return { executed: true, message: `🗑️ **${count} lembretes apagados!**` };
        }
        case "delete_all_transactions": {
          const { data: txs } = await supabaseAdmin.from("transactions").select("amount, type, wallet_id").eq("user_id", userId);
          if (!txs || txs.length === 0) return { executed: true, message: "📭 Nenhuma transação para apagar." };
          // Restore wallet balances
          const walletChanges: Record<string, number> = {};
          for (const tx of txs) {
            if (tx.wallet_id) {
              if (!walletChanges[tx.wallet_id]) walletChanges[tx.wallet_id] = 0;
              walletChanges[tx.wallet_id] += tx.type === "income" ? -Number(tx.amount) : Number(tx.amount);
            }
          }
          for (const [wid, change] of Object.entries(walletChanges)) {
            const { data: w } = await supabaseAdmin.from("wallets").select("id, balance").eq("id", wid).maybeSingle();
            if (w) await supabaseAdmin.from("wallets").update({ balance: Number(w.balance) + change }).eq("id", w.id);
          }
          await supabaseAdmin.from("transactions").delete().eq("user_id", userId);
          return { executed: true, message: `🗑️ **${txs.length} transações apagadas!** Saldos das carteiras revertidos.` };
        }
        case "delete_all_cards": {
          await supabaseAdmin.from("cards").delete().eq("user_id", userId);
          return { executed: true, message: "🗑️ **Todos os cartões foram apagados!**" };
        }
        case "delete_all_wallets": {
          await supabaseAdmin.from("wallets").delete().eq("user_id", userId);
          return { executed: true, message: "🗑️ **Todas as carteiras foram apagadas!**" };
        }
        case "delete_all_goals": {
          await supabaseAdmin.from("financial_goals").delete().eq("user_id", userId);
          return { executed: true, message: "🗑️ **Todas as metas foram apagadas!**" };
        }
        case "delete_all_categories": {
          await supabaseAdmin.from("categories").delete().eq("user_id", userId);
          return { executed: true, message: "🗑️ **Todas as categorias foram apagadas!**" };
        }
        case "delete_all_recurring": {
          await supabaseAdmin.from("recurring_transactions").delete().eq("user_id", userId);
          return { executed: true, message: "🗑️ **Todas as recorrências foram apagadas!**" };
        }
        case "reset_all_data": {
          await supabaseAdmin.from("reminders").delete().eq("user_id", userId);
          await supabaseAdmin.from("transactions").delete().eq("user_id", userId);
          await supabaseAdmin.from("cards").delete().eq("user_id", userId);
          await supabaseAdmin.from("financial_goals").delete().eq("user_id", userId);
          await supabaseAdmin.from("recurring_transactions").delete().eq("user_id", userId);
          await supabaseAdmin.from("wallets").delete().eq("user_id", userId);
          await supabaseAdmin.from("categories").delete().eq("user_id", userId);
          return { executed: true, message: "🗑️ **Todos os dados financeiros foram resetados!** Lembretes, transações, carteiras, cartões, metas, categorias e recorrências foram apagados." };
        }
      }
  } catch (e) { console.error("Action error:", e); }
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
- Com carteira específica: {"action":"add_transaction","amount":50,"description":"Almoço","category":"Alimentação","type":"expense","wallet":"Nubank"}
- Com cartão específico: {"action":"add_transaction","amount":50,"description":"Almoço","category":"Alimentação","type":"expense","card":"Visa"}
- Com data específica: {"action":"add_transaction","amount":50,"description":"Almoço","category":"Alimentação","type":"expense","date":"2026-02-26"}
- Editar transação: {"action":"edit_transaction","search":"Almoço","field":"amount","new_value":60}
- Excluir transação: {"action":"delete_transaction","search":"Almoço"}
- Listar transações: {"action":"list_transactions"}
- Criar metas: {"action":"add_goal","name":"Viagem","target_amount":5000,"deadline":"2026-06-30"}
- Aportar em meta: {"action":"deposit_goal","search":"Viagem","amount":200}
- Editar meta: {"action":"edit_goal","search":"Viagem","field":"target_amount","new_value":8000}
- Excluir meta: {"action":"delete_goal","search":"Viagem"}
- Listar metas: {"action":"list_goals"}
- Criar carteira: {"action":"add_wallet","name":"Nubank","type":"checking","balance":0}
- Editar carteira: {"action":"edit_wallet","search":"Nubank","field":"balance","new_value":1500}
- Excluir carteira: {"action":"delete_wallet","search":"Nubank"}
- Listar carteiras: {"action":"list_wallets"}
- Transferir entre carteiras: {"action":"transfer_wallet","from":"Nubank","to":"Inter","amount":500}
- Criar categoria: {"action":"add_category","name":"Pets","icon":"dog","budget_limit":300}
- Editar categoria: {"action":"edit_category","search":"Alimentação","field":"budget_limit","new_value":800}
- Excluir categoria: {"action":"delete_category","search":"Pets"}
- Listar categorias: {"action":"list_categories"}
- Adicionar cartão: {"action":"add_card","name":"Nubank","brand":"Visa","credit_limit":5000,"due_day":10}
- Editar cartão: {"action":"edit_card","search":"Nubank","field":"credit_limit","new_value":8000}
- Excluir cartão: {"action":"delete_card","search":"Nubank"}
- Listar cartões: {"action":"list_cards"}
- Criar lembrete: {"action":"add_reminder","title":"Reunião","date":"2026-03-01","time":"15:00","recurrence":"none","notify_minutes_before":30}
- Excluir lembrete: {"action":"delete_reminder","search":"Reunião"}
- Editar lembrete: {"action":"edit_reminder","search":"Reunião","field":"time","new_value":"16:00"}
- Listar lembretes: {"action":"list_reminders"}
- Listar recorrências: {"action":"list_recurring"}
- Editar recorrência: {"action":"edit_recurring","search":"Netflix","field":"amount","new_value":45}
- Cancelar recorrência: {"action":"delete_recurring","search":"Netflix"}
- Atualizar perfil: {"action":"update_profile","field":"monthly_income","new_value":5000}
- Marcar conta como paga: {"action":"pay_bill","search":"Energia"}
- Listar contas a pagar: {"action":"list_bills"}
- Apagar todos lembretes: {"action":"delete_all_reminders"}
- Apagar todas transações: {"action":"delete_all_transactions"}
- Apagar todos cartões: {"action":"delete_all_cards"}
- Apagar todas carteiras: {"action":"delete_all_wallets"}
- Apagar todas metas: {"action":"delete_all_goals"}
- Apagar todas categorias: {"action":"delete_all_categories"}
- Apagar todas recorrências: {"action":"delete_all_recurring"}
- Resetar tudo: {"action":"reset_all_data"}

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
    const actionKeywords = /gast|pagu|receb|comprei|almoc|uber|criar?\s+(meta|carteira|categoria|cart[aã]o|lembrete)|depositar|aportar|atualizar\s+saldo|adicionar\s+cart|mudar\s+or[cç]amento|lembrete|excluir|deletar|remover|apagar|listar|minhas?\s+(metas?|carteiras?|categorias?|cart[oõ]es|lembretes?|transa[cç][oõ]es|recorr[eê]ncias?|contas?)|meus\s+(cart[oõ]es|lembretes?|gastos?)|transfer|mover\s+\d|minha\s+renda|mudar\s+(?:meu\s+)?nome|contas?\s+(?:a\s+)?pag|pend[eê]nt|marcar\s+.+pag|[uú]ltim.+gast|extrato\s+recente|recorr[eê]nc|reset|zerar|limpar\s+tudo|apagar\s+tud/i;

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
