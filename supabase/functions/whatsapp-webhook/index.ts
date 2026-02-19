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

// Send WhatsApp message with up to 3 quick-reply buttons via UAZAPI /send/menu
async function sendWhatsAppButtons(
  phone: string,
  body: string,
  buttons: { id: string; text: string }[],
  footer?: string
) {
  const UAZAPI_URL = Deno.env.get("UAZAPI_URL");
  const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");
  if (!UAZAPI_URL || !UAZAPI_TOKEN) throw new Error("UAZAPI credentials not configured");

  // UAZAPI V2 uses /send/menu with type "button"
  // choices = array of button label strings (max 3)
  const resp = await fetch(`${UAZAPI_URL}/send/menu`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: UAZAPI_TOKEN },
    body: JSON.stringify({
      number: phone,
      type: "button",
      text: body,
      footerText: footer || "",
      choices: buttons.map((b) => b.text),
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    console.warn("UAZAPI /send/menu error (falling back to text):", resp.status, t);
    // Fallback to plain text
    const fallback = body + (footer ? `\n\n${footer}` : "") +
      `\n\n${buttons.map(b => b.text).join(" | ")}`;
    return sendWhatsAppMessage(phone, fallback);
  }
  return resp.json();
}


async function decryptWhatsAppMedia(
  encryptedBuffer: ArrayBuffer,
  mediaKeyBase64: string,
  mediaType: string
): Promise<ArrayBuffer> {
  // WhatsApp media decryption:
  // 1. Derive keys using HKDF from mediaKey
  // 2. Decrypt with AES-CBC using derived key and IV
  const mediaKey = Uint8Array.from(atob(mediaKeyBase64), c => c.charCodeAt(0));

  // Media type info strings for HKDF
  const mediaTypeInfo: Record<string, string> = {
    "audio": "WhatsApp Audio Keys",
    "ptt":   "WhatsApp Audio Keys",
    "image": "WhatsApp Image Keys",
    "video": "WhatsApp Video Keys",
    "document": "WhatsApp Document Keys",
  };
  const infoString = mediaTypeInfo[mediaType] || "WhatsApp Audio Keys";

  // HKDF expand
  const baseKey = await crypto.subtle.importKey("raw", mediaKey, "HKDF", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode(infoString) },
    baseKey,
    112 * 8 // 112 bytes = IV(16) + AES key(32) + mac key(32) + ... 
  );
  const derivedBytes = new Uint8Array(derived);
  const iv = derivedBytes.slice(0, 16);
  const aesKey = derivedBytes.slice(16, 48);

  // Import AES-CBC key
  const cryptoKey = await crypto.subtle.importKey("raw", aesKey, { name: "AES-CBC" }, false, ["decrypt"]);

  // Encrypted file = IV(10) + ciphertext + mac(10) - skip first 0 bytes, strip last 10 (MAC)
  const encBytes = new Uint8Array(encryptedBuffer);
  // The file from CDN: first 0 bytes are empty, last 10 bytes are HMAC
  const ciphertext = encBytes.slice(0, encBytes.length - 10);

  const decrypted = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, cryptoKey, ciphertext);
  return decrypted;
}

// Extract media from webhook payload inline data
function extractMediaFromPayload(message: any, mediaType?: string): { encUrl?: string; base64?: string; mimetype: string; mediaKey?: string } | null {
  const content = message.content;
  console.log("Checking inline media in payload. content type:", typeof content, "keys:", content && typeof content === "object" ? Object.keys(content).join(", ") : String(content)?.substring(0, 100));

  if (content && typeof content === "object") {
    const mime = content.mimetype || content.mimeType || guessMimeType(mediaType);
    
    // base64 inline (already decoded)
    if (content.base64) {
      return { base64: content.base64, mimetype: mime };
    }
    
    // Encrypted WhatsApp CDN URL + mediaKey
    const url = content.URL || content.url || content.mediaUrl || content.fileUrl || content.downloadUrl || content.link;
    if (url) {
      console.log("Found media URL in content:", url.substring(0, 100), "mediaKey:", content.mediaKey ? "present" : "absent");
      return { encUrl: url, mimetype: mime, mediaKey: content.mediaKey };
    }
  }

  // String URL directly
  if (typeof content === "string" && (content.startsWith("http://") || content.startsWith("https://"))) {
    return { encUrl: content, mimetype: guessMimeType(mediaType) };
  }

  // Other message fields
  const mediaUrl = message.mediaUrl || message.media?.url || message.fileUrl || message.url;
  if (mediaUrl) {
    return { encUrl: mediaUrl, mimetype: message.mimetype || guessMimeType(mediaType) };
  }

  return null;
}

