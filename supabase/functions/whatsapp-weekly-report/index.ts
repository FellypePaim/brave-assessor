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

    const thisWeekEnd = new Date(now); thisWeekEnd.setHours(23, 59, 59, 999);
    const thisWeekStart = new Date(now); thisWeekStart.setDate(now.getDate() - 6); thisWeekStart.setHours(0, 0, 0, 0);
    const prevWeekEnd = new Date(thisWeekStart); prevWeekEnd.setMilliseconds(-1);
    const prevWeekStart = new Date(prevWeekEnd); prevWeekStart.setDate(prevWeekEnd.getDate() - 6); prevWeekStart.setHours(0, 0, 0, 0);

    const thisStart = thisWeekStart.toISOString().slice(0, 10);
    const thisEnd = thisWeekEnd.toISOString().slice(0, 10);
    const prevStart = prevWeekStart.toISOString().slice(0, 10);
    const prevEnd = prevWeekEnd.toISOString().slice(0, 10);

    const fmtDate = (d: string) => d.split("-").reverse().join("/");

    const { data: profiles, error: profErr } = await supabase
      .from("profiles").select("id, display_name, monthly_income");
    if (profErr) throw profErr;

    const { data: links, error: linkErr } = await supabase
      .from("whatsapp_links").select("user_id, phone_number").eq("verified", true).not("phone_number", "is", null);
    if (linkErr) throw linkErr;

    const linkedMap = new Map(links?.map(l => [l.user_id, l.phone_number]) ?? []);
    const eligibleUsers = (profiles ?? []).filter(p => linkedMap.has(p.id));

    let sent = 0, skipped = 0;

    for (let i = 0; i < eligibleUsers.length; i += BATCH_SIZE) {
      const batch = eligibleUsers.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (profile) => {
        const phone = linkedMap.get(profile.id)!;
        const name = profile.display_name || "Usuário";

        try {
          const [thisWeekRes, prevWeekRes] = await Promise.all([
            supabase.from("transactions").select("amount, type, categories(name)")
              .eq("user_id", profile.id).gte("date", thisStart).lte("date", thisEnd),
            supabase.from("transactions").select("amount, type")
              .eq("user_id", profile.id).gte("date", prevStart).lte("date", prevEnd),
          ]);

          const thisTxs = thisWeekRes.data || [];
          const prevTxs = prevWeekRes.data || [];

          const thisExpense = thisTxs.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
          const thisIncome = thisTxs.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
          const prevExpense = prevTxs.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);

          const expenseVar = prevExpense > 0 ? ((thisExpense - prevExpense) / prevExpense) * 100 : 0;

          // Top 3 categories
          const catMap = new Map<string, number>();
          thisTxs.filter(t => t.type === "expense").forEach(t => {
            const cat = (t as any).categories?.name || "Outros";
            catMap.set(cat, (catMap.get(cat) || 0) + Number(t.amount));
          });
          const topCats = [...catMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

          const lines: string[] = [];
          lines.push(`📊 *Semana ${fmtDate(thisStart)} a ${fmtDate(thisEnd)}*`);
          lines.push(`Olá, *${name}*!`);
          lines.push(`📈 ${fmt(thisIncome)} receitas · 📉 ${fmt(thisExpense)} despesas`);
          lines.push(`💳 Saldo: *${fmt(thisIncome - thisExpense)}*`);

          // Comparison
          if (prevExpense > 0) {
            const icon = thisExpense < prevExpense ? "✅" : thisExpense > prevExpense ? "⚠️" : "➡️";
            lines.push(`${icon} Despesas ${thisExpense < prevExpense ? "reduziram" : "subiram"} ${Math.abs(expenseVar).toFixed(0)}% vs semana anterior`);
          }

          // Top categories
          if (topCats.length > 0) {
            const medals = ["🥇", "🥈", "🥉"];
            lines.push(`🏷️ *Top gastos:*`);
            topCats.forEach(([cat, val], idx) => {
              lines.push(`${medals[idx]} ${cat}: ${fmt(val)}`);
            });
          }

          // Monthly progress
          const monthlyIncome = Number(profile.monthly_income) || 0;
          if (monthlyIncome > 0) {
            const monthStartStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
            const { data: monthTxs } = await supabase
              .from("transactions").select("amount")
              .eq("user_id", profile.id).eq("type", "expense")
              .gte("date", monthStartStr).lte("date", thisEnd);
            const monthExp = (monthTxs || []).reduce((s, t) => s + Number(t.amount), 0);
            const pct = (monthExp / monthlyIncome) * 100;
            const bar = "█".repeat(Math.min(Math.round(pct / 10), 10)) + "░".repeat(Math.max(10 - Math.round(pct / 10), 0));
            lines.push(`📊 Mês: [${bar}] ${pct.toFixed(0)}%`);
          }

          lines.push(`_Brave IA 🤖_`);
          await sendWhatsAppMessage(phone, lines.join("\n"));
          sent++;
        } catch (e) {
          console.error(`Weekly report failed for ${profile.id}:`, e);
          skipped++;
        }
      }));

      if (i + BATCH_SIZE < eligibleUsers.length) await delay(1000);
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
