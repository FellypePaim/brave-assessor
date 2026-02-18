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

async function downloadMediaAsBase64(mediaUrl: string): Promise<string> {
  const resp = await fetch(mediaUrl);
  if (!resp.ok) throw new Error(`Failed to download media: ${resp.status}`);
  const buffer = await resp.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function processImageWithAI(imageBase64: string, mimeType: string, financialContext: string, userCaption?: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const systemPrompt = `Você é o Nox IA 🤖, assessor financeiro pessoal via WhatsApp.

📋 REGRAS DE FORMATAÇÃO:
- Use emojis relevantes em TODAS as respostas
- Separe informações em parágrafos curtos com quebras de linha
- Use emojis no início de cada parágrafo
- Máximo 800 caracteres
- Seja caloroso e pessoal

🧾 ANÁLISE DE COMPROVANTES:
Você está recebendo a FOTO de um comprovante/recibo/nota fiscal.
Analise a imagem e extraia:
- Valor (amount)
- Descrição do pagamento (description)
- Categoria mais adequada das disponíveis
- Tipo: "expense" ou "income"
- Forma de pagamento se visível (PIX, cartão, dinheiro, etc.)

Responda SOMENTE com JSON quando identificar uma transação:
{"action":"add_transaction","amount":50.00,"description":"Supermercado Extra","category":"Alimentação","type":"expense","payment_method":"PIX"}

Se não conseguir identificar os dados, responda em texto explicando o que viu e pedindo mais informações.

${financialContext}`;

  const userContent: any[] = [
    {
      type: "image_url",
      image_url: { url: `data:${mimeType};base64,${imageBase64}` },
    },
    {
      type: "text",
      text: userCaption || "Analise este comprovante e extraia os dados da transação.",
    },
  ];

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    console.error("AI vision error:", resp.status, t);
    throw new Error("AI vision processing failed");
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "Desculpe, não consegui analisar a imagem.";
}

async function processAudioWithAI(audioBase64: string, mimeType: string, financialContext: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const systemPrompt = `Você é o Nox IA 🤖, assessor financeiro pessoal via WhatsApp.

📋 REGRAS DE FORMATAÇÃO:
- Use emojis relevantes em TODAS as respostas
- Separe informações em parágrafos curtos com quebras de linha
- Use emojis no início de cada parágrafo
- Máximo 800 caracteres
- Seja caloroso e pessoal

🎙️ ÁUDIO RECEBIDO:
O usuário enviou um áudio. Transcreva e interprete o que foi dito.

Se for um comando de transação (ex: "gastei 50 reais no almoço"), responda SOMENTE com JSON:
{"action":"add_transaction","amount":50,"description":"Almoço","category":"Alimentação","type":"expense"}

Se for uma pergunta, responda em texto formatado com emojis e parágrafos.

${financialContext}`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "input_audio",
              input_audio: { data: audioBase64, format: mimeType.includes("ogg") ? "ogg" : "mp3" },
            },
            { type: "text", text: "Transcreva e interprete este áudio." },
          ],
        },
      ],
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    console.error("AI audio error:", resp.status, t);
    throw new Error("AI audio processing failed");
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "Desculpe, não consegui processar o áudio.";
}

