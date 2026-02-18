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

// Download media via UAZAPI - tries multiple known endpoints
async function downloadMediaFromUazapi(messageId: string, mediaType?: string): Promise<{ base64: string; mimetype: string } | null> {
  const UAZAPI_URL = Deno.env.get("UAZAPI_URL");
  const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");
  if (!UAZAPI_URL || !UAZAPI_TOKEN) return null;

  // UAZAPI known endpoints for downloading media (try in order)
  const endpoints = [
    { method: "POST", path: "/message/download", body: { messageId } },
    { method: "POST", path: "/message/download-media", body: { messageId } },
    { method: "GET", path: `/message/${messageId}/download`, body: null },
    { method: "POST", path: "/chat/download-media", body: { messageId } },
  ];

  for (const ep of endpoints) {
    try {
      const opts: RequestInit = {
        method: ep.method,
        headers: { "Content-Type": "application/json", token: UAZAPI_TOKEN },
      };
      if (ep.body) opts.body = JSON.stringify(ep.body);

      const resp = await fetch(`${UAZAPI_URL}${ep.path}`, opts);
      console.log(`UAZAPI ${ep.method} ${ep.path} -> ${resp.status}`);

      if (!resp.ok) continue;

      const data = await resp.json();
      console.log("Media download response keys:", Object.keys(data).join(", "));

      // Direct base64 in response
      if (data.base64) {
        const mime = data.mimetype || data.mimeType || guessMimeType(mediaType);
        return { base64: data.base64, mimetype: mime };
      }

      // URL to download separately
      const url = data.url || data.mediaUrl || data.fileUrl || data.downloadUrl;
      if (url) {
        const mediaResp = await fetch(url);
        if (!mediaResp.ok) continue;
        const ct = mediaResp.headers.get("content-type") || guessMimeType(mediaType);
        const buffer = await mediaResp.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        return { base64: btoa(binary), mimetype: ct };
      }
    } catch (e) {
      console.error(`Error trying ${ep.path}:`, e);
    }
  }

  console.error("All media download endpoints failed for messageId:", messageId);
  return null;
}

function guessMimeType(mediaType?: string): string {
  if (!mediaType) return "application/octet-stream";
  if (mediaType.includes("audio") || mediaType === "ptt") return "audio/ogg";
  if (mediaType.includes("image")) return "image/jpeg";
  if (mediaType.includes("video")) return "video/mp4";
  return "application/octet-stream";
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

Se não conseguir identificar os dados, responda em texto explicando o que viu.

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
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            { type: "text", text: userCaption || "Analise este comprovante e extraia os dados da transação." },
          ],
        },
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

  // Gemini supports audio via inline data
  const systemPrompt = `Você é o Nox IA 🤖, assessor financeiro pessoal via WhatsApp. Responda SEMPRE em português brasileiro.

📋 REGRAS DE FORMATAÇÃO:
- Use emojis relevantes em TODAS as respostas
- Separe informações em parágrafos curtos
- Use emojis no início de cada parágrafo
- Máximo 800 caracteres
- Seja caloroso e pessoal

🎙️ ÁUDIO RECEBIDO:
Transcreva o áudio e interprete o que foi dito.

Se for um comando de transação (ex: "gastei 50 reais no almoço"), responda SOMENTE com JSON:
{"action":"add_transaction","amount":50,"description":"Almoço","category":"Alimentação","type":"expense"}

Para perguntas normais, responda em texto formatado com emojis e parágrafos.

${financialContext}`;

  const audioFormat = mimeType.includes("ogg") ? "audio/ogg" : mimeType.includes("mp4") ? "audio/mp4" : "audio/mpeg";

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
              type: "image_url",
              image_url: { url: `data:${audioFormat};base64,${audioBase64}` },
            },
            { type: "text", text: "Transcreva e interprete este áudio financeiro." },
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

