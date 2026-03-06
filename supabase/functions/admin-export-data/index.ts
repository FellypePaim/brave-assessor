import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const v = r[h];
          if (v === null || v === undefined) return "";
          const s = typeof v === "object" ? JSON.stringify(v) : String(v);
          return `"${s.replace(/"/g, '""')}"`;
        })
        .join(",")
    ),
  ];
  return lines.join("\n");
}

const ALLOWED_TABLES = [
  "profiles",
  "user_roles",
  "wallets",
  "cards",
  "categories",
  "transactions",
  "recurring_transactions",
  "financial_goals",
  "reminders",
  "chat_messages",
  "family_groups",
  "family_memberships",
  "support_conversations",
  "support_messages",
  "whatsapp_links",
  "whatsapp_pending_transactions",
  "whatsapp_sessions",
  "whatsapp_rate_limits",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization")!;
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) throw new Error("Não autenticado");

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) throw new Error("Acesso negado — somente admin");

    const { table, type } = await req.json();

    // Special: list auth users
    if (type === "auth_users") {
      const { data: { users }, error } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      if (error) throw error;
      const flat = (users || []).map((u: any) => ({
        id: u.id,
        email: u.email,
        phone: u.phone || "",
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at || "",
        display_name: u.user_metadata?.display_name || "",
        email_confirmed_at: u.email_confirmed_at || "",
      }));
      return new Response(toCsv(flat), {
        headers: { ...corsHeaders, "Content-Type": "text/csv; charset=utf-8" },
      });
    }

    // Special: list storage buckets
    if (type === "storage_buckets") {
      const { data, error } = await adminClient.storage.listBuckets();
      if (error) throw error;
      const rows = (data || []).map((b: any) => ({
        id: b.id,
        name: b.name,
        public: b.public,
        created_at: b.created_at,
      }));
      return new Response(toCsv(rows), {
        headers: { ...corsHeaders, "Content-Type": "text/csv; charset=utf-8" },
      });
    }

    // Special: list storage files for a bucket
    if (type === "storage_files") {
      const bucket = table || "support-attachments";
      const { data, error } = await adminClient.storage.from(bucket).list("", { limit: 1000 });
      if (error) throw error;
      const rows = (data || []).map((f: any) => ({
        name: f.name,
        id: f.id,
        created_at: f.created_at,
        updated_at: f.updated_at,
        size: f.metadata?.size || 0,
        mimetype: f.metadata?.mimetype || "",
      }));
      return new Response(toCsv(rows), {
        headers: { ...corsHeaders, "Content-Type": "text/csv; charset=utf-8" },
      });
    }

    // Regular table export
    if (!table || !ALLOWED_TABLES.includes(table)) {
      throw new Error(`Tabela inválida: ${table}`);
    }

    const { data, error } = await adminClient.from(table).select("*").limit(10000);
    if (error) throw error;

    return new Response(toCsv(data || []), {
      headers: { ...corsHeaders, "Content-Type": "text/csv; charset=utf-8" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
