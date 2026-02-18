import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    throw new Error(`UAZAPI error: ${resp.status}`);
  }
  return resp.json();
}

async function getUserFinancialContext(supabase: any) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

  const [
    { data: profile },
    { data: wallets },
    { data: categories },
    { data: thisMonthTx },
  ] = await Promise.all([
    supabase.from("profiles").select("display_name, monthly_income").single(),
    supabase.from("wallets").select("name, type, balance"),
    supabase.from("categories").select("name, icon, budget_limit"),
    supabase.from("transactions").select("amount, type, description, date, categories(name)")
      .gte("date", startOfMonth).lte("date", endOfMonth).order("date", { ascending: false }).limit(20),
  ]);

  const totalBalance = (wallets || []).reduce((s: number, w: any) => s + Number(w.balance), 0);
  let totalIncome = 0, totalExpense = 0;
  for (const tx of thisMonthTx || []) {
    if (tx.type === "income") totalIncome += Number(tx.amount);
    else totalExpense += Number(tx.amount);
  }

  return `
Nome: ${profile?.display_name || "Usuário"}
Renda: R$ ${profile?.monthly_income ? Number(profile.monthly_income).toFixed(2) : "?"}
Saldo total: R$ ${totalBalance.toFixed(2)}
Mês atual: Receitas R$ ${totalIncome.toFixed(2)} | Despesas R$ ${totalExpense.toFixed(2)}
Categorias: ${(categories || []).map((c: any) => c.name).join(", ")}
Últimas transações: ${(thisMonthTx || []).slice(0, 5).map((t: any) => `${t.type === "income" ? "+" : "-"}R$${Number(t.amount).toFixed(2)} ${t.description}`).join("; ") || "nenhuma"}
`;
}

