import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendWhatsAppMessage, getBrazilNow } from "../_shared/whatsapp-utils.ts";

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

          const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

          const todayTxs = transactions.filter(t => t.date === todayBR);
          const todayExpense = todayTxs.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);

          let message = "";

          if (notificationType === "morning") {
            // ── UNIFIED MORNING: Summary + Bills due today/tomorrow ──
            const lines: string[] = [];
            lines.push(`☀️ Bom dia, ${name}!`);
            lines.push(``);
            lines.push(`💰 *Resumo do mês até hoje:*`);
            lines.push(`📈 Receitas: ${fmt(totalIncome)}`);
            lines.push(`📉 Despesas: ${fmt(totalExpense)}`);
            lines.push(`💳 Saldo: ${fmt(saldo)}`);
            if (monthlyIncome > 0) {
              lines.push(`🎯 Você usou ${pctUsed.toFixed(0)}% da sua renda mensal`);
            }

            // Fetch unpaid bills due today or tomorrow
            const tomorrow = new Date(nowBR);
            tomorrow.setDate(nowBR.getDate() + 1);
            const tomorrowStr = tomorrow.toISOString().slice(0, 10);

            const { data: dueBills } = await supabase
              .from("transactions")
              .select("description, amount, due_date, categories(name)")
              .eq("user_id", profile.id)
              .eq("type", "expense")
              .eq("is_paid", false)
              .gte("due_date", todayBR)
              .lte("due_date", tomorrowStr)
              .order("due_date", { ascending: true })
              .limit(5);

            if (dueBills && dueBills.length > 0) {
              lines.push(``);
              lines.push(`📋 *Contas a pagar hoje/amanhã:*`);
              let totalDue = 0;
              dueBills.forEach(b => {
                const catName = (b as any).categories?.name || "Geral";
                const dueLabel = b.due_date === todayBR ? "🔴 HOJE" : "🟡 Amanhã";
                totalDue += Number(b.amount);
                lines.push(`• *${b.description}* — ${fmt(Number(b.amount))} · ${dueLabel} · ${catName}`);
              });
              lines.push(`💸 Total pendente: *${fmt(totalDue)}*`);
            }

            // Fetch recurring due today/tomorrow
            const { data: recurringList } = await supabase
              .from("recurring_transactions")
              .select("description, amount, day_of_month, categories(name)")
              .eq("user_id", profile.id)
              .eq("is_active", true)
              .eq("type", "expense");

            const dueRecurring: any[] = [];
            for (const r of recurringList || []) {
              const day = r.day_of_month;
              let dueDate = new Date(nowBR.getFullYear(), nowBR.getMonth(), day);
              if (dueDate.getTime() < new Date(nowBR.getFullYear(), nowBR.getMonth(), nowBR.getDate()).getTime()) {
                dueDate = new Date(nowBR.getFullYear(), nowBR.getMonth() + 1, day);
              }
              const dueDateStr = dueDate.toISOString().slice(0, 10);
              if (dueDateStr === todayBR || dueDateStr === tomorrowStr) {
                dueRecurring.push({ ...r, dueDateStr });
              }
            }

            if (dueRecurring.length > 0) {
              lines.push(``);
              lines.push(`🔁 *Recorrentes próximas:*`);
              dueRecurring.forEach(r => {
                const catName = (r as any).categories?.name || "Geral";
                const label = r.dueDateStr === todayBR ? "🔴 HOJE" : "🟡 Amanhã";
                lines.push(`• *${r.description}* — ${fmt(Number(r.amount))} · ${label} · ${catName}`);
              });
            }

            // Tip based on budget usage
            if (pctUsed > 80) {
              lines.push(``);
              lines.push(`⚠️ *Atenção:* Você já usou mais de 80% da sua renda. Cuidado com os gastos hoje!`);
            } else if (pctUsed > 50) {
              lines.push(``);
              lines.push(`💡 Já na metade do orçamento. Mantenha o foco!`);
            } else {
              lines.push(``);
              lines.push(`✅ Você está no caminho certo. Bom dia produtivo!`);
            }

            lines.push(``);
            lines.push(`_Brave IA - Seu assessor financeiro 🤖_`);
            message = lines.join("\n");

          } else {
            // ── NIGHT SUMMARY WITH AI TIP ──
            const lines: string[] = [];
            lines.push(`🌙 Boa noite, ${name}!`);

            if (todayTxs.length > 0) {
              lines.push(``);
              lines.push(`📋 *Hoje você registrou:*`);
              todayTxs.slice(0, 3).forEach(t => {
                lines.push(`${t.type === "expense" ? "💸" : "💰"} ${(t as any).categories?.name || "Gasto"}: ${fmt(Number(t.amount))}`);
              });
              if (todayTxs.length > 3) {
                lines.push(`... e mais ${todayTxs.length - 3} transações`);
              }
            } else {
              lines.push(``);
              lines.push(`📋 Nenhuma transação registrada hoje.`);
            }

            if (todayExpense > 0) {
              lines.push(``);
              lines.push(`💸 Total gasto hoje: *${fmt(todayExpense)}*`);
            }

            lines.push(``);
            lines.push(`📊 *No mês:* ${fmt(totalExpense)} gastos de ${fmt(monthlyIncome || totalIncome)} disponíveis`);

            // AI-generated tip
            try {
              const aiTip = await generateAITip(name, totalExpense, totalIncome, saldo, pctUsed, monthlyIncome, todayExpense, todayTxs.length);
              if (aiTip) {
                lines.push(``);
                lines.push(`🤖 *Dica da Brave IA:*`);
                lines.push(aiTip);
              }
            } catch (e) {
              console.error("AI tip generation failed:", e);
              // Fallback to static tip
              if (saldo >= 0) {
                lines.push(``);
                lines.push(`🌟 Ótimo dia! Continue assim.`);
              } else {
                lines.push(``);
                lines.push(`💪 Amanhã é uma nova oportunidade de equilibrar.`);
              }
            }

            lines.push(``);
            lines.push(`_Brave IA - Seu assessor financeiro 🤖_`);
            message = lines.join("\n");
          }

          await sendWhatsAppMessage(phone, message);
          sent++;
          console.log(`Sent ${notificationType} notification to ${phone} (user: ${profile.id})`);
        } catch (e) {
          console.error(`Failed to send to ${phone}:`, e);
          skipped++;
        }
      }));

      if (i + BATCH_SIZE < eligibleUsers.length) {
        await delay(1000);
      }
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

