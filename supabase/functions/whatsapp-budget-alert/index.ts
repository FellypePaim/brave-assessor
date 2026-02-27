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
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const todayStr = now.toISOString().slice(0, 10);

    const { data: links, error: linkErr } = await supabase
      .from("whatsapp_links")
      .select("user_id, phone_number")
      .eq("verified", true)
      .not("phone_number", "is", null);
    if (linkErr) throw linkErr;

    const linkedMap = new Map(links?.map(l => [l.user_id, l.phone_number]) ?? []);
    if (linkedMap.size === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: categories, error: catErr } = await supabase
      .from("categories")
      .select("id, user_id, name, budget_limit")
      .not("budget_limit", "is", null)
      .gt("budget_limit", 0);
    if (catErr) throw catErr;

    const relevantCats = (categories || []).filter(c => linkedMap.has(c.user_id));
    const userCats = new Map<string, typeof relevantCats>();
    for (const cat of relevantCats) {
      const list = userCats.get(cat.user_id) || [];
      list.push(cat);
      userCats.set(cat.user_id, list);
    }

    let sent = 0;
    let skipped = 0;
    const usersToProcess = [...userCats.entries()];

    for (let i = 0; i < usersToProcess.length; i += BATCH_SIZE) {
      const batch = usersToProcess.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async ([userId, cats]) => {
        const phone = linkedMap.get(userId)!;
        try {
          const { data: txs } = await supabase
            .from("transactions")
            .select("amount, category_id")
            .eq("user_id", userId)
            .eq("type", "expense")
            .gte("date", monthStart)
            .lte("date", todayStr);

          const spentByCategory = new Map<string, number>();
          for (const tx of txs || []) {
            if (tx.category_id) {
              spentByCategory.set(tx.category_id, (spentByCategory.get(tx.category_id) || 0) + Number(tx.amount));
            }
          }

          const alerts: string[] = [];
          for (const cat of cats) {
            const spent = spentByCategory.get(cat.id) || 0;
            const limit = Number(cat.budget_limit);
            const pct = (spent / limit) * 100;
            if (pct >= 100) {
              alerts.push(`🔴 ${cat.name}: ${fmt(spent)}/${fmt(limit)} · *estourado*`);
            } else if (pct >= 80) {
              alerts.push(`🟡 ${cat.name}: ${fmt(spent)}/${fmt(limit)} · ${pct.toFixed(0)}%`);
            }
          }

          if (alerts.length === 0) { skipped++; return; }

          const { data: profile } = await supabase
            .from("profiles").select("display_name").eq("id", userId).single();
          const name = profile?.display_name || "Usuário";

          const message = [
            `⚠️ *Alerta de orçamento, ${name}!*`,
            ...alerts,
            `💡 Revise seus gastos para fechar o mês no azul.`,
            `_Brave IA 🤖_`,
          ].join("\n");

          await sendWhatsAppMessage(phone, message);
          sent++;
        } catch (e) {
          console.error(`Budget alert failed for ${userId}:`, e);
          skipped++;
        }
      }));

      if (i + BATCH_SIZE < usersToProcess.length) await delay(1000);
    }

    return new Response(
      JSON.stringify({ success: true, sent, skipped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("whatsapp-budget-alert error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