async function processWithNoxIA(userMessage: string, financialContext: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const systemPrompt = `Você é o Nox IA, assessor financeiro via WhatsApp. Responda em português brasileiro, de forma concisa (máximo 500 caracteres).

Capacidades:
- Analisar gastos e finanças do usuário
- Interpretar comandos como "Gastei X com Y" para registrar transações
- Dar dicas de economia

Quando o usuário disser algo como "Gastei 50 com almoço" ou "Paguei 200 de luz", responda confirmando e extraia:
- amount (número)
- description (texto)
- category (melhor categoria disponível)
- type: "expense" ou "income"

Responda em JSON quando for um comando de transação:
{"action":"add_transaction","amount":50,"description":"Almoço","category":"Alimentação","type":"expense"}

Se for uma pergunta normal, responda em texto simples.

${financialContext}`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    console.error("AI error:", resp.status, t);
    throw new Error("AI processing failed");
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "Desculpe, não consegui processar sua mensagem.";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    console.log("Webhook received:", JSON.stringify(body).slice(0, 500));

    // UAZAPI webhook payload - extract message info
    const message = body.message || body;
    const phone = message.from || message.phone || message.sender || body.from;
    const text = message.body || message.text || message.message || body.body || body.text;
    const isFromMe = message.fromMe || body.fromMe || false;

    // Ignore messages sent by us
    if (isFromMe) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!phone || !text) {
      console.log("Missing phone or text, skipping");
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clean phone number (remove @s.whatsapp.net etc)
    const cleanPhone = phone.replace(/@.*$/, "").replace(/\D/g, "");
    const messageText = text.trim();

    console.log(`Message from ${cleanPhone}: ${messageText}`);

    // Create admin supabase client for webhook operations
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Check if this is a verification code
    const codeMatch = messageText.match(/^NOX-(\d{6})$/i);
    if (codeMatch) {
      const code = `NOX-${codeMatch[1]}`;
      
      // Find the pending verification
      const { data: link } = await supabaseAdmin
        .from("whatsapp_links")
        .select("*")
        .eq("verification_code", code)
        .eq("verified", false)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (!link) {
        await sendWhatsAppMessage(cleanPhone, "❌ Código inválido ou expirado. Gere um novo código no app Nox.");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Link the phone number
      await supabaseAdmin
        .from("whatsapp_links")
        .update({ phone_number: cleanPhone, verified: true })
        .eq("id", link.id);

      await sendWhatsAppMessage(cleanPhone, 
        "✅ WhatsApp vinculado com sucesso!\n\n" +
        "Agora você pode:\n" +
        '• Registrar gastos: "Gastei 50 com almoço"\n' +
        '• Ver saldo: "Qual meu saldo?"\n' +
        '• Ver resumo: "Como estou este mês?"\n\n' +
        "Experimente agora! 💰"
      );

      return new Response(JSON.stringify({ ok: true, linked: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if phone is linked to a user
    const { data: link } = await supabaseAdmin
      .from("whatsapp_links")
      .select("user_id")
      .eq("phone_number", cleanPhone)
      .eq("verified", true)
      .maybeSingle();

    if (!link) {
      await sendWhatsAppMessage(cleanPhone,
        "👋 Olá! Sou o Nox IA, seu assessor financeiro.\n\n" +
        "Para começar, vincule seu WhatsApp no app:\n" +
        "1. Abra o Nox → Configurações\n" +
        "2. Clique em 'Vincular WhatsApp'\n" +
        "3. Envie o código aqui\n\n" +
        "É rapidinho! 😊"
      );
      return new Response(JSON.stringify({ ok: true, unlinked: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create user-scoped supabase client
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    // We need to use admin client but scope queries to user
    const userId = link.user_id;

    // Get financial context using admin client filtered by user
    const [
      { data: profile },
      { data: wallets },
      { data: categories },
      { data: recentTx },
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("display_name, monthly_income").eq("id", userId).single(),
      supabaseAdmin.from("wallets").select("name, type, balance").eq("user_id", userId),
      supabaseAdmin.from("categories").select("id, name, icon, budget_limit").eq("user_id", userId),
      supabaseAdmin.from("transactions").select("amount, type, description, date, categories(name)")
        .eq("user_id", userId).order("date", { ascending: false }).limit(10),
    ]);

    const totalBalance = (wallets || []).reduce((s: number, w: any) => s + Number(w.balance), 0);
    const financialContext = `
Nome: ${profile?.display_name || "Usuário"}
Renda: R$ ${profile?.monthly_income ? Number(profile.monthly_income).toFixed(2) : "?"}
Saldo: R$ ${totalBalance.toFixed(2)}
Categorias: ${(categories || []).map((c: any) => `${c.name} (id:${c.id})`).join(", ")}
Últimas transações: ${(recentTx || []).slice(0, 5).map((t: any) => `${t.type === "income" ? "+" : "-"}R$${Number(t.amount).toFixed(2)} ${t.description}`).join("; ") || "nenhuma"}`;

    // Process with Nox IA
    const aiResponse = await processWithNoxIA(messageText, financialContext);

    // Check if AI wants to create a transaction
    let replyText = aiResponse;
    try {
      // Try to parse as JSON action
      const jsonMatch = aiResponse.match(/\{[\s\S]*"action"\s*:\s*"add_transaction"[\s\S]*\}/);
      if (jsonMatch) {
        const action = JSON.parse(jsonMatch[0]);
        
        // Find matching category
        const matchedCategory = (categories || []).find(
          (c: any) => c.name.toLowerCase() === action.category?.toLowerCase()
        );

        // Get default wallet
        const defaultWallet = (wallets || [])[0];

        // Insert transaction
        const { error: txError } = await supabaseAdmin.from("transactions").insert({
          user_id: userId,
          amount: action.amount,
          description: action.description,
          type: action.type || "expense",
          category_id: matchedCategory?.id || null,
          wallet_id: defaultWallet?.id || null,
          date: new Date().toISOString().split("T")[0],
        });

        if (txError) {
          console.error("Transaction insert error:", txError);
          replyText = `❌ Não consegui registrar a transação: ${txError.message}`;
        } else {
          // Update wallet balance
          if (defaultWallet) {
            const balanceChange = action.type === "income" ? action.amount : -action.amount;
            await supabaseAdmin.from("wallets").update({
              balance: Number(defaultWallet.balance) + balanceChange,
            }).eq("id", defaultWallet.id);
          }

          const emoji = action.type === "income" ? "💰" : "💸";
          replyText = `${emoji} Transação registrada!\n\n` +
            `📝 ${action.description}\n` +
            `💵 R$ ${Number(action.amount).toFixed(2)}\n` +
            `📂 ${matchedCategory?.name || "Sem categoria"}\n` +
            `📅 ${new Date().toLocaleDateString("pt-BR")}\n\n` +
            `Saldo atualizado: R$ ${(totalBalance + (action.type === "income" ? action.amount : -action.amount)).toFixed(2)}`;
        }
      }
    } catch (parseErr) {
      // Not a JSON action, use AI response as-is
      console.log("Response is text, not action");
    }

    await sendWhatsAppMessage(cleanPhone, replyText);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Webhook error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
