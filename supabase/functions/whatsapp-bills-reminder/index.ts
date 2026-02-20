import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
    const specificUserId: string | undefined = body.userId;

    const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Get users with WhatsApp linked
    const profileQuery = supabase.from("profiles").select("id, display_name");
    if (specificUserId) profileQuery.eq("id", specificUserId);

    const { data: profiles, error: profErr } = await profileQuery;
    if (profErr) throw profErr;

    const { data: links, error: linkErr } = await supabase
      .from("whatsapp_links")
      .select("user_id, phone_number")
      .eq("verified", true)
      .not("phone_number", "is", null);
    if (linkErr) throw linkErr;

    const linkedMap = new Map(links?.map(l => [l.user_id, l.phone_number]) ?? []);

    // Use Brazil timezone (UTC-3)
    const today = new Date(new Date().getTime() - 3 * 60 * 60 * 1000);
    const todayDay = today.getDate();
    // Target days ahead: 1 and 3
    const targetDays = [1, 3];

    let sent = 0;
    let skipped = 0;

    for (const profile of profiles ?? []) {
      const phone = linkedMap.get(profile.id);
      if (!phone) { skipped++; continue; }

      const name = profile.display_name || "Usuário";

      // ── 1. Notify about upcoming one-time unpaid transactions (1 or 3 days ahead) ──
      const todayStr = today.toISOString().slice(0, 10);
      const threeAhead = new Date(today); threeAhead.setDate(today.getDate() + 3);
      const threeAheadStr = threeAhead.toISOString().slice(0, 10);

      const { data: upcoming } = await supabase
        .from("transactions")
        .select("description, amount, type, due_date, categories(name)")
        .eq("user_id", profile.id)
        .eq("is_paid", false)
        .gte("due_date", todayStr)
        .lte("due_date", threeAheadStr)
        .order("due_date", { ascending: true })
        .limit(10);

      const bills = (upcoming || []).filter(t => t.type === "expense");
      const receivables = (upcoming || []).filter(t => t.type === "income");

      if (bills.length > 0 || receivables.length > 0) {
        let messageLines = [`⚠️ *Olá, ${name}!* Você tem compromissos nos próximos 3 dias:`];

        if (bills.length > 0) {
          const totalBills = bills.reduce((s, t) => s + Number(t.amount), 0);
          messageLines.push(`\n📋 *Contas a Pagar:*`);
          bills.forEach(t => {
            const catName = (t as any).categories?.name || "Geral";
            const due = t.due_date ? new Date(t.due_date + "T12:00:00").toLocaleDateString("pt-BR") : "—";
            const daysUntil = t.due_date
              ? Math.round((new Date(t.due_date + "T12:00:00").getTime() - today.getTime()) / 86400000)
              : null;
            const urgency = daysUntil !== null ? (daysUntil <= 1 ? "🔴 AMANHÃ" : `em ${daysUntil} dias`) : "";
            messageLines.push(`• *${t.description}* — ${fmt(Number(t.amount))} · vence ${due} ${urgency} · ${catName}`);
          });
          messageLines.push(`💸 *Total: ${fmt(totalBills)}*`);
        }

        if (receivables.length > 0) {
          const totalRec = receivables.reduce((s, t) => s + Number(t.amount), 0);
          messageLines.push(`\n💰 *A Receber:*`);
          receivables.forEach(t => {
            const due = t.due_date ? new Date(t.due_date + "T12:00:00").toLocaleDateString("pt-BR") : "—";
            messageLines.push(`• ${t.description} — ${fmt(Number(t.amount))} · previsto ${due}`);
          });
          messageLines.push(`✅ *Total: ${fmt(totalRec)}*`);
        }

        messageLines.push(`\n💬 Envie *conferir* para ver e marcar como pagas.\n_Brave IA - Seu assessor financeiro 🤖_`);

        try {
          await sendWhatsAppMessage(phone, messageLines.join("\n"));
          sent++;
        } catch (e) {
          console.error(`Failed to send transaction reminder to ${phone}:`, e);
          skipped++;
        }
      }

      // ── 2. Notify about recurring transactions due in 1 or 3 days ──
      const { data: recurringList } = await supabase
        .from("recurring_transactions")
        .select("description, amount, type, day_of_month, categories(name)")
        .eq("user_id", profile.id)
        .eq("is_active", true)
        .eq("type", "expense");

      const dueRec: any[] = [];
      for (const r of recurringList || []) {
        const day = r.day_of_month;
        // Calculate the due date for this month (or next if already passed)
        let dueDate = new Date(today.getFullYear(), today.getMonth(), day);
        if (dueDate < today) {
          dueDate = new Date(today.getFullYear(), today.getMonth() + 1, day);
        }
        const daysUntil = Math.round((dueDate.getTime() - today.setHours(0, 0, 0, 0)) / 86400000);

        if (targetDays.includes(daysUntil)) {
          dueRec.push({ ...r, daysUntil, dueDate });
        }
      }

      if (dueRec.length > 0) {
        const lines: string[] = [`🔁 *Olá, ${name}!* Suas contas recorrentes estão chegando:\n`];
        dueRec.forEach(r => {
          const catName = (r as any).categories?.name || "Geral";
          const due = r.dueDate.toLocaleDateString("pt-BR");
          const urgency = r.daysUntil === 1 ? "🔴 *AMANHÃ*" : `em ${r.daysUntil} dias`;
          lines.push(`• *${r.description}* — ${fmt(Number(r.amount))} · vence ${due} (${urgency}) · ${catName}`);
        });
        lines.push(`\n💡 Lembre-se de separar o dinheiro!\n_Brave IA - Seu assessor financeiro 🤖_`);

        try {
          await sendWhatsAppMessage(phone, lines.join("\n"));
          sent++;
          console.log(`Recurring reminder sent to ${phone} (user: ${profile.id}): ${dueRec.length} items`);
        } catch (e) {
          console.error(`Failed to send recurring reminder to ${phone}:`, e);
          skipped++;
        }
      } else if (bills.length === 0 && receivables.length === 0) {
        skipped++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent, skipped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("whatsapp-bills-reminder error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
