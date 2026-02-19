import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendWhatsAppMessage(phone: string, message: string) {
  const UAZAPI_URL = Deno.env.get("UAZAPI_URL");
  const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");
  if (!UAZAPI_URL || !UAZAPI_TOKEN) throw new Error("UAZAPI credentials not configured");

  const resp = await fetch(`${UAZAPI_URL}/send/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: UAZAPI_TOKEN },
    body: JSON.stringify({ number: phone, text: message }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    console.error("UAZAPI send error:", resp.status, t);
  }
  return resp;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const notificationType: "morning" | "night" = body.type || "morning";

    // Get all users with WhatsApp linked and notifications enabled
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

    const startDate = new Date();
    startDate.setDate(1);
    const startStr = startDate.toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);

    let sent = 0;
    let skipped = 0;

    for (const profile of profiles ?? []) {
      const phone = linkedMap.get(profile.id);
      if (!phone) { skipped++; continue; }

      // Check notification preference
      if (notificationType === "morning" && !profile.notify_morning) { skipped++; continue; }
      if (notificationType === "night" && !profile.notify_night) { skipped++; continue; }

      // Fetch this month's transactions
      const { data: txs } = await supabase
        .from("transactions")
        .select("amount, type, description, date, categories(name)")
        .eq("user_id", profile.id)
        .gte("date", startStr)
        .lte("date", today);

      const transactions = txs || [];
      const totalExpense = transactions.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
      const totalIncome = transactions.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
      const saldo = totalIncome - totalExpense;
      const monthlyIncome = Number(profile.monthly_income) || 0;
      const pctUsed = monthlyIncome > 0 ? (totalExpense / monthlyIncome) * 100 : 0;
      const name = profile.display_name || "Usuário";

      const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      // Today's transactions
      const todayTxs = transactions.filter(t => t.date === today);
      const todayExpense = todayTxs.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);

      let message = "";

      if (notificationType === "morning") {
        const greeting = `☀️ Bom dia, ${name}!`;
        const summary = `💰 *Resumo do mês até hoje:*\n📈 Receitas: ${fmt(totalIncome)}\n📉 Despesas: ${fmt(totalExpense)}\n💳 Saldo: ${fmt(saldo)}`;
        const incomeInfo = monthlyIncome > 0 ? `\n🎯 Você usou ${pctUsed.toFixed(0)}% da sua renda mensal` : "";
        const tip = pctUsed > 80
          ? "\n\n⚠️ *Atenção:* Você já usou mais de 80% da sua renda. Cuidado com os gastos hoje!"
          : pctUsed > 50
          ? "\n\n💡 Já na metade do orçamento. Mantenha o foco!"
          : "\n\n✅ Você está no caminho certo. Bom dia produtivo!";

        message = `${greeting}\n\n${summary}${incomeInfo}${tip}\n\n_Brave IA - Seu assessor financeiro 🤖_`;
      } else {
        // Night summary
        const greeting = `🌙 Boa noite, ${name}!`;
        const todaySummary = todayTxs.length > 0
          ? `\n\n📋 *Hoje você registrou:*\n${todayTxs.slice(0, 3).map(t => `${t.type === "expense" ? "💸" : "💰"} ${(t as any).categories?.name || "Gasto"}: ${fmt(Number(t.amount))}`).join("\n")}${todayTxs.length > 3 ? `\n... e mais ${todayTxs.length - 3} transações` : ""}`
          : "\n\n📋 Nenhuma transação registrada hoje.";
        const todayTotal = todayExpense > 0 ? `\n\n💸 Total gasto hoje: *${fmt(todayExpense)}*` : "";
        const monthStatus = `\n\n📊 *No mês:* ${fmt(totalExpense)} gastos de ${fmt(monthlyIncome || totalIncome)} disponíveis`;
        const encouragement = saldo >= 0
          ? "\n\n🌟 Ótimo dia! Continue assim."
          : "\n\n💪 Amanhã é uma nova oportunidade de equilibrar.";

        message = `${greeting}${todaySummary}${todayTotal}${monthStatus}${encouragement}\n\n_Brave IA - Seu assessor financeiro 🤖_`;
      }

      try {
        await sendWhatsAppMessage(phone, message);
        sent++;
        console.log(`Sent ${notificationType} notification to ${phone} (user: ${profile.id})`);
      } catch (e) {
        console.error(`Failed to send to ${phone}:`, e);
        skipped++;
      }
    }

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