function isMediaMessage(message: any): boolean {
  // UAZAPI uses type "media" for all media, or specific types like ptt/audio/image
  const mediaTypes = ["media", "ptt", "audio", "image", "document", "video", "sticker"];
  return message.isMedia === true || mediaTypes.includes(message.type);
}

function isAudioMessage(message: any): boolean {
  return message.type === "ptt" ||
    message.type === "audio" ||
    (message.type === "media" && (message.mimetype?.startsWith("audio/") || message.mimetype?.includes("ogg"))) ||
    message.mimetype?.startsWith("audio/");
}

function isImageMessage(message: any): boolean {
  return message.type === "image" ||
    (message.type === "media" && message.mimetype?.startsWith("image/")) ||
    message.mimetype?.startsWith("image/");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();

    // Detailed log for debugging media messages
    console.log("Webhook payload:", JSON.stringify({
      EventType: body.EventType,
      chatPhone: body.chat?.phone,
      msgFromMe: body.message?.fromMe,
      msgType: body.message?.type,
      msgIsMedia: body.message?.isMedia,
      msgMimetype: body.message?.mimetype,
      msgId: body.message?.id,
      msgBody: body.message?.body,
      hasMediaUrl: !!(body.message?.mediaUrl || body.message?.media?.url),
      allMsgKeys: body.message ? Object.keys(body.message) : [],
    }));

    const message = body.message || {};
    const chat = body.chat || {};

    const phone = chat.number || chat.phone || message.number || message.phone || message.from || message.sender || body.number || body.from;
    const text = message.body || message.text || message.message || body.body || body.text;
    const isFromMe = message.fromMe || body.fromMe || false;
    // UAZAPI uses "messageid" (lowercase) in the webhook payload - confirmed from logs
    const messageId = message.messageid || message.id || message.messageId;
    const mediaType = message.mediaType || message.type;

    if (isFromMe) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isMedia = isMediaMessage(message);
    const hasText = !!(text && text.trim());

    if (!phone || (!hasText && !isMedia)) {
      console.log("Missing phone or content, skipping. phone:", phone, "text:", text, "isMedia:", isMedia);
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanPhone = phone.replace(/@.*$/, "").replace(/\D/g, "");
    const messageText = (text || "").trim();
    const isAudio = isAudioMessage(message);
    const isImage = isImageMessage(message);

    console.log(`Message from ${cleanPhone}: type=${message.type} isMedia=${isMedia} isAudio=${isAudio} isImage=${isImage} text="${messageText}"`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Check verification code (text only)
    if (hasText) {
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

    if (isMedia && messageId) {
      // Send acknowledgment while processing
      const mediaLabel = isAudio ? "🎙️ Processando seu áudio..." : "📸 Analisando o comprovante...";
      console.log(`Downloading media: messageId=${messageId} mediaType=${mediaType}`);
      await sendWhatsAppMessage(cleanPhone, mediaLabel);

      try {
        const mediaData = await downloadMediaFromUazapi(messageId, mediaType);

        if (!mediaData) {
          aiResponse = "😕 Não consegui baixar a mídia. Tente enviar novamente ou descreva por texto!";
        } else if (isAudio) {
          console.log("Processing audio, mimetype:", mediaData.mimetype);
          aiResponse = await processAudioWithAI(mediaData.base64, mediaData.mimetype, financialContext);
        } else if (isImage) {
          console.log("Processing image, mimetype:", mediaData.mimetype);
          const caption = message.caption || "";
          aiResponse = await processImageWithAI(mediaData.base64, mediaData.mimetype, financialContext, caption);
        } else {
          aiResponse = "📎 Recebi seu arquivo, mas só consigo processar áudios e imagens por enquanto!";
        }
      } catch (e) {
        console.error("Media processing error:", e);
        aiResponse = "😕 Não consegui processar a mídia. Tente novamente ou escreva por texto!";
      }
    } else {
      aiResponse = await processWithNoxIA(messageText, financialContext);
    }

    // Check if AI returned a transaction action
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