// Download and decrypt WhatsApp media
async function downloadMediaFromUazapi(messageId: string, mediaType?: string, message?: any): Promise<{ base64: string; mimetype: string } | null> {
  // 1. Try inline payload first
  if (message) {
    const inline = extractMediaFromPayload(message, mediaType);
    if (inline) {
      if (inline.base64) {
        return { base64: inline.base64, mimetype: inline.mimetype };
      }
      if (inline.encUrl) {
        try {
          console.log("Downloading encrypted media from WhatsApp CDN...");
          const resp = await fetch(inline.encUrl);
          if (resp.ok) {
            const encBuffer = await resp.arrayBuffer();
            console.log("Downloaded encrypted buffer size:", encBuffer.byteLength);

            let finalBuffer: ArrayBuffer;
            if (inline.mediaKey) {
              // Decrypt WhatsApp encrypted media
              const mt = (mediaType || "audio").toLowerCase();
              finalBuffer = await decryptWhatsAppMedia(encBuffer, inline.mediaKey, mt === "ptt" ? "audio" : mt);
              console.log("Decrypted buffer size:", finalBuffer.byteLength);
            } else {
              finalBuffer = encBuffer;
            }

            const bytes = new Uint8Array(finalBuffer);
            let binary = "";
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            const mime = inline.mimetype.split(";")[0].trim(); // "audio/ogg; codecs=opus" -> "audio/ogg"
            return { base64: btoa(binary), mimetype: mime };
          }
        } catch (e) {
          console.error("Error downloading/decrypting WhatsApp media:", e);
        }
      }
    }
  }

  const UAZAPI_URL = Deno.env.get("UAZAPI_URL");
  const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");
  if (!UAZAPI_URL || !UAZAPI_TOKEN) {
    console.error("UAZAPI credentials not configured");
    return null;
  }

  // 2. Try UAZAPI API endpoints as fallback
  const shortId = messageId.includes(":") ? messageId.split(":")[1] : messageId;

  const endpoints = [
    { method: "GET",  path: `/message/getMedia/${shortId}`, body: null },
    { method: "GET",  path: `/message/getLink/${shortId}`, body: null },
    { method: "GET",  path: `/message/${shortId}/download`, body: null },
    { method: "GET",  path: `/message/getMedia?messageid=${shortId}`, body: null },
    { method: "POST", path: "/message/getMedia", body: { messageid: shortId } },
    { method: "POST", path: "/message/getLink",  body: { messageid: shortId } },
  ];

  for (const ep of endpoints) {
    try {
      const fetchOpts: RequestInit = {
        method: ep.method,
        headers: { "Content-Type": "application/json", token: UAZAPI_TOKEN },
      };
      if (ep.body) fetchOpts.body = JSON.stringify(ep.body);

      const resp = await fetch(`${UAZAPI_URL}${ep.path}`, fetchOpts);
      if (!resp.ok) continue;

      const data = await resp.json();
      if (data.base64) {
        return { base64: data.base64, mimetype: data.mimetype || guessMimeType(mediaType) };
      }
      const url = data.url || data.mediaUrl || data.URL;
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

  console.error("All media download methods failed for messageId:", messageId);
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

  const systemPrompt = `Você é o Brave IA 🤖, assessor financeiro pessoal via WhatsApp.

📋 REGRAS DE FORMATAÇÃO:
- Use emojis relevantes em TODAS as respostas
- Separe informações em parágrafos curtos com quebras de linha
- Use emojis no início de cada parágrafo
- Para negrito use APENAS *texto* (um asterisco). NUNCA use **texto**.
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
  const systemPrompt = `Você é o Brave IA 🤖, assessor financeiro pessoal via WhatsApp. Responda SEMPRE em português brasileiro.

📋 REGRAS DE FORMATAÇÃO:
- Use emojis relevantes em TODAS as respostas
- Separe informações em parágrafos curtos
- Use emojis no início de cada parágrafo
- Para negrito use APENAS *texto* (um asterisco). NUNCA use **texto**.
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

  const systemPrompt = `Você é o Brave IA 🤖, assessor financeiro pessoal via WhatsApp. Responda SEMPRE em português brasileiro.

📋 REGRAS DE FORMATAÇÃO (MUITO IMPORTANTE):
- Use emojis relevantes em TODAS as respostas para deixar a conversa mais amigável e visual
- Separe informações em parágrafos curtos com quebras de linha entre eles
- Use emojis no início de cada parágrafo ou tópico
- Para negrito no WhatsApp use APENAS *texto* (um asterisco de cada lado). NUNCA use **texto** (dois asteriscos).
- Para itálico use _texto_. NUNCA use markdown com ##, ---  ou outros símbolos.
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
  const mt = (message.mediaType || message.type || "").toLowerCase();
  return mt === "ptt" ||
    mt === "audio" ||
    mt.includes("audio") ||
    message.mimetype?.startsWith("audio/") ||
    message.mimetype?.includes("ogg");
}

function isImageMessage(message: any): boolean {
  const mt = (message.mediaType || message.type || "").toLowerCase();
  return mt === "image" ||
    mt.includes("image") ||
    message.mimetype?.startsWith("image/");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();

    // Detailed log for debugging media messages
    // Log full content field for media diagnosis
    if (body.message?.content) {
      console.log("Message content field:", JSON.stringify(body.message.content).substring(0, 500));
    }

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

    // Button click responses from UAZAPI may come with empty text but buttonOrListid set
    const buttonId = message.buttonOrListid || message.selectedButtonId || message.buttonId || "";
    const isButtonResponse = !!(buttonId) || message.type === "buttonResponse" || message.type === "interactive";

    const isMedia = isMediaMessage(message);
    const hasText = !!(text && text.trim());
    const hasButtonResponse = !!(buttonId.trim());

    if (!phone || (!hasText && !isMedia && !hasButtonResponse)) {
      console.log("Missing phone or content, skipping. phone:", phone, "text:", text, "isMedia:", isMedia, "buttonId:", buttonId);
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanPhone = phone.replace(/@.*$/, "").replace(/\D/g, "");
    const messageText = (text || "").trim();
    // effectiveText considers both text messages and button click IDs
    const effectiveText = messageText || buttonId.trim();
    const isAudio = isAudioMessage(message);
    const isImage = isImageMessage(message);

    console.log(`Message from ${cleanPhone}: type=${message.type} isMedia=${isMedia} isAudio=${isAudio} isImage=${isImage} text="${messageText}" buttonId="${buttonId}"`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Check verification code (text only)
    if (hasText) {
      const codeMatch = messageText.match(/^(?:NOX|BRAVE)-(\d{6})$/i);
      if (codeMatch) {
        // Support both NOX- and BRAVE- prefixes
        const prefix = messageText.toUpperCase().startsWith("BRAVE") ? "BRAVE" : "NOX";
        const code = `${prefix}-${codeMatch[1]}`;
        const { data: link } = await supabaseAdmin
          .from("whatsapp_links")
          .select("*")
          .eq("verification_code", code)
          .eq("verified", false)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle();

        if (!link) {
          await sendWhatsAppMessage(cleanPhone, "❌ Código inválido ou expirado. Gere um novo código no app Brave.");
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
          '• Ver saldo: "Qual meu saldo?"\n' +
          '• Ver contas: "conferir"\n' +
          '• 🔔 Criar lembrete: "lembrete: reunião amanhã 15h"\n' +
          '• 📋 Ver seus lembretes: "meus lembretes"\n\n' +
          "Experimente agora! 💰"
        );

        return new Response(JSON.stringify({ ok: true, linked: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── "meu plano" command — check BEFORE looking up linked user ──
    const meuPlanoMatch = /^\s*(meu\s*plano|meu plano|meu\s+plano)\s*$/i.test(messageText);
    if (hasText && meuPlanoMatch) {
      // Try to find user by phone
      const { data: linkedForPlan } = await supabaseAdmin
        .from("whatsapp_links")
        .select("user_id")
        .eq("phone_number", cleanPhone)
        .eq("verified", true)
        .maybeSingle();

      if (!linkedForPlan) {
        await sendWhatsAppMessage(cleanPhone, "❌ Nenhuma conta vinculada a este número. Vincule pelo app Nox primeiro.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: planProfile } = await supabaseAdmin
        .from("profiles")
        .select("display_name, subscription_plan, subscription_expires_at")
        .eq("id", linkedForPlan.user_id)
        .maybeSingle();

      const planNames: Record<string, string> = {
        mensal: "Brave Mensal",
        anual: "Brave Anual",
        trimestral: "Brave Trimestral",
        free: "Gratuito",
      };
      const planBenefits: Record<string, string[]> = {
        mensal: ["✅ WhatsApp conectado", "✅ Cartões de crédito", "✅ Orçamentos por categoria", "✅ Relatórios detalhados", "✅ Previsões com IA", "🔒 Modo Família", "🔒 Análise comportamental"],
        anual:  ["✅ WhatsApp conectado", "✅ Cartões de crédito", "✅ Orçamentos por categoria", "✅ Relatórios detalhados", "✅ Previsões com IA", "✅ Modo Família (5 pessoas)", "✅ Análise comportamental"],
        trimestral: ["✅ WhatsApp conectado", "✅ Cartões de crédito", "✅ Orçamentos por categoria", "✅ Relatórios detalhados", "✅ Previsões com IA"],
        free: ["🔒 Acesso limitado", "🔒 WhatsApp desconectado"],
      };

      const currentPlan = planProfile?.subscription_plan || "free";
      const expiresAt = planProfile?.subscription_expires_at;
      const expiryLine = expiresAt
        ? `📅 *Válido até:* ${new Date(expiresAt).toLocaleDateString("pt-BR")}`
        : "";
      const daysLeft = expiresAt
        ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;
      const daysLine = daysLeft !== null
        ? (daysLeft <= 3 ? `\n⚠️ *Atenção:* seu plano expira em ${daysLeft} dia${daysLeft !== 1 ? "s" : ""}!` : `\n✅ Faltam ${daysLeft} dias para renovação.`)
        : "";
      const benefits = (planBenefits[currentPlan] || []).join("\n");

      const planMsg =
        `👑 *Seu Plano Brave*\n\n` +
        `📋 *Plano atual:* ${planNames[currentPlan] || currentPlan}\n` +
        (expiryLine ? `${expiryLine}\n` : "") +
        `${daysLine}\n\n` +
        `*Benefícios ativos:*\n${benefits}\n\n` +
        (currentPlan === "free" || daysLeft !== null && daysLeft <= 3
          ? `💳 Para renovar: Configurações → Planos e Assinatura no app Brave.\n\n`
          : "") +
        `_Brave IA - Seu assessor financeiro 🤖_`;

      await sendWhatsAppMessage(cleanPhone, planMsg);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // ── Helper: parse date/time in pt-BR ──
    function parseDateTimeBR(text: string): Date | null {
      const now = new Date();
      const lower = text.toLowerCase().trim();
      const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?h(?:(\d{2}))?|(\d{1,2}):(\d{2})/);
      let hour = 0, minute = 0, hasTime = false;
      if (timeMatch) {
        hasTime = true;
        if (timeMatch[4] !== undefined) { hour = parseInt(timeMatch[4]); minute = parseInt(timeMatch[5]); }
        else { hour = parseInt(timeMatch[1]); minute = parseInt(timeMatch[3] || timeMatch[2] || "0"); }
      }
      let date = new Date(now);
      const ddmmMatch = lower.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
      if (ddmmMatch) {
        const d = parseInt(ddmmMatch[1]), m = parseInt(ddmmMatch[2]) - 1;
        const y = ddmmMatch[3] ? (ddmmMatch[3].length === 2 ? 2000 + parseInt(ddmmMatch[3]) : parseInt(ddmmMatch[3])) : now.getFullYear();
        date = new Date(y, m, d, hour, minute, 0);
      } else if (lower.includes("amanhã") || lower.includes("amanha")) {
        date.setDate(date.getDate() + 1); date.setHours(hour, minute, 0, 0);
      } else if (lower.includes("hoje")) {
        date.setHours(hour, minute, 0, 0);
      } else if (/segunda/.test(lower)) date = nextWD(now, 1, hour, minute);
      else if (/terça|terca/.test(lower)) date = nextWD(now, 2, hour, minute);
      else if (/quarta/.test(lower)) date = nextWD(now, 3, hour, minute);
      else if (/quinta/.test(lower)) date = nextWD(now, 4, hour, minute);
      else if (/sexta/.test(lower)) date = nextWD(now, 5, hour, minute);
      else if (/sábado|sabado/.test(lower)) date = nextWD(now, 6, hour, minute);
      else if (/domingo/.test(lower)) date = nextWD(now, 0, hour, minute);
      else if (hasTime) { date.setHours(hour, minute, 0, 0); if (date <= now) date.setDate(date.getDate() + 1); }
      else return null;
      return date;
    }
    function nextWD(from: Date, wd: number, h: number, m: number): Date {
      const d = new Date(from); const diff = (wd - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff); d.setHours(h, m, 0, 0); return d;
    }
    function parseNotifyMinutes(text: string): number | null {
      const lower = text.toLowerCase();
      const dia = lower.match(/(\d+)\s*dia/); if (dia) return parseInt(dia[1]) * 1440;
      const hora = lower.match(/(\d+)\s*h(?:ora)?/); if (hora) return parseInt(hora[1]) * 60;
      const min = lower.match(/(\d+)\s*min/); if (min) return parseInt(min[1]);
      const sh = lower.match(/^(\d+)h$/); if (sh) return parseInt(sh[1]) * 60;
      const sm = lower.match(/^(\d+)m$/); if (sm) return parseInt(sm[1]);
      const sd = lower.match(/^(\d+)d$/); if (sd) return parseInt(sd[1]) * 1440;
      return null;
    }
    function parseRecurrence(text: string): string {
      const lower = text.toLowerCase();
      if (/\b(todo\s*dia|diário|diario|diariamente)\b/.test(lower)) return "daily";
      if (/\b(toda\s*semana|semanalmente|semanal)\b/.test(lower)) return "weekly";
      if (/\b(todo\s*m[eê]s|mensalmente|mensal)\b/.test(lower)) return "monthly";
      if (/\b(toda\s*(segunda|terça|quarta|quinta|sexta|s[aá]bado|domingo))\b/.test(lower)) return "weekly";
      return "none";
    }

    // ── Session-based multi-step flow (bill payment + reminder creation) ──
    {
      const { data: session } = await supabaseAdmin
        .from("whatsapp_sessions")
        .select("*")
        .eq("phone_number", cleanPhone)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (session) {
        const ctx = session.context as any;
        const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        // ── Step: waiting for user to pick which bill to mark as paid ──
        if (session.step === "bill_selection") {
          const bills: any[] = ctx.bills || [];

          // Cancel command
          if (/^\s*(cancelar|cancel|sair|exit)\s*$/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Operação cancelada.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Try to match by number (1, 2, 3...) or partial description
          let matched: any = null;
          const numMatch = effectiveText.match(/^(\d+)$/);
          if (numMatch) {
            const idx = parseInt(numMatch[1]) - 1;
            if (idx >= 0 && idx < bills.length) matched = bills[idx];
          } else {
            matched = bills.find((b: any) =>
              b.description.toLowerCase().includes(effectiveText.toLowerCase())
            );
          }

          if (!matched) {
            const opts = bills.map((b: any, i: number) => `${i + 1}. ${b.description} — ${fmt(Number(b.amount))}`).join("\n");
            await sendWhatsAppMessage(cleanPhone,
              `❓ Não encontrei essa conta. Responda com o *número* da conta:\n\n${opts}\n\nOu envie *cancelar* para sair.`
            );
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Fetch user wallets
          const { data: wallets } = await supabaseAdmin
            .from("wallets")
            .select("id, name, balance, type")
            .eq("user_id", ctx.user_id)
            .order("created_at", { ascending: true });

          // Update session to wallet_selection step
          await supabaseAdmin
            .from("whatsapp_sessions")
            .update({
              step: "wallet_selection",
              context: { ...ctx, selected_bill: matched, wallets: wallets || [] },
              expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            })
            .eq("id", session.id);

          const walletList = (wallets || []).map((w: any, i: number) =>
            `${i + 1}. ${w.name} — saldo: ${fmt(Number(w.balance))}`
          ).join("\n");

          const due = matched.due_date
            ? new Date(matched.due_date + "T12:00:00").toLocaleDateString("pt-BR")
            : "—";

          await sendWhatsAppMessage(cleanPhone,
            `✅ *${matched.description}* selecionada!\n` +
            `💵 Valor: ${fmt(Number(matched.amount))} · vence ${due}\n\n` +
            `💳 De qual conta/carteira saiu o pagamento?\n\n${walletList}\n\n` +
            `Responda com o *número* ou *nome* da carteira. Ou envie *cancelar*.`
          );
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: waiting for wallet selection ──
        if (session.step === "wallet_selection") {
          const selectedBill: any = ctx.selected_bill;
          const wallets: any[] = ctx.wallets || [];

          // Cancel command
          if (/^\s*(cancelar|cancel|sair|exit)\s*$/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Operação cancelada.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          let matchedWallet: any = null;
          const numMatch = effectiveText.match(/^(\d+)$/);
          if (numMatch) {
            const idx = parseInt(numMatch[1]) - 1;
            if (idx >= 0 && idx < wallets.length) matchedWallet = wallets[idx];
          } else {
            matchedWallet = wallets.find((w: any) =>
              w.name.toLowerCase().includes(effectiveText.toLowerCase())
            );
          }

          if (!matchedWallet) {
            const opts = wallets.map((w: any, i: number) => `${i + 1}. ${w.name} — ${fmt(Number(w.balance))}`).join("\n");
            await sendWhatsAppMessage(cleanPhone,
              `❓ Não encontrei essa carteira. Responda com o *número*:\n\n${opts}\n\nOu envie *cancelar*.`
            );
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Mark the bill as paid
          const { error: updateErr } = await supabaseAdmin
            .from("transactions")
            .update({ is_paid: true })
            .eq("id", selectedBill.id)
            .eq("user_id", ctx.user_id);

          if (updateErr) {
            await sendWhatsAppMessage(cleanPhone, `❌ Erro ao marcar como pago: ${updateErr.message}`);
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Deduct amount from wallet
          const newBalance = Number(matchedWallet.balance) - Number(selectedBill.amount);
          await supabaseAdmin
            .from("wallets")
            .update({ balance: newBalance })
            .eq("id", matchedWallet.id);

          // Clean up session
          await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);

          await sendWhatsAppMessage(cleanPhone,
            `✅ *Conta paga com sucesso!*\n\n` +
            `📝 ${selectedBill.description}\n` +
            `💵 ${fmt(Number(selectedBill.amount))}\n` +
            `💳 Debitado de: *${matchedWallet.name}*\n` +
            `💰 Novo saldo da carteira: ${fmt(newBalance)}\n\n` +
            `_Brave Assessor - Seu assessor financeiro 🤖_`
          );
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: waiting for notify_minutes_before ──
        if (session.step === "reminder_notify") {
          const cancel = /^\s*(cancelar|cancel|sair)\s*$/i.test(effectiveText);
          if (cancel) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Lembrete cancelado.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Try button value first (e.g. "30 min", "1h", "1 dia")
          const notifyMins = parseNotifyMinutes(effectiveText);
          if (notifyMins === null) {
            await sendWhatsAppButtons(
              cleanPhone,
              "⏰ Não entendi. Quanto tempo antes você quer ser avisado?\n\nExemplo: 30 min, 1h, 2h, 1 dia",
              [{ id: "30m", text: "30 minutos" }, { id: "1h", text: "1 hora" }, { id: "1d", text: "1 dia" }],
              "Ou escreva manualmente"
            );
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // All data gathered – create the reminder
          const reminderCtx = ctx;
          await supabaseAdmin.from("reminders").insert({
            user_id: ctx.user_id,
            title: reminderCtx.title,
            description: reminderCtx.description || null,
            event_at: reminderCtx.event_at,
            notify_minutes_before: notifyMins,
            recurrence: reminderCtx.recurrence || "none",
          });

          await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);

          const fmtDate = (s: string) =>
            new Date(s).toLocaleString("pt-BR", {
              day: "2-digit", month: "2-digit", year: "numeric",
              hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
            });

          let notifyLabel = "";
          if (notifyMins < 60) notifyLabel = `${notifyMins} minutos`;
          else if (notifyMins < 1440) notifyLabel = `${notifyMins / 60} hora(s)`;
          else notifyLabel = `${notifyMins / 1440} dia(s)`;

          await sendWhatsAppMessage(cleanPhone,
            `✅ *Lembrete criado com sucesso!*\n\n` +
            `🔔 *${reminderCtx.title}*\n` +
            `📅 ${fmtDate(reminderCtx.event_at)}\n` +
            `⏰ Você será avisado *${notifyLabel} antes*\n\n` +
            `_Brave IA - Seu assessor financeiro 🤖_`
          );
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: listing reminders — user picks one ──
        if (session.step === "list_reminders") {
          const reminders: any[] = ctx.reminders || [];

          if (/^\s*(cancelar|sair|voltar)\s*$/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "👌 Ok, saindo da lista de lembretes.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          const numMatch = effectiveText.match(/^(\d+)$/);
          let chosen: any = null;
          if (numMatch) {
            const idx = parseInt(numMatch[1]) - 1;
            if (idx >= 0 && idx < reminders.length) chosen = reminders[idx];
          }

          if (!chosen) {
            const list = reminders.map((r: any, i: number) => {
              const dt = new Date(r.event_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
              return `${i + 1}. 🔔 ${r.title} — ${dt}`;
            }).join("\n");
            await sendWhatsAppMessage(cleanPhone,
              `❓ Não entendi. Responda com o *número* do lembrete:\n\n${list}\n\nOu envie *cancelar* para sair.`
            );
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Show chosen reminder and offer actions
          await supabaseAdmin.from("whatsapp_sessions").update({
            step: "reminder_action",
            context: { ...ctx, chosen_reminder: chosen },
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          }).eq("id", session.id);

          const dt = new Date(chosen.event_at).toLocaleString("pt-BR", {
            day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
          });
          const recMap: Record<string, string> = { none: "", daily: "🔁 Diário", weekly: "🔁 Semanal", monthly: "🔁 Mensal" };
          const recLabel = recMap[chosen.recurrence] || "";

          await sendWhatsAppButtons(
            cleanPhone,
            `🔔 *${chosen.title}*\n📅 ${dt}${recLabel ? `\n${recLabel}` : ""}\n\nO que deseja fazer?`,
            [{ id: "EDIT_REMINDER", text: "✏️ Editar" }, { id: "DELETE_REMINDER", text: "🗑️ Cancelar lembrete" }, { id: "BACK_REMINDERS", text: "⬅️ Voltar" }],
            "Escolha uma opção"
          );
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: action on a chosen reminder ──
        if (session.step === "reminder_action") {
          const chosen: any = ctx.chosen_reminder;

          if (/^(DELETE_REMINDER|cancelar.?lembrete|remover.?lembrete|deletar)/i.test(effectiveText)) {
            await sendWhatsAppButtons(
              cleanPhone,
              `⚠️ Tem certeza que quer cancelar o lembrete *${chosen.title}*?`,
              [{ id: "CONFIRM_DELETE_REMINDER", text: "✅ Sim, cancelar" }, { id: "BACK_REMINDERS", text: "❌ Não, voltar" }],
              ""
            );
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (/^CONFIRM_DELETE_REMINDER/i.test(effectiveText)) {
            await supabaseAdmin.from("reminders").delete().eq("id", chosen.id);
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, `🗑️ Lembrete *${chosen.title}* cancelado com sucesso!`);
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (/^(BACK_REMINDERS|voltar)/i.test(effectiveText)) {
            // Rebuild the reminder list
            const reminders: any[] = ctx.reminders || [];
            const list = reminders.map((r: any, i: number) => {
              const dt = new Date(r.event_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
              return `${i + 1}. 🔔 ${r.title} — ${dt}`;
            }).join("\n");

            await supabaseAdmin.from("whatsapp_sessions").update({
              step: "list_reminders",
              context: ctx,
              expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            }).eq("id", session.id);

            await sendWhatsAppMessage(cleanPhone, `📋 *Seus lembretes ativos:*\n\n${list}\n\nResponda com o *número* para gerenciar ou envie *cancelar*.`);
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (/^(EDIT_REMINDER|editar)/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").update({
              step: "reminder_edit_field",
              context: { ...ctx, chosen_reminder: chosen },
              expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            }).eq("id", session.id);

            await sendWhatsAppButtons(
              cleanPhone,
              `✏️ *Editar: ${chosen.title}*\n\nO que deseja alterar?`,
              [{ id: "EDIT_TITLE", text: "📝 Nome" }, { id: "EDIT_DATE", text: "📅 Data/hora" }, { id: "EDIT_NOTIFY", text: "⏰ Aviso antecipado" }],
              "Escolha o que editar"
            );
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }

        // ── Step: user chose which field to edit ──
        if (session.step === "reminder_edit_field") {
          const chosen: any = ctx.chosen_reminder;

          if (/^EDIT_TITLE/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").update({
              step: "reminder_edit_value",
              context: { ...ctx, edit_field: "title" },
              expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            }).eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, `📝 Envie o *novo nome* para o lembrete "${chosen.title}":`);
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (/^EDIT_DATE/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").update({
              step: "reminder_edit_value",
              context: { ...ctx, edit_field: "event_at" },
              expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            }).eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, `📅 Envie a *nova data e hora* do lembrete "${chosen.title}":\n\nExemplo: amanhã 15h, 25/02 10:00, sexta 14h`);
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (/^EDIT_NOTIFY/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").update({
              step: "reminder_edit_value",
              context: { ...ctx, edit_field: "notify_minutes_before" },
              expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            }).eq("id", session.id);
            await sendWhatsAppButtons(
              cleanPhone,
              `⏰ Com quanto tempo de antecedência quer ser avisado sobre "${chosen.title}"?`,
              [{ id: "30m", text: "30 minutos" }, { id: "1h", text: "1 hora" }, { id: "1d", text: "1 dia" }],
              "Ou escreva: 2h, 15 min, 3 dias..."
            );
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }

        // ── Step: user typed the new value for the edited field ──
        if (session.step === "reminder_edit_value") {
          const chosen: any = ctx.chosen_reminder;
          const field: string = ctx.edit_field;
          let updateData: any = {};
          let successMsg = "";

          if (field === "title") {
            if (!effectiveText || effectiveText.length < 2) {
              await sendWhatsAppMessage(cleanPhone, "❓ Por favor, envie um nome válido para o lembrete.");
              return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
            updateData.title = effectiveText;
            successMsg = `✅ Nome atualizado para *${effectiveText}*!`;
          } else if (field === "event_at") {
            const newDate = parseDateTimeBR(effectiveText);
            if (!newDate) {
              await sendWhatsAppMessage(cleanPhone, `❓ Não entendi a data. Tente: "amanhã 15h", "25/02 10:00", "sexta 14h"`);
              return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
            updateData.event_at = newDate.toISOString();
            updateData.is_sent = false;
            const dt = newDate.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
            successMsg = `✅ Data atualizada para *${dt}*!`;
          } else if (field === "notify_minutes_before") {
            const mins = parseNotifyMinutes(effectiveText);
            if (mins === null) {
              await sendWhatsAppButtons(
                cleanPhone,
                "❓ Não entendi. Escolha ou escreva o tempo de antecedência:",
                [{ id: "30m", text: "30 minutos" }, { id: "1h", text: "1 hora" }, { id: "1d", text: "1 dia" }],
                "Ou escreva: 2h, 15 min..."
              );
              return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
            updateData.notify_minutes_before = mins;
            let label = mins < 60 ? `${mins} minutos` : mins < 1440 ? `${mins / 60} hora(s)` : `${mins / 1440} dia(s)`;
            successMsg = `✅ Aviso atualizado para *${label} antes*!`;
          }

          if (Object.keys(updateData).length > 0) {
            await supabaseAdmin.from("reminders").update(updateData).eq("id", chosen.id);
          }

          await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
          await sendWhatsAppMessage(cleanPhone, `${successMsg}\n\n🔔 *${updateData.title || chosen.title}*\n_Brave IA - Seu assessor financeiro 🤖_`);
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: confirming reminder details ──
        if (session.step === "reminder_confirm") {
          const cancel = /^\s*(cancelar|cancel|não|nao|n)\s*$/i.test(effectiveText);
          if (cancel) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Lembrete cancelado.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // CONFIRM_REMINDER or "sim"
          if (/^\s*(sim|s|ok|yes|confirmar|✅|CONFIRM_REMINDER)\s*$/i.test(effectiveText) || effectiveText === "CONFIRM_REMINDER") {
            // Create the reminder
            await supabaseAdmin.from("reminders").insert({
              user_id: ctx.user_id,
              title: ctx.title,
              description: ctx.description || null,
              event_at: ctx.event_at,
              notify_minutes_before: ctx.notify_minutes_before,
              recurrence: ctx.recurrence || "none",
            });

            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);

            const fmtDate = (s: string) =>
              new Date(s).toLocaleString("pt-BR", {
                day: "2-digit", month: "2-digit", year: "numeric",
                hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
              });

            let notifyLabel = "";
            const nm = ctx.notify_minutes_before;
            if (nm < 60) notifyLabel = `${nm} minutos`;
            else if (nm < 1440) notifyLabel = `${nm / 60} hora(s)`;
            else notifyLabel = `${nm / 1440} dia(s)`;

            await sendWhatsAppMessage(cleanPhone,
              `✅ *Lembrete criado!*\n\n` +
              `🔔 *${ctx.title}*\n` +
              `📅 ${fmtDate(ctx.event_at)}\n` +
              `⏰ Aviso *${notifyLabel} antes*\n\n` +
              `_Brave IA - Seu assessor financeiro 🤖_`
            );
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }
      }
    }

    // ── "lembrete:" trigger — create reminder via WhatsApp ──
    const reminderTrigger = /^\s*lembrete\s*[:;]?\s*/i;
    if (reminderTrigger.test(messageText) && hasText) {
      const { data: linkedForReminder } = await supabaseAdmin
        .from("whatsapp_links")
        .select("user_id")
        .eq("phone_number", cleanPhone)
        .eq("verified", true)
        .maybeSingle();

      if (!linkedForReminder) {
        await sendWhatsAppMessage(cleanPhone, "❌ Nenhuma conta vinculada. Vincule pelo app Brave primeiro.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const reminderText = messageText.replace(reminderTrigger, "").trim();

      // Extract title: everything before date/time keywords or separators
      let title = reminderText
        .replace(/,?\s*(amanhã|amanha|hoje|segunda|terça|quarta|quinta|sexta|sábado|sabado|domingo|\d{1,2}\/\d{1,2}|\d{1,2}h|\d{2}:\d{2}).*/i, "")
        .trim();
      if (!title) title = reminderText.split(/[,;]/)[0].trim();

      // Parse date/time
      const eventDate = parseDateTimeBR(reminderText);

      // Parse notify time ("avisar X antes")
      const notifyMatch = reminderText.match(/avisar\s+(.+?)(?:\s+antes|\s*$)/i);
      const notifyMins = notifyMatch ? parseNotifyMinutes(notifyMatch[1]) : null;

      // Parse recurrence
      const recurrence = parseRecurrence(reminderText);

      // Clear any old reminder sessions
      await supabaseAdmin.from("whatsapp_sessions").delete()
        .eq("phone_number", cleanPhone).like("step", "reminder_%");

      if (!eventDate) {
        // Ask for date/time
        await supabaseAdmin.from("whatsapp_sessions").insert({
          phone_number: cleanPhone,
          step: "reminder_notify",
          context: {
            user_id: linkedForReminder.user_id,
            title: title || "Lembrete",
            event_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            notify_minutes_before: 30,
            recurrence,
            awaiting: "date",
          },
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        });
        await sendWhatsAppMessage(cleanPhone,
          `🔔 *Criando lembrete: ${title || "Lembrete"}*\n\n` +
          `📅 Qual a data e horário do evento?\n\nExemplo: amanhã 15h, 19/02 16:00, sexta 10h`
        );
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (notifyMins === null) {
        // Have date, need notify time
        await supabaseAdmin.from("whatsapp_sessions").insert({
          phone_number: cleanPhone,
          step: "reminder_notify",
          context: {
            user_id: linkedForReminder.user_id,
            title: title || reminderText,
            event_at: eventDate.toISOString(),
            recurrence,
          },
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        });

        const fmtDate = eventDate.toLocaleString("pt-BR", {
          day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
        });

        await sendWhatsAppButtons(
          cleanPhone,
          `🔔 *${title || reminderText}*\n📅 ${fmtDate}\n\n⏰ Com quanto tempo de antecedência você quer ser avisado?`,
          [{ id: "30m", text: "30 minutos" }, { id: "1h", text: "1 hora" }, { id: "1d", text: "1 dia" }],
          "Ou escreva: 2h, 15 min, 3 horas..."
        );
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Have everything — show confirmation
      await supabaseAdmin.from("whatsapp_sessions").insert({
        phone_number: cleanPhone,
        step: "reminder_confirm",
        context: {
          user_id: linkedForReminder.user_id,
          title: title || reminderText,
          event_at: eventDate.toISOString(),
          notify_minutes_before: notifyMins,
          recurrence,
        },
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

      const fmtDate = eventDate.toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
      });
      let notifyLabel = "";
      if (notifyMins < 60) notifyLabel = `${notifyMins} minutos`;
      else if (notifyMins < 1440) notifyLabel = `${notifyMins / 60} hora(s)`;
      else notifyLabel = `${notifyMins / 1440} dia(s)`;
      const recLabel: Record<string, string> = { none: "", daily: "🔁 Diário", weekly: "🔁 Semanal", monthly: "🔁 Mensal" };

      await sendWhatsAppButtons(
        cleanPhone,
        `🔔 *Confirmar lembrete?*\n\n` +
        `📝 *${title || reminderText}*\n` +
        `📅 ${fmtDate}\n` +
        `⏰ Aviso: *${notifyLabel} antes*\n` +
        (recLabel[recurrence] ? `${recLabel[recurrence]}\n` : ""),
        [{ id: "CONFIRM_REMINDER", text: "✅ Confirmar" }, { id: "cancelar", text: "❌ Cancelar" }],
        "Toque para confirmar"
      );
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (effectiveText === "MARK_PAID" || /^\s*(marcar.?como.?pago|pagar.?conta|marcar.?pago)\s*$/i.test(effectiveText)) {
      const { data: linkedForPay } = await supabaseAdmin
        .from("whatsapp_links")
        .select("user_id")
        .eq("phone_number", cleanPhone)
        .eq("verified", true)
        .maybeSingle();

      if (!linkedForPay) {
        await sendWhatsAppMessage(cleanPhone, "❌ Nenhuma conta vinculada. Vincule pelo app Brave primeiro.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + 30);
      const futureDateStr = futureDate.toISOString().slice(0, 10);

      const { data: upcomingForPay } = await supabaseAdmin
        .from("transactions")
        .select("id, description, amount, type, due_date, categories(name)")
        .eq("user_id", linkedForPay.user_id)
        .eq("is_paid", false)
        .eq("type", "expense")
        .gte("due_date", todayStr)
        .lte("due_date", futureDateStr)
        .order("due_date", { ascending: true })
        .limit(10);

      const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const payBills = upcomingForPay || [];

      if (payBills.length === 0) {
        await sendWhatsAppMessage(cleanPhone, "✅ Nenhuma conta a pagar nos próximos 30 dias. Tudo em dia! 🎉");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Create session for bill_selection
      await supabaseAdmin
        .from("whatsapp_sessions")
        .delete()
        .eq("phone_number", cleanPhone); // clear any old sessions

      await supabaseAdmin.from("whatsapp_sessions").insert({
        phone_number: cleanPhone,
        step: "bill_selection",
        context: { user_id: linkedForPay.user_id, bills: payBills },
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

      const list = payBills.map((b: any, i: number) => {
        const due = b.due_date ? new Date(b.due_date + "T12:00:00").toLocaleDateString("pt-BR") : "—";
        return `${i + 1}. ${b.description} — ${fmt(Number(b.amount))} · vence ${due}`;
      }).join("\n");

      await sendWhatsAppMessage(cleanPhone,
        `💳 *Qual conta deseja marcar como paga?*\n\n${list}\n\n` +
        `Responda com o *número* ou *nome* da conta.\nOu envie *cancelar* para sair.`
      );
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── "meus lembretes" command — list active reminders ──
    const meusLembretesMatch = /^\s*(meus\s+lembretes|lembretes|ver\s+lembretes|meus\s+compromissos)\s*$/i.test(effectiveText);
    if (meusLembretesMatch) {
      const { data: linkedForReminders } = await supabaseAdmin
        .from("whatsapp_links")
        .select("user_id")
        .eq("phone_number", cleanPhone)
        .eq("verified", true)
        .maybeSingle();

      if (!linkedForReminders) {
        await sendWhatsAppMessage(cleanPhone, "❌ Nenhuma conta vinculada. Vincule pelo app Brave primeiro.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const now = new Date();
      const { data: activeReminders } = await supabaseAdmin
        .from("reminders")
        .select("id, title, description, event_at, notify_minutes_before, recurrence, is_active")
        .eq("user_id", linkedForReminders.user_id)
        .eq("is_active", true)
        .gt("event_at", now.toISOString())
        .order("event_at", { ascending: true })
        .limit(10);

      if (!activeReminders || activeReminders.length === 0) {
        await sendWhatsAppMessage(cleanPhone,
          "📭 Você não tem lembretes ativos no momento.\n\n" +
          "Para criar um, envie:\n" +
          "_lembrete: reunião amanhã 15h_\n\n" +
          "_Brave IA - Seu assessor financeiro 🤖_"
        );
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const recMap: Record<string, string> = { none: "", daily: "🔁", weekly: "🔁", monthly: "🔁" };
      const list = activeReminders.map((r: any, i: number) => {
        const dt = new Date(r.event_at).toLocaleString("pt-BR", {
          day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
        });
        const rec = recMap[r.recurrence] || "";
        return `${i + 1}. ${rec} 🔔 *${r.title}*\n    📅 ${dt}`;
      }).join("\n\n");

      // Create session for list interaction
      await supabaseAdmin.from("whatsapp_sessions").delete().eq("phone_number", cleanPhone);
      await supabaseAdmin.from("whatsapp_sessions").insert({
        phone_number: cleanPhone,
        step: "list_reminders",
        context: { user_id: linkedForReminders.user_id, reminders: activeReminders },
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

      await sendWhatsAppMessage(cleanPhone,
        `📋 *Seus próximos lembretes (${activeReminders.length}):*\n\n${list}\n\n` +
        `Responda com o *número* para editar ou cancelar um lembrete.\nEnvie *cancelar* para sair.`
      );
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── "conferir" / CHECK_BILLS command — show upcoming unpaid bills ──
    const checkBillsMatch = /^\s*(conferir|check.?bills|ver.?contas|minhas.?contas|contas)\s*$/i.test(effectiveText) || effectiveText === "CHECK_BILLS";
    if (checkBillsMatch) {
      const { data: linkedForBills } = await supabaseAdmin
        .from("whatsapp_links")
        .select("user_id")
        .eq("phone_number", cleanPhone)
        .eq("verified", true)
        .maybeSingle();

      if (!linkedForBills) {
        await sendWhatsAppMessage(cleanPhone, "❌ Nenhuma conta vinculada a este número. Vincule pelo app Brave primeiro.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + 7);
      const futureDateStr = futureDate.toISOString().slice(0, 10);

      const { data: upcoming } = await supabaseAdmin
        .from("transactions")
        .select("id, description, amount, type, due_date, is_paid, categories(name)")
        .eq("user_id", linkedForBills.user_id)
        .eq("is_paid", false)
        .gte("due_date", todayStr)
        .lte("due_date", futureDateStr)
        .order("due_date", { ascending: true })
        .limit(15);

      const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const bills = (upcoming || []).filter((t: any) => t.type === "expense");
      const receivables = (upcoming || []).filter((t: any) => t.type === "income");

      if (bills.length === 0 && receivables.length === 0) {
        await sendWhatsAppMessage(cleanPhone, "✅ Você não tem contas pendentes nos próximos 7 dias. Tudo em dia! 🎉");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const lines: string[] = ["📋 *Suas contas dos próximos 7 dias:*"];

      if (bills.length > 0) {
        const total = bills.reduce((s: number, t: any) => s + Number(t.amount), 0);
        lines.push("\n💸 *A Pagar:*");
        bills.forEach((t: any, i: number) => {
          const cat = (t as any).categories?.name || "Geral";
          const due = t.due_date ? new Date(t.due_date + "T12:00:00").toLocaleDateString("pt-BR") : "—";
          lines.push(`${i + 1}. ${t.description} — ${fmt(Number(t.amount))} · vence ${due} · ${cat}`);
        });
        lines.push(`💸 *Total a pagar: ${fmt(total)}*`);
      }

      if (receivables.length > 0) {
        const total = receivables.reduce((s: number, t: any) => s + Number(t.amount), 0);
        lines.push("\n💰 *A Receber:*");
        receivables.forEach((t: any) => {
          const due = t.due_date ? new Date(t.due_date + "T12:00:00").toLocaleDateString("pt-BR") : "—";
          lines.push(`• ${t.description} — ${fmt(Number(t.amount))} · previsto ${due}`);
        });
        lines.push(`✅ *Total a receber: ${fmt(total)}*`);
      }

      lines.push("\n_Brave Assessor - Seu assessor financeiro 🤖_");

      // Send the bill list first
      await sendWhatsAppMessage(cleanPhone, lines.join("\n"));

      // If there are bills to pay, also send the "Marcar como Pago" button
      if (bills.length > 0) {
        await sendWhatsAppButtons(
          cleanPhone,
          "Deseja marcar alguma conta como paga?",
          [{ id: "MARK_PAID", text: "💳 Marcar como Pago" }],
          "Clique para iniciar"
        );
      }

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: link } = await supabaseAdmin
      .from("whatsapp_links")
      .select("user_id")
      .eq("phone_number", cleanPhone)
      .eq("verified", true)
      .maybeSingle();

    if (!link) {
      await sendWhatsAppMessage(cleanPhone,
        "👋 Olá! Sou o Brave IA, seu assessor financeiro.\n\n" +
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

    // ── PRIORITY 1: Check if user is interacting with a pending transaction ──
    // This must happen BEFORE calling AI, so button clicks get handled immediately
    if (effectiveText) {
      const { data: pending } = await supabaseAdmin
        .from("whatsapp_pending_transactions")
        .select("*")
        .eq("phone_number", cleanPhone)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pending) {
        console.log(`Pending transaction found: ${pending.id}, effectiveText="${effectiveText}"`);

        const confirmMatch = effectiveText.match(/^(sim|s|confirmar|ok|yes|confirm|✅ confirmar)$/i);
        const cancelMatch  = effectiveText.match(/^(não|nao|n|cancelar|cancel|no|❌ cancelar)$/i);
        const amountMatch  = effectiveText.match(/^r?\$?\s*(\d+(?:[.,]\d{1,2})?)$/i);
        const descMatch    = effectiveText.match(/^(?:desc(?:rição)?|descrição|nome|item)\s*[:\-]\s*(.+)$/i);
        const typeMatch    = effectiveText.match(/^(receita|income|entrada|despesa|expense|gasto|saída|saida)$/i);
        const catMatch     = !confirmMatch && !cancelMatch && !amountMatch && !descMatch && !typeMatch
          ? (categories || []).find((c: any) => effectiveText.toLowerCase() === c.name.toLowerCase())
          : null;

        if (cancelMatch) {
          await supabaseAdmin.from("whatsapp_pending_transactions").delete().eq("id", pending.id);
          await sendWhatsAppMessage(cleanPhone, "❌ Transação cancelada!");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (amountMatch) {
          const newAmount = parseFloat(amountMatch[1].replace(",", "."));
          await supabaseAdmin
            .from("whatsapp_pending_transactions")
            .update({ amount: newAmount })
            .eq("id", pending.id);
          const emoji = pending.type === "income" ? "💰" : "💸";
          await sendWhatsAppButtons(
            cleanPhone,
            `✏️ Valor atualizado para *R$ ${newAmount.toFixed(2)}*\n\n` +
            `${emoji} *Confirmar transação?*\n\n` +
            `📝 ${pending.description}\n` +
            `💵 R$ ${newAmount.toFixed(2)}\n` +
            `📂 ${pending.category_name || "Sem categoria"}`,
            [{ id: "sim", text: "✅ Confirmar" }, { id: "nao", text: "❌ Cancelar" }],
            "Ou corrija: valor, descrição, categoria ou tipo"
          );
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (descMatch) {
          const newDesc = descMatch[1].trim();
          await supabaseAdmin
            .from("whatsapp_pending_transactions")
            .update({ description: newDesc })
            .eq("id", pending.id);
          const emoji = pending.type === "income" ? "💰" : "💸";
          await sendWhatsAppButtons(
            cleanPhone,
            `✏️ Descrição atualizada para *${newDesc}*\n\n` +
            `${emoji} *Confirmar transação?*\n\n` +
            `📝 ${newDesc}\n` +
            `💵 R$ ${Number(pending.amount).toFixed(2)}\n` +
            `📂 ${pending.category_name || "Sem categoria"}`,
            [{ id: "sim", text: "✅ Confirmar" }, { id: "nao", text: "❌ Cancelar" }],
            "Ou corrija: valor, descrição, categoria ou tipo"
          );
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (typeMatch) {
          const isIncome = /receita|income|entrada/i.test(effectiveText);
          const newType = isIncome ? "income" : "expense";
          await supabaseAdmin
            .from("whatsapp_pending_transactions")
            .update({ type: newType })
            .eq("id", pending.id);
          const emoji = newType === "income" ? "💰" : "💸";
          const typeLabel = newType === "income" ? "Receita" : "Despesa";
          await sendWhatsAppButtons(
            cleanPhone,
            `✏️ Tipo alterado para *${typeLabel}*\n\n` +
            `${emoji} *Confirmar transação?*\n\n` +
            `📝 ${pending.description}\n` +
            `💵 R$ ${Number(pending.amount).toFixed(2)}\n` +
            `📂 ${pending.category_name || "Sem categoria"}\n` +
            `🏷️ ${typeLabel}`,
            [{ id: "sim", text: "✅ Confirmar" }, { id: "nao", text: "❌ Cancelar" }],
            "Ou corrija: valor, descrição, categoria ou tipo"
          );
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (catMatch) {
          await supabaseAdmin
            .from("whatsapp_pending_transactions")
            .update({ category_id: (catMatch as any).id, category_name: (catMatch as any).name })
            .eq("id", pending.id);
          const emoji = pending.type === "income" ? "💰" : "💸";
          await sendWhatsAppButtons(
            cleanPhone,
            `✏️ Categoria atualizada para *${(catMatch as any).name}*\n\n` +
            `${emoji} *Confirmar transação?*\n\n` +
            `📝 ${pending.description}\n` +
            `💵 R$ ${Number(pending.amount).toFixed(2)}\n` +
            `📂 ${(catMatch as any).name}`,
            [{ id: "sim", text: "✅ Confirmar" }, { id: "nao", text: "❌ Cancelar" }],
            "Ou corrija: valor, descrição, categoria ou tipo"
          );
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (confirmMatch) {
          await supabaseAdmin.from("whatsapp_pending_transactions").delete().eq("id", pending.id);

          const defaultWallet = (wallets || [])[0];
          const { error: txError } = await supabaseAdmin.from("transactions").insert({
            user_id: userId,
            amount: pending.amount,
            description: pending.description,
            type: pending.type,
            category_id: pending.category_id || null,
            wallet_id: defaultWallet?.id || null,
            date: new Date().toISOString().split("T")[0],
          });

          if (txError) {
            await sendWhatsAppMessage(cleanPhone, `❌ Erro ao registrar: ${txError.message}`);
          } else {
            if (defaultWallet) {
              const balanceChange = pending.type === "income" ? Number(pending.amount) : -Number(pending.amount);
              await supabaseAdmin.from("wallets").update({
                balance: Number(defaultWallet.balance) + balanceChange,
              }).eq("id", defaultWallet.id);
            }
            const emoji = pending.type === "income" ? "💰" : "💸";
            const paymentInfo = pending.payment_method ? `\n💳 ${pending.payment_method}` : "";
            const newBalance = totalBalance + (pending.type === "income" ? Number(pending.amount) : -Number(pending.amount));
            await sendWhatsAppMessage(cleanPhone,
              `${emoji} Transação registrada!\n\n` +
              `📝 ${pending.description}\n` +
              `💵 R$ ${Number(pending.amount).toFixed(2)}\n` +
              `📂 ${pending.category_name || "Sem categoria"}${paymentInfo}\n` +
              `📅 ${new Date().toLocaleDateString("pt-BR")}\n\n` +
              `💰 Novo saldo: R$ ${newBalance.toFixed(2)}`
            );
          }
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Unknown response while pending — re-show the confirmation
        const emoji = pending.type === "income" ? "💰" : "💸";
        await sendWhatsAppButtons(
          cleanPhone,
          `${emoji} *Confirmar transação?*\n\n` +
          `📝 ${pending.description}\n` +
          `💵 R$ ${Number(pending.amount).toFixed(2)}\n` +
          `📂 ${pending.category_name || "Sem categoria"}`,
          [{ id: "sim", text: "✅ Confirmar" }, { id: "nao", text: "❌ Cancelar" }],
          "Ou corrija: valor, descrição, categoria ou tipo"
        );
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── PRIORITY 2: Process media or text with AI ──
    let aiResponse: string;

    if (isMedia && messageId) {
      const mediaLabel = isAudio ? "🎙️ Processando seu áudio..." : "📸 Analisando o comprovante...";
      console.log(`Downloading media: messageId=${messageId} mediaType=${mediaType}`);
      await sendWhatsAppMessage(cleanPhone, mediaLabel);

      try {
        const mediaData = await downloadMediaFromUazapi(messageId, mediaType, message);

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
      aiResponse = await processWithNoxIA(effectiveText || messageText, financialContext);
    }
    let replyText = aiResponse;
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*"action"\s*:\s*"add_transaction"[\s\S]*\}/);
      if (jsonMatch) {
        const action = JSON.parse(jsonMatch[0]);

        const matchedCategory = (categories || []).find(
          (c: any) => c.name.toLowerCase() === action.category?.toLowerCase()
        );

        // Save as pending and ask for confirmation instead of auto-registering
        await supabaseAdmin.from("whatsapp_pending_transactions").insert({
          user_id: userId,
          phone_number: cleanPhone,
          amount: action.amount,
          description: action.description,
          type: action.type || "expense",
          category_id: matchedCategory?.id || null,
          category_name: matchedCategory?.name || action.category || null,
          payment_method: action.payment_method || null,
        });

        const emoji = action.type === "income" ? "💰" : "💸";
        const paymentInfo = action.payment_method ? `\n💳 ${action.payment_method}` : "";
        const confirmBody =
          `${emoji} *Confirmar transação?*\n\n` +
          `📝 ${action.description}\n` +
          `💵 R$ ${Number(action.amount).toFixed(2)}\n` +
          `📂 ${matchedCategory?.name || action.category || "Sem categoria"}${paymentInfo}`;

        await sendWhatsAppButtons(
          cleanPhone,
          confirmBody,
          [{ id: "sim", text: "✅ Confirmar" }, { id: "nao", text: "❌ Cancelar" }],
          "Ou corrija: valor, descrição, categoria ou tipo"
        );
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
