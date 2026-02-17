import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed

    // Get all active recurring transactions
    const { data: recurring, error: recurringError } = await supabase
      .from("recurring_transactions")
      .select("*")
      .eq("is_active", true);

    if (recurringError) throw recurringError;

    let created = 0;
    let skipped = 0;

    for (const rec of recurring || []) {
      // Calculate due date for this month
      const day = Math.min(rec.day_of_month, new Date(year, month + 1, 0).getDate());
      const dueDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      // Check if bill already exists for this month
      const { data: existing } = await supabase
        .from("transactions")
        .select("id")
        .eq("recurring_id", rec.id)
        .eq("due_date", dueDate)
        .limit(1);

      if (existing && existing.length > 0) {
        skipped++;
        continue;
      }

      // Create the bill (unpaid transaction)
      const { error: insertError } = await supabase.from("transactions").insert({
        user_id: rec.user_id,
        description: rec.description,
        amount: rec.amount,
        type: rec.type,
        category_id: rec.category_id,
        wallet_id: rec.wallet_id,
        card_id: rec.card_id,
        date: dueDate,
        due_date: dueDate,
        is_paid: false,
        recurring_id: rec.id,
      });

      if (insertError) {
        console.error(`Error creating bill for recurring ${rec.id}:`, insertError);
      } else {
        created++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, created, skipped, total: recurring?.length || 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
