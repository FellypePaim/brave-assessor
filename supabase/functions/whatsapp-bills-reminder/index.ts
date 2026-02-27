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
    const specificUserId: string | undefined = body.userId;

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
    const today = getBrazilNow();
    const todayDay = today.getDate();

    let sent = 0;
    let skipped = 0;
    const eligibleUsers = (profiles ?? []).filter(p => linkedMap.has(p.id));

    for (let i = 0; i < eligibleUsers.length; i += BATCH_SIZE) {
      const batch = eligibleUsers.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (profile) => {
        const phone = linkedMap.get(profile.id)!;
        const name = profile.display_name || "Usuário";

        try {
          const todayStr = today.toISOString().slice(0, 10);
          const threeAhead = new Date(today);
          threeAhead.setDate(today.getDate() + 3);
          const threeAheadStr = threeAhead.toISOString().slice(0, 10);

          // Wallets
          const { data: wallets } = await supabase
            .from("wallets").select("balance").eq("user_id", profile.id);
          const totalBalance = (wallets || []).reduce((s, w) => s + Number(w.balance), 0);

          // Upcoming unpaid bills
          const { data: upcoming } = await supabase
            .from("transactions")
            .select("description, amount, type, due_date")
            .eq("user_id", profile.id)
            .eq("is_paid", false)
            .gte("due_date", todayStr)
            .lte("due_date", threeAheadStr)
            .order("due_date", { ascending: true })
            .limit(5);

          const bills = (upcoming || []).filter(t => t.type === "expense");
          const receivables = (upcoming || []).filter(t => t.type === "income");

          // Recurring due in 1 or 3 days
          const { data: recurringList } = await supabase
            .from("recurring_transactions")
            .select("description, amount, day_of_month")
            .eq("user_id", profile.id)
            .eq("is_active", true)
            .eq("type", "expense");

          const dueRec: { desc: string; amount: number; days: number }[] = [];
          for (const r of recurringList || []) {
            let dueDate = new Date(today.getFullYear(), today.getMonth(), r.day_of_month);
            if (dueDate < new Date(today.getFullYear(), today.getMonth(), todayDay)) {
              dueDate = new Date(today.getFullYear(), today.getMonth() + 1, r.day_of_month);
            }
            const todayMid = new Date(today); todayMid.setHours(0, 0, 0, 0);
            const days = Math.round((dueDate.getTime() - todayMid.getTime()) / 86400000);
            if (days === 1 || days === 3) {
              dueRec.push({ desc: r.description, amount: Number(r.amount), days });
            }
          }

          const hasContent = bills.length > 0 || receivables.length > 0 || dueRec.length > 0;
          if (!hasContent) { skipped++; return; }

          const lines: string[] = [];
          lines.push(`📌 *${name}*, atenção nos próximos dias:`);

          if (bills.length > 0) {
            const totalBills = bills.reduce((s, t) => s + Number(t.amount), 0);
            lines.push(`💸 *A pagar:*`);
            for (const t of bills) {
              const due = t.due_date ? new Date(t.due_date + "T12:00:00").toLocaleDateString("pt-BR") : "—";
              lines.push(`• ${t.description} · ${fmt(Number(t.amount))} · ${due}`);
            }
            lines.push(`Total: *${fmt(totalBills)}*${totalBalance >= totalBills ? " ✅ coberto" : ` ⚠️ faltam ${fmt(totalBills - totalBalance)}`}`);
          }

          if (dueRec.length > 0) {
            lines.push(`🔁 *Recorrentes:*`);
            for (const r of dueRec) {
              const icon = r.days === 1 ? "🔴" : "🟡";
              lines.push(`${icon} ${r.desc} · ${fmt(r.amount)} · em ${r.days}d`);
            }
          }

          if (receivables.length > 0) {
            const totalRec = receivables.reduce((s, t) => s + Number(t.amount), 0);
            lines.push(`💰 *A receber:* ${fmt(totalRec)}`);
          }

          lines.push(`_Brave IA 🤖_`);
          await sendWhatsAppMessage(phone, lines.join("\n"));
          sent++;
        } catch (e) {
          console.error(`Failed for ${profile.id}:`, e);
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
    console.error("whatsapp-bills-reminder error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
