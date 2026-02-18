import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendWhatsAppMessage(phone: string, message: string) {
  const UAZAPI_URL = Deno.env.get("UAZAPI_URL");
  const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");
  if (!UAZAPI_URL || !UAZAPI_TOKEN) return;

  const resp = await fetch(`${UAZAPI_URL}/send/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: UAZAPI_TOKEN },
    body: JSON.stringify({ number: phone, text: message }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    console.error("UAZAPI send error:", resp.status, t);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    const nowIso = now.toISOString();

    // Window for "expiring soon" = now + 3 days (±1h to avoid duplicate sends)
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const in3DaysStart = new Date(in3Days.getTime() - 30 * 60 * 1000).toISOString(); // -30min
    const in3DaysEnd   = new Date(in3Days.getTime() + 30 * 60 * 1000).toISOString(); // +30min

    // ── 1. Find plans expiring in ~3 days and send reminder ──
    const { data: expiringProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, subscription_plan, subscription_expires_at")
      .in("subscription_plan", ["mensal", "anual", "trimestral"])
      .gte("subscription_expires_at", in3DaysStart)
      .lte("subscription_expires_at", in3DaysEnd)
      .not("subscription_expires_at", "is", null);

    let reminders = 0;
    for (const profile of expiringProfiles ?? []) {
      const { data: waLink } = await supabaseAdmin
        .from("whatsapp_links")
        .select("phone_number")
        .eq("user_id", profile.id)
        .eq("verified", true)
        .maybeSingle();

      if (!waLink?.phone_number) continue;

      const name = profile.display_name || "Usuário";
      const expiryDate = new Date(profile.subscription_expires_at!).toLocaleDateString("pt-BR");
      const planNames: Record<string, string> = {
        mensal: "Nox Mensal",
        anual: "Nox Anual",
        trimestral: "Nox Trimestral",
      };

      const message =
        `⏰ *Lembrete: seu plano expira em 3 dias, ${name}!*\n\n` +
        `📋 Plano: *${planNames[profile.subscription_plan] || profile.subscription_plan}*\n` +
        `📅 Expira em: *${expiryDate}*\n\n` +
        `Para não perder acesso aos seus recursos:\n` +
        `• Modo Família\n` +
        `• Análise comportamental\n` +
        `• WhatsApp conectado\n\n` +
        `💳 *Renove agora:*\n` +
        `Abra o app Nox → Configurações → Planos e Assinatura\n\n` +
        `_Nox IA - Seu assessor financeiro 🤖_`;

      await sendWhatsAppMessage(waLink.phone_number, message);
      reminders++;
      console.log(`Sent 3-day expiry reminder to ${waLink.phone_number} (user: ${profile.id})`);
    }

    // ── 2. Find all users with already-expired paid plans ──
    const { data: expiredProfiles, error: fetchErr } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, subscription_plan, subscription_expires_at")
      .in("subscription_plan", ["mensal", "anual", "trimestral"])
      .lt("subscription_expires_at", nowIso)
      .not("subscription_expires_at", "is", null);

    if (fetchErr) throw fetchErr;
    if (!expiredProfiles || expiredProfiles.length === 0) {
      console.log("No expired plans found.");
      return new Response(JSON.stringify({ ok: true, processed: 0, reminders }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${expiredProfiles.length} expired plans to process.`);
    let processed = 0;

    for (const profile of expiredProfiles) {
      const userId = profile.id;
      const name = profile.display_name || "Usuário";

      try {
        // 1. Downgrade plan to free
        await supabaseAdmin
          .from("profiles")
          .update({ subscription_plan: "free", subscription_expires_at: null })
          .eq("id", userId);

        // 2. Delete groups where user is owner (family groups)
        const { data: ownedGroups } = await supabaseAdmin
          .from("family_groups")
          .select("id")
          .eq("owner_id", userId);

        if (ownedGroups && ownedGroups.length > 0) {
          const groupIds = ownedGroups.map((g: any) => g.id);
          // Remove all memberships first, then groups
          await supabaseAdmin
            .from("family_memberships")
            .delete()
            .in("family_group_id", groupIds);
          await supabaseAdmin
            .from("family_groups")
            .delete()
            .in("id", groupIds);
          console.log(`Deleted ${groupIds.length} owned groups for user ${userId}`);
        }

        // 3. Remove user from groups they are a member of (not owner)
        await supabaseAdmin
          .from("family_memberships")
          .delete()
          .eq("user_id", userId);

        // 4. Notify via WhatsApp if linked
        const { data: waLink } = await supabaseAdmin
          .from("whatsapp_links")
          .select("phone_number")
          .eq("user_id", userId)
          .eq("verified", true)
          .maybeSingle();

        if (waLink?.phone_number) {
          const message =
            `⚠️ *Seu plano Nox expirou, ${name}!*\n\n` +
            `Infelizmente seu acesso premium foi encerrado e você foi removido dos grupos familiares.\n\n` +
            `🔒 *O que mudou:*\n` +
            `• Acesso ao Modo Família removido\n` +
            `• Análise comportamental desativada\n` +
            `• Grupos dos quais você era dono foram encerrados\n\n` +
            `💳 *Renove agora e recupere tudo:*\n` +
            `Abra o app Nox → Configurações → Planos e Assinatura\n\n` +
            `_Nox IA - Seu assessor financeiro 🤖_`;

          await sendWhatsAppMessage(waLink.phone_number, message);
          console.log(`Expiry notification sent to ${waLink.phone_number}`);
        }

        processed++;
        console.log(`Processed expired plan for user ${userId} (was: ${profile.subscription_plan})`);
      } catch (userErr) {
        console.error(`Error processing user ${userId}:`, userErr);
      }
    }

    return new Response(JSON.stringify({ ok: true, processed, reminders }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("check-expired-plans error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
