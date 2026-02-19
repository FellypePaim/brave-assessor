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

async function sendWhatsAppWithButton(phone: string, text: string, buttonLabel: string, buttonPayload: string) {
  const UAZAPI_URL = Deno.env.get("UAZAPI_URL");
  const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");
  if (!UAZAPI_URL || !UAZAPI_TOKEN) throw new Error("UAZAPI credentials not configured");

  // Try to send with button (interactive message)
  try {
    const resp = await fetch(`${UAZAPI_URL}/send/buttonMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: UAZAPI_TOKEN },
      body: JSON.stringify({
        number: phone,
        text,
        buttons: [{ buttonId: buttonPayload, buttonText: { displayText: buttonLabel } }],
      }),
    });

    if (resp.ok) {
      console.log("Button message sent successfully");
      return;
    }
  } catch (e) {
    console.warn("Button message failed, falling back to text:", e);
  }

  // Fallback: plain text with instruction
  await sendWhatsAppMessage(phone, `${text}\n\n👉 Digite *conferir* para ver suas contas.`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Accept either scheduled (no body) or triggered for a specific user
    const body = await req.json().catch(() => ({}));
    const specificUserId: string | undefined = body.userId;

    // Days ahead to look for upcoming bills (default: 3 days)
    const daysAhead = body.daysAhead ?? 3;

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const futureDate = new Date(today);
    futureDate.setDate(today.getDate() + daysAhead);
    const futureDateStr = futureDate.toISOString().slice(0, 10);

    // Get users with WhatsApp linked
    const profileQuery = supabase
      .from("profiles")
      .select("id, display_name");
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

    const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    let sent = 0;
    let skipped = 0;

    for (const profile of profiles ?? []) {
      const phone = linkedMap.get(profile.id);
      if (!phone) { skipped++; continue; }

      // Fetch upcoming unpaid transactions (due_date within daysAhead)
      const { data: upcoming } = await supabase
        .from("transactions")
        .select("description, amount, type, due_date, categories(name)")
        .eq("user_id", profile.id)
        .eq("is_paid", false)
        .gte("due_date", todayStr)
        .lte("due_date", futureDateStr)
        .order("due_date", { ascending: true })
        .limit(10);

      const bills = (upcoming || []).filter(t => t.type === "expense");
      const receivables = (upcoming || []).filter(t => t.type === "income");

      if (bills.length === 0 && receivables.length === 0) {
        skipped++;
        continue;
      }

      const name = profile.display_name || "Usuário";

      let messageLines = [`⚠️ *Olá, ${name}!* Você tem compromissos próximos:`];

      if (bills.length > 0) {
        const totalBills = bills.reduce((s, t) => s + Number(t.amount), 0);
        messageLines.push(`\n📋 *Contas a Pagar (próx. ${daysAhead} dias):*`);
        bills.forEach(t => {
          const catName = (t as any).categories?.name || "Geral";
          const due = t.due_date ? new Date(t.due_date + "T12:00:00").toLocaleDateString("pt-BR") : "—";
          messageLines.push(`• ${t.description} — ${fmt(Number(t.amount))} · vence ${due} · ${catName}`);
        });
        messageLines.push(`💸 *Total a pagar: ${fmt(totalBills)}*`);
      }

      if (receivables.length > 0) {
        const totalRec = receivables.reduce((s, t) => s + Number(t.amount), 0);
        messageLines.push(`\n💰 *A Receber (próx. ${daysAhead} dias):*`);
        receivables.forEach(t => {
          const due = t.due_date ? new Date(t.due_date + "T12:00:00").toLocaleDateString("pt-BR") : "—";
          messageLines.push(`• ${t.description} — ${fmt(Number(t.amount))} · previsto ${due}`);
        });
        messageLines.push(`✅ *Total a receber: ${fmt(totalRec)}*`);
      }

      messageLines.push(`\n_Brave Assessor - Seu assessor financeiro 🤖_`);

      const message = messageLines.join("\n");

      try {
        await sendWhatsAppWithButton(
          phone,
          message,
          "Conferir Agora!",
          "CHECK_BILLS"
        );
        sent++;
        console.log(`Bills reminder sent to ${phone} (user: ${profile.id})`);
      } catch (e) {
        console.error(`Failed to send to ${phone}:`, e);
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
