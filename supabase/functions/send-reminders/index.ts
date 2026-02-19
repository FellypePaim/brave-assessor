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

    const now = new Date();

    // Find reminders where the notification time has arrived:
    // notify_at = event_at - notify_minutes_before
    // We want: event_at - notify_minutes_before <= now <= event_at
    const { data: reminders, error: remErr } = await supabase
      .from("reminders")
      .select("id, user_id, title, description, event_at, notify_minutes_before")
      .eq("is_sent", false)
      .eq("is_active", true)
      .gte("event_at", now.toISOString()); // event hasn't happened yet

    if (remErr) throw remErr;
    if (!reminders || reminders.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter reminders where it's time to send notification
    const toSend = reminders.filter(r => {
      const eventAt = new Date(r.event_at);
      const notifyAt = new Date(eventAt.getTime() - r.notify_minutes_before * 60 * 1000);
      return now >= notifyAt;
    });

    // Get whatsapp links for these users
    const userIds = [...new Set(toSend.map(r => r.user_id))];
    if (userIds.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: links } = await supabase
      .from("whatsapp_links")
      .select("user_id, phone_number")
      .in("user_id", userIds)
      .eq("verified", true)
      .not("phone_number", "is", null);

    const phoneMap = new Map(links?.map(l => [l.user_id, l.phone_number]) ?? []);

    let sent = 0;
    let skipped = 0;

    for (const reminder of toSend) {
      const phone = phoneMap.get(reminder.user_id);
      if (!phone) { skipped++; continue; }

      const eventAt = new Date(reminder.event_at);
      const fmt = (d: Date) =>
        d.toLocaleString("pt-BR", {
          day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
        });

      const minutesBefore = reminder.notify_minutes_before;
      let timeLabel = "";
      if (minutesBefore < 60) timeLabel = `em *${minutesBefore} minutos*`;
      else if (minutesBefore < 1440) timeLabel = `em *${minutesBefore / 60} hora(s)*`;
      else timeLabel = `em *${minutesBefore / 1440} dia(s)*`;

      const message = [
        `🔔 *Lembrete: ${reminder.title}*`,
        "",
        reminder.description ? `📝 ${reminder.description}` : null,
        `📅 Data/Hora: *${fmt(eventAt)}*`,
        `⏰ O evento começa ${timeLabel}`,
        "",
        "_Brave IA - Seu assessor financeiro 🤖_",
      ].filter(l => l !== null).join("\n");

      try {
        await sendWhatsAppMessage(phone, message);
        // Mark as sent
        await supabase.from("reminders").update({ is_sent: true }).eq("id", reminder.id);
        sent++;
        console.log(`Sent reminder "${reminder.title}" to ${phone}`);
      } catch (e) {
        console.error(`Failed to send reminder to ${phone}:`, e);
        skipped++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent, skipped, checked: reminders.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("send-reminders error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
