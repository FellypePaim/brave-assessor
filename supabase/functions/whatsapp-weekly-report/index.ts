import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendWhatsAppMessage, getBrazilNow, fmt } from "../_shared/whatsapp-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 10;
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = getBrazilNow();

    // This week: Sunday to Saturday (current week ending today)
    const thisWeekEnd = new Date(now);
    thisWeekEnd.setHours(23, 59, 59, 999);
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - 6);
    thisWeekStart.setHours(0, 0, 0, 0);

    // Previous week: 7 days before
    const prevWeekEnd = new Date(thisWeekStart);
    prevWeekEnd.setMilliseconds(-1);
    const prevWeekStart = new Date(prevWeekEnd);
    prevWeekStart.setDate(prevWeekEnd.getDate() - 6);
    prevWeekStart.setHours(0, 0, 0, 0);

    const thisStart = thisWeekStart.toISOString().slice(0, 10);
    const thisEnd = thisWeekEnd.toISOString().slice(0, 10);
    const prevStart = prevWeekStart.toISOString().slice(0, 10);
    const prevEnd = prevWeekEnd.toISOString().slice(0, 10);

    // Get all users with WhatsApp linked
    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select("id, display_name, monthly_income");
    if (profErr) throw profErr;

    const { data: links, error: linkErr } = await supabase
      .from("whatsapp_links")
      .select("user_id, phone_number")
      .eq("verified", true)
      .not("phone_number", "is", null);
    if (linkErr) throw linkErr;

    const linkedMap = new Map(links?.map(l => [l.user_id, l.phone_number]) ?? []);
    const eligibleUsers = (profiles ?? []).filter(p => linkedMap.has(p.id));

    let sent = 0;
    let skipped = 0;

    for (let i = 0; i < eligibleUsers.length; i += BATCH_SIZE) {
      const batch = eligibleUsers.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (profile) => {
        const phone = linkedMap.get(profile.id)!;
        const name = profile.display_name || "Usuário";

        try {
          // Fetch both weeks in parallel
          const [thisWeekRes, prevWeekRes] = await Promise.all([
            supabase
              .from("transactions")
              .select("amount, type, description, date, categories(name)")
              .eq("user_id", profile.id)
              .gte("date", thisStart)
              .lte("date", thisEnd),
            supabase
              .from("transactions")
              .select("amount, type, description, date, categories(name)")
              .eq("user_id", profile.id)
              .gte("date", prevStart)
              .lte("date", prevEnd),
          ]);

          const thisTxs = thisWeekRes.data || [];
          const prevTxs = prevWeekRes.data || [];

          // This week stats
          const thisExpense = thisTxs.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
          const thisIncome = thisTxs.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
          const thisBalance = thisIncome - thisExpense;
          const thisTxCount = thisTxs.length;

          // Previous week stats
          const prevExpense = prevTxs.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
          const prevIncome = prevTxs.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
          const prevBalance = prevIncome - prevExpense;
          const prevTxCount = prevTxs.length;

          // Variation calculation
          const expenseVar = prevExpense > 0 ? ((thisExpense - prevExpense) / prevExpense) * 100 : 0;
          const incomeVar = prevIncome > 0 ? ((thisIncome - prevIncome) / prevIncome) * 100 : 0;

          const varIcon = (v: number) => v > 0 ? "📈" : v < 0 ? "📉" : "➡️";
          const varText = (v: number) => v !== 0 ? ` (${v >= 0 ? "+" : ""}${v.toFixed(1)}%)` : "";

          // Top categories this week
          const catMap = new Map<string, number>();
          thisTxs.filter(t => t.type === "expense").forEach(t => {
            const cat = (t as any).categories?.name || "Outros";
            catMap.set(cat, (catMap.get(cat) || 0) + Number(t.amount));
          });
          const topCats = [...catMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

          // Build message
          const lines: string[] = [];
          lines.push(`📊 *Relatório Semanal — ${name}*`);
          lines.push(`📅 ${thisStart.split("-").reverse().join("/")} a ${thisEnd.split("-").reverse().join("/")}`);
          lines.push("");
          lines.push(`━━━━━━━━━━━━━━━━━━`);
          lines.push(`💰 *Receitas:* ${fmt(thisIncome)} ${varIcon(incomeVar)}${varText(incomeVar)}`);
          lines.push(`💸 *Despesas:* ${fmt(thisExpense)} ${varIcon(-expenseVar)}${varText(expenseVar)}`);
          lines.push(`💳 *Saldo:* ${fmt(thisBalance)}`);
          lines.push(`📝 *Transações:* ${thisTxCount} (semana anterior: ${prevTxCount})`);
          lines.push(`━━━━━━━━━━━━━━━━━━`);

          // Comparison section
          lines.push("");
          lines.push(`🔄 *Comparativo com semana anterior:*`);
          if (prevExpense > 0 || prevIncome > 0) {
            lines.push(`• Receitas: ${fmt(prevIncome)} → ${fmt(thisIncome)}`);
            lines.push(`• Despesas: ${fmt(prevExpense)} → ${fmt(thisExpense)}`);
            lines.push(`• Saldo: ${fmt(prevBalance)} → ${fmt(thisBalance)}`);

            if (thisExpense < prevExpense) {
              lines.push(`\n✅ *Parabéns!* Você reduziu seus gastos em ${Math.abs(expenseVar).toFixed(1)}% esta semana!`);
            } else if (expenseVar > 20) {
              lines.push(`\n⚠️ *Atenção!* Seus gastos aumentaram ${expenseVar.toFixed(1)}%. Fique de olho!`);
            } else if (expenseVar > 0) {
              lines.push(`\n💡 Gastos subiram um pouco. Mantenha o controle!`);
            }
          } else {
            lines.push(`_Sem dados da semana anterior para comparar._`);
          }

          // Top categories
          if (topCats.length > 0) {
            lines.push("");
            lines.push(`🏷️ *Onde você mais gastou:*`);
            topCats.forEach(([cat, val], idx) => {
              const pct = thisExpense > 0 ? ((val / thisExpense) * 100).toFixed(0) : "0";
              const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "▪️";
              lines.push(`${medal} ${cat}: ${fmt(val)} (${pct}%)`);
            });
          }

          // Monthly progress
          const monthlyIncome = Number(profile.monthly_income) || 0;
          if (monthlyIncome > 0) {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
            const { data: monthTxs } = await supabase
              .from("transactions")
              .select("amount, type")
              .eq("user_id", profile.id)
              .eq("type", "expense")
              .gte("date", monthStart)
              .lte("date", thisEnd);

            const monthExpense = (monthTxs || []).reduce((s, t) => s + Number(t.amount), 0);
            const pctUsed = (monthExpense / monthlyIncome) * 100;
            lines.push("");
            lines.push(`📊 *Progresso mensal:* ${fmt(monthExpense)} de ${fmt(monthlyIncome)} (${pctUsed.toFixed(0)}%)`);
            const bar = "█".repeat(Math.min(Math.round(pctUsed / 10), 10)) + "░".repeat(Math.max(10 - Math.round(pctUsed / 10), 0));
            lines.push(`[${bar}] ${pctUsed.toFixed(0)}%`);
          }

          lines.push("");
          lines.push(`_Brave IA - Seu assessor financeiro 🤖_`);

          await sendWhatsAppMessage(phone, lines.join("\n"));
          sent++;
          console.log(`Weekly report sent to ${phone} (user: ${profile.id})`);
        } catch (e) {
          console.error(`Failed weekly report for ${profile.id}:`, e);
          skipped++;
        }
      }));

      if (i + BATCH_SIZE < eligibleUsers.length) {
        await delay(1000);
      }
    }

    skipped += (profiles ?? []).length - eligibleUsers.length;

    return new Response(
      JSON.stringify({ success: true, sent, skipped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("whatsapp-weekly-report error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
