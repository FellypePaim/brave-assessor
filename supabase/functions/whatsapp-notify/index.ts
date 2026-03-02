import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendWhatsAppMessage, getBrazilNow } from "../_shared/whatsapp-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 10;
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const notificationType: "morning" | "night" = body.type || "morning";

    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select("id, display_name, monthly_income, notify_morning, notify_night");
    if (profErr) throw profErr;

    const { data: links, error: linkErr } = await supabase
      .from("whatsapp_links")
      .select("user_id, phone_number")
      .eq("verified", true)
      .not("phone_number", "is", null);
    if (linkErr) throw linkErr;

    const linkedMap = new Map(links?.map(l => [l.user_id, l.phone_number]) ?? []);
    const nowBR = getBrazilNow();
    const todayBR = nowBR.toISOString().slice(0, 10);
    const startDate = new Date(nowBR);
    startDate.setDate(1);
    const startStr = startDate.toISOString().slice(0, 10);

    let sent = 0;
    let skipped = 0;

    const eligibleUsers = (profiles ?? []).filter(profile => {
      const phone = linkedMap.get(profile.id);
      if (!phone) return false;
      if (notificationType === "morning" && !profile.notify_morning) return false;
      if (notificationType === "night" && !profile.notify_night) return false;
      return true;
    });

    for (let i = 0; i < eligibleUsers.length; i += BATCH_SIZE) {
      const batch = eligibleUsers.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (profile) => {
        const phone = linkedMap.get(profile.id)!;
        const name = profile.display_name || "Usuário";

        try {
          const { data: txs } = await supabase
            .from("transactions")
            .select("amount, type, description, date, due_date, is_paid, categories(name)")
            .eq("user_id", profile.id)
            .gte("date", startStr)
            .lte("date", todayBR);

          const transactions = txs || [];
          const totalExpense = transactions.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
          const totalIncome = transactions.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
          const saldo = totalIncome - totalExpense;
          const monthlyIncome = Number(profile.monthly_income) || 0;
          const pctUsed = monthlyIncome > 0 ? (totalExpense / monthlyIncome) * 100 : 0;

          const todayTxs = transactions.filter(t => t.date === todayBR);
          const todayExpense = todayTxs.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);

          let message = "";

          if (notificationType === "morning") {
            message = await buildMorningMessage(supabase, profile.id, name, totalIncome, totalExpense, saldo, monthlyIncome, pctUsed, nowBR, todayBR);
          } else {
            message = await buildNightMessage(name, totalExpense, totalIncome, saldo, monthlyIncome, pctUsed, todayTxs, todayExpense);
          }

          await sendWhatsAppMessage(phone, message);
          sent++;
        } catch (e) {
          console.error(`Failed to send to ${linkedMap.get(profile.id)}:`, e);
          skipped++;
        }
      }));

      if (i + BATCH_SIZE < eligibleUsers.length) await delay(1000);
    }

    skipped += (profiles ?? []).length - eligibleUsers.length;

    return new Response(
      JSON.stringify({ success: true, sent, skipped, type: notificationType }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("whatsapp-notify error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ── Morning Message Builder ──
async function buildMorningMessage(
  supabase: any, userId: string, name: string,
  totalIncome: number, totalExpense: number, saldo: number,
  monthlyIncome: number, pctUsed: number, nowBR: Date, todayBR: string,
): Promise<string> {
  const lines: string[] = [];

  // Greeting
  lines.push(`☀️ Bom dia, *${name}*!`);

  // Monthly snapshot
  lines.push(`📊 *Mês atual:*`);
  lines.push(`📈 ${fmt(totalIncome)} receitas · 📉 ${fmt(totalExpense)} despesas`);
  lines.push(`💳 Saldo: *${fmt(saldo)}*${monthlyIncome > 0 ? ` · 🎯 ${pctUsed.toFixed(0)}% usado` : ""}`);

  // Bills due today/tomorrow
  const tomorrow = new Date(nowBR);
  tomorrow.setDate(nowBR.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const { data: dueBills } = await supabase
    .from("transactions")
    .select("description, amount, due_date")
    .eq("user_id", userId)
    .eq("type", "expense")
    .eq("is_paid", false)
    .gte("due_date", todayBR)
    .lte("due_date", tomorrowStr)
    .order("due_date", { ascending: true })
    .limit(4);

  // Recurring due today/tomorrow
  const { data: recurringList } = await supabase
    .from("recurring_transactions")
    .select("description, amount, day_of_month")
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("type", "expense");

  const dueItems: { desc: string; amount: number; label: string }[] = [];

  if (dueBills) {
    for (const b of dueBills) {
      dueItems.push({
        desc: b.description,
        amount: Number(b.amount),
        label: b.due_date === todayBR ? "hoje" : "amanhã",
      });
    }
  }

  for (const r of recurringList || []) {
    let dueDate = new Date(nowBR.getFullYear(), nowBR.getMonth(), r.day_of_month);
    if (dueDate.getTime() < new Date(nowBR.getFullYear(), nowBR.getMonth(), nowBR.getDate()).getTime()) {
      dueDate = new Date(nowBR.getFullYear(), nowBR.getMonth() + 1, r.day_of_month);
    }
    const ds = dueDate.toISOString().slice(0, 10);
    if (ds === todayBR || ds === tomorrowStr) {
      dueItems.push({ desc: r.description, amount: Number(r.amount), label: ds === todayBR ? "hoje" : "amanhã" });
    }
  }

  if (dueItems.length > 0) {
    lines.push(`📋 *Pendências:*`);
    for (const item of dueItems.slice(0, 4)) {
      const icon = item.label === "hoje" ? "🔴" : "🟡";
      lines.push(`${icon} ${item.desc} · ${fmt(item.amount)} · ${item.label}`);
    }
    if (dueItems.length > 4) lines.push(`+${dueItems.length - 4} itens`);
  }

  // Quick tip
  const tip = pctUsed > 80
    ? `⚠️ Mais de 80% da renda usada. Fique de olho!`
    : pctUsed > 50
    ? `💡 Metade do orçamento consumido. Mantenha o foco!`
    : `✅ Orçamento sob controle. Bom dia!`;
  lines.push(tip);

  lines.push(`_Brave IA 🤖_`);
  return lines.join("\n");
}

// ── Night Message Builder ──
async function buildNightMessage(
  name: string, totalExpense: number, totalIncome: number,
  saldo: number, monthlyIncome: number, pctUsed: number,
  todayTxs: any[], todayExpense: number,
): Promise<string> {
  const lines: string[] = [];

  lines.push(`🌙 Boa noite, *${name}*!`);

  if (todayTxs.length > 0) {
    lines.push(`📋 *Hoje:*`);
    for (const t of todayTxs.slice(0, 3)) {
      const icon = t.type === "expense" ? "💸" : "💰";
      const cat = (t as any).categories?.name || "Geral";
      lines.push(`${icon} ${cat}: ${fmt(Number(t.amount))}`);
    }
    if (todayTxs.length > 3) lines.push(`+${todayTxs.length - 3} transações`);
    if (todayExpense > 0) lines.push(`💸 Total do dia: *${fmt(todayExpense)}*`);
  } else {
    lines.push(`📋 Nenhuma movimentação hoje.`);
  }

  lines.push(`📊 Mês: ${fmt(totalExpense)} de ${fmt(monthlyIncome || totalIncome)}`);

  // AI tip
  try {
    const aiTip = await generateAITip(name, totalExpense, totalIncome, saldo, pctUsed, monthlyIncome, todayExpense, todayTxs.length);
    if (aiTip) {
      lines.push(`🤖 *Dica:* ${aiTip}`);
    } else {
      lines.push(saldo >= 0 ? `🌟 Dia positivo. Continue assim!` : `💪 Amanhã é uma nova chance de equilibrar.`);
    }
  } catch {
    lines.push(saldo >= 0 ? `🌟 Dia positivo. Continue assim!` : `💪 Amanhã é uma nova chance de equilibrar.`);
  }

  lines.push(`_Brave IA 🤖_`);
  return lines.join("\n");
}

// ── AI Tip Generator ──
async function generateAITip(
  name: string, totalExpense: number, totalIncome: number,
  saldo: number, pctUsed: number, monthlyIncome: number,
  todayExpense: number, todayTxCount: number,
): Promise<string | null> {
  const GOOGLE_AI_KEY = Deno.env.get("GOOGLE_AI_KEY");
  if (!GOOGLE_AI_KEY) return null;

  const prompt = `Você é a Brave IA. Dê UMA dica financeira em no máximo 1 frase curta e prática.
Dados: gastos mês R$${totalExpense.toFixed(0)}, receitas R$${totalIncome.toFixed(0)}, saldo R$${saldo.toFixed(0)}, renda R$${monthlyIncome.toFixed(0)}, ${pctUsed.toFixed(0)}% usado, gasto hoje R$${todayExpense.toFixed(0)}, ${todayTxCount} transações.
Regras: sem emoji, informal, motivador, máximo 15 palavras.`;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_AI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 150, temperature: 0.8 },
      }),
    },
  );

  if (!resp.ok) return null;
  const data = await resp.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}