async function processWithNoxIA(userMessage: string, financialContext: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const systemPrompt = `Você é o Nox IA 🤖, assessor financeiro pessoal via WhatsApp. Responda SEMPRE em português brasileiro.

📋 REGRAS DE FORMATAÇÃO (MUITO IMPORTANTE):
- Use emojis relevantes em TODAS as respostas para deixar a conversa mais amigável e visual
- Separe informações em parágrafos curtos com quebras de linha entre eles
- Use emojis no início de cada parágrafo ou tópico
- Limite: máximo 800 caracteres
- Seja caloroso, motivador e pessoal (use o nome do usuário quando disponível)

💡 Capacidades:
- Analisar gastos e finanças do usuário
- Interpretar comandos como "Gastei X com Y" para registrar transações
- Dar dicas práticas de economia
- Comparar períodos e identificar padrões

📝 Quando o usuário disser algo como "Gastei 50 com almoço" ou "Paguei 200 de luz", responda SOMENTE com JSON (sem texto extra):
{"action":"add_transaction","amount":50,"description":"Almoço","category":"Alimentação","type":"expense"}

Para perguntas normais, responda em texto formatado com emojis e parágrafos.

Exemplo de resposta bem formatada:
"💰 Oi, João! Vamos ver como estão suas finanças!

📊 Este mês você gastou R$ 1.200,00 no total, sendo R$ 450 com alimentação e R$ 300 com transporte.

✅ Você ainda tem R$ 800 disponíveis no seu orçamento. Tá indo bem! 💪

💡 Dica: tente reduzir os gastos com delivery pra economizar mais!"

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

function getMediaInfo(message: any) {
  // UAZAPI media fields
  const hasImage = message.isMedia && (message.mimetype?.startsWith("image/") || message.type === "image");
  const hasAudio = message.isMedia && (message.mimetype?.startsWith("audio/") || message.type === "ptt" || message.type === "audio");
  const mediaUrl = message.mediaUrl || message.media?.url || message.deprecatedMms3Url;
  const mimetype = message.mimetype || "application/octet-stream";
  const caption = message.caption || message.body || "";

  return { hasImage, hasAudio, mediaUrl, mimetype, caption };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();

    // Log key fields for debugging
    console.log("Webhook keys:", JSON.stringify({
      EventType: body.EventType,
      chatPhone: body.chat?.phone,
      msgBody: body.message?.body,
      msgFromMe: body.message?.fromMe,
      isMedia: body.message?.isMedia,
      msgType: body.message?.type,
      mimetype: body.message?.mimetype,
      hasMediaUrl: !!(body.message?.mediaUrl || body.message?.media?.url),
    }));

    const message = body.message || {};
    const chat = body.chat || {};

    const phone = chat.number || chat.phone || message.number || message.phone || message.from || message.sender || body.number || body.from;
    const text = message.body || message.text || message.message || body.body || body.text;
    const isFromMe = message.fromMe || body.fromMe || false;

    if (isFromMe) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for media
    const { hasImage, hasAudio, mediaUrl, mimetype, caption } = getMediaInfo(message);
    const hasMedia = hasImage || hasAudio;

    if (!phone || (!text && !hasMedia)) {
      console.log("Missing phone or content, skipping. phone:", phone, "text:", text, "hasMedia:", hasMedia);
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanPhone = phone.replace(/@.*$/, "").replace(/\D/g, "");
    const messageText = (text || "").trim();

    console.log(`Message from ${cleanPhone}: ${hasMedia ? `[${hasImage ? "IMAGE" : "AUDIO"}] ` : ""}${messageText}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Check verification code
    const codeMatch = messageText.match(/^NOX-(\d{6})$/i);
    if (codeMatch) {
      const code = `NOX-${codeMatch[1]}`;
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

      await supabaseAdmin
        .from("whatsapp_links")
        .update({ phone_number: cleanPhone, verified: true })
        .eq("id", link.id);

      await sendWhatsAppMessage(cleanPhone,
        "✅ WhatsApp vinculado com sucesso!\n\n" +
        "Agora você pode:\n" +
        '• Registrar gastos: "Gastei 50 com almoço"\n' +
        "• 📸 Enviar foto do comprovante\n" +
        "• 🎙️ Enviar áudio com seus gastos\n" +
        '• Ver saldo: "Qual meu saldo?"\n\n' +
        "Experimente agora! 💰"
      );

      return new Response(JSON.stringify({ ok: true, linked: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if phone is linked
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

    const userId = link.user_id;

    // Get financial context
    const [
      { data: profile },
      { data: wallets },
      { data: categories },
      { data: recentTx },
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("display_name, monthly_income").eq("id", userId).single(),
      supabaseAdmin.from("wallets").select("name, type, balance, id").eq("user_id", userId),
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

    // Process based on message type
    let aiResponse: string;

    if (hasImage && mediaUrl) {
      try {
        console.log("Downloading image from:", mediaUrl);
        const imageBase64 = await downloadMediaAsBase64(mediaUrl);
        aiResponse = await processImageWithAI(imageBase64, mimetype, financialContext, caption);
      } catch (e) {
        console.error("Image processing error:", e);
        aiResponse = "😕 Não consegui processar a imagem. Tente enviar novamente ou me diga os dados da transação por texto!";
      }
    } else if (hasAudio && mediaUrl) {
      try {
        console.log("Downloading audio from:", mediaUrl);
        const audioBase64 = await downloadMediaAsBase64(mediaUrl);
        aiResponse = await processAudioWithAI(audioBase64, mimetype, financialContext);
      } catch (e) {
        console.error("Audio processing error:", e);
        aiResponse = "😕 Não consegui processar o áudio. Tente enviar novamente ou me diga por texto!";
      }
    } else {
      aiResponse = await processWithNoxIA(messageText, financialContext);
    }

    // Check if AI wants to create a transaction
    let replyText = aiResponse;
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*"action"\s*:\s*"add_transaction"[\s\S]*\}/);
      if (jsonMatch) {
        const action = JSON.parse(jsonMatch[0]);

        const matchedCategory = (categories || []).find(
          (c: any) => c.name.toLowerCase() === action.category?.toLowerCase()
        );

        const defaultWallet = (wallets || [])[0];

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
          if (defaultWallet) {
            const balanceChange = action.type === "income" ? action.amount : -action.amount;
            await supabaseAdmin.from("wallets").update({
              balance: Number(defaultWallet.balance) + balanceChange,
            }).eq("id", defaultWallet.id);
          }

          const emoji = action.type === "income" ? "💰" : "💸";
          const paymentInfo = action.payment_method ? `\n💳 ${action.payment_method}` : "";
          replyText = `${emoji} Transação registrada!\n\n` +
            `📝 ${action.description}\n` +
            `💵 R$ ${Number(action.amount).toFixed(2)}\n` +
            `📂 ${matchedCategory?.name || "Sem categoria"}${paymentInfo}\n` +
            `📅 ${new Date().toLocaleDateString("pt-BR")}\n\n` +
            `💰 Saldo atualizado: R$ ${(totalBalance + (action.type === "income" ? action.amount : -action.amount)).toFixed(2)}`;
        }
      }
    } catch (parseErr) {
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