async function generateAITip(
  name: string,
  totalExpense: number,
  totalIncome: number,
  saldo: number,
  pctUsed: number,
  monthlyIncome: number,
  todayExpense: number,
  todayTxCount: number,
): Promise<string | null> {
  const GOOGLE_AI_KEY = Deno.env.get("GOOGLE_AI_KEY");
  if (!GOOGLE_AI_KEY) return null;

  const prompt = `Você é a Brave IA, assessor financeiro pessoal. Gere UMA dica financeira curta (máximo 2 linhas) e personalizada baseada nesses dados do usuário:
- Nome: ${name}
- Gastos do mês: R$ ${totalExpense.toFixed(2)}
- Receitas do mês: R$ ${totalIncome.toFixed(2)}
- Saldo: R$ ${saldo.toFixed(2)}
- Renda mensal: R$ ${monthlyIncome.toFixed(2)}
- % usado da renda: ${pctUsed.toFixed(0)}%
- Gasto hoje: R$ ${todayExpense.toFixed(2)}
- Transações hoje: ${todayTxCount}

Regras:
- Seja motivador e prático
- Use linguagem informal e brasileira
- NÃO use emojis (já adicionamos depois)
- Máximo 2 frases curtas
- Foque no que o usuário pode fazer amanhã`;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_AI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 100, temperature: 0.8 },
      }),
    },
  );

  if (!resp.ok) {
    console.error("Gemini AI error:", resp.status);
    return null;
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  return text || null;
}
