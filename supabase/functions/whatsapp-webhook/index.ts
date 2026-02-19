import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

  const todayDayOfMonth = new Date().getDate();

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
- Interpretar comandos de gasto/receita em linguagem natural para registrar transações
- Dar dicas práticas de economia
- Comparar períodos e identificar padrões

🧠 INTERPRETAÇÃO DE LISTAS DE RECORRÊNCIAS (PRIORIDADE MÁXIMA):
Quando o usuário enviar uma LISTA com 2 ou mais itens que indiquem gastos/receitas recorrentes mensais, retorne SOMENTE JSON com action "add_recurring_list":

Exemplos de listas:
- "todo mês eu gasto: gmail R$20 / icloud R$20 / academia R$90"
- "gastos mensais: netflix 45, spotify 19, academia 90"
- "minhas contas mensais: luz 200 / internet 100 / condomínio 500"

Para cada item extraia:
- "description": nome limpo (ex: "Gmail", "Netflix", "Academia")
- "amount": valor numérico
- "category": categoria mais adequada
- "type": "expense" ou "income"
- "day_of_month": dia do mês (se mencionado como "todo dia 10" → 10, "dia 15" → 15). Se NÃO mencionado, use ${todayDayOfMonth} (dia atual)

Retorne SOMENTE este JSON para listas (sem texto extra):
{"action":"add_recurring_list","items":[{"description":"Gmail","amount":20.00,"category":"Outros","type":"expense","day_of_month":${todayDayOfMonth}},{"description":"Netflix","amount":45.00,"category":"Lazer","type":"expense","day_of_month":${todayDayOfMonth}}]}

🧠 INTERPRETAÇÃO DE GASTOS ÚNICOS (IMPORTANTE):
Detecte QUALQUER mensagem que indique UM gasto ou receita, mesmo escrito de forma informal/coloquial.
Exemplos que DEVEM virar JSON:
- "gastei uns 50 no mercado hoje" → R$ 50, Supermercado, Alimentação, expense
- "almocei por 30 conto" → R$ 30, Almoço, Alimentação, expense
- "paguei 200 de luz" → R$ 200, Energia Elétrica, Contas, expense
- "fui ao posto, 80 de gasolina" → R$ 80, Gasolina, Transporte, expense
- "recebi 1500 do freela" → R$ 1500, Freela, Renda Extra, income
- "uber 15 reais" → R$ 15, Uber, Transporte, expense

Quando identificar UMA transação única (mesmo informal), responda SOMENTE com JSON válido:
{"action":"add_transaction","amount":50.00,"description":"Descrição limpa e clara","category":"Categoria adequada","type":"expense"}

Regras para o JSON:
- "description": nome limpo e comercial (ex: "Almoço", "Supermercado", "Gasolina")
- "category": use as categorias disponíveis do usuário quando possível
- "amount": sempre número, extraia mesmo valores aproximados ("uns 50" → 50)
- "type": "expense" para gastos, "income" para receitas/entradas

Para perguntas normais (não transações), responda em texto formatado com emojis e parágrafos.

⚠️ QUANDO NÃO ENTENDER:
Se a mensagem não for uma transação clara nem uma pergunta financeira reconhecível, responda EXATAMENTE:
"Não entendi sua mensagem 😕 Mas posso te ajudar de outras formas!"

NUNCA invente informações financeiras que não existem no contexto.

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
      temperature: 0.3,
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

    // Check verification code (text only) — match code anywhere in the message
    if (hasText) {
      const codeMatch = messageText.match(/(?:NOX|BRAVE)-(\d{6})/i);
      if (codeMatch) {
        // Try both prefixes to handle already-stored NOX- codes and new BRAVE- codes
        const digits = codeMatch[1];
        const bravCode = `BRAVE-${digits}`;
        const noxCode = `NOX-${digits}`;

        let link = null;
        // First try BRAVE- prefix (new codes)
        const { data: linkBrave } = await supabaseAdmin
          .from("whatsapp_links")
          .select("*")
          .eq("verification_code", bravCode)
          .eq("verified", false)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle();
        if (linkBrave) {
          link = linkBrave;
        } else {
          // Fallback: try NOX- prefix (legacy codes already in DB)
          const { data: linkNox } = await supabaseAdmin
            .from("whatsapp_links")
            .select("*")
            .eq("verification_code", noxCode)
            .eq("verified", false)
            .gt("expires_at", new Date().toISOString())
            .maybeSingle();
          if (linkNox) link = linkNox;
        }

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

        // Fetch user's name for personalized welcome message
        const { data: welcomeProfile } = await supabaseAdmin
          .from("profiles")
          .select("display_name")
          .eq("id", link.user_id)
          .maybeSingle();
        const userName = welcomeProfile?.display_name || "usuário";

        await sendWhatsAppMessage(cleanPhone,
          `🎉 *Olá, ${userName}! WhatsApp vinculado com sucesso!*\n\n` +
          `Agora você pode gerenciar suas finanças direto aqui! Veja o que posso fazer por você:\n\n` +
          `💸 *Registrar gastos (texto):*\n_"Gastei 50 no almoço"_\n_"Almocei por 30 conto"_\n_"Paguei 200 de luz"_\n\n` +
          `📸 *Enviar foto de comprovante*\n_Basta fotografar o recibo ou nota fiscal_\n\n` +
          `🎙️ *Enviar áudio*\n_"Gastei 80 de gasolina no posto"_\n\n` +
          `🔔 *Criar lembretes:*\n_"lembrete: reunião amanhã 15h"_\n_"lembrete: academia toda segunda 7h"_\n\n` +
          `📋 *Ver suas contas:* _"conferir"_\n` +
          `📊 *Ver saldo:* _"Qual meu saldo?"_\n` +
          `👑 *Ver seu plano:* _"meu plano"_\n` +
          `❓ *Ajuda:* _"ajuda"_\n\n` +
          `_Brave IA - Seu assessor financeiro 🤖_`
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
    // ── Helper: parse date/time in pt-BR (fallback) ──
    function parseDateTimeBR(text: string): Date | null {
      const now = new Date();
      const lower = text.toLowerCase().trim();
      // Match "12:00 PM/AM" format
      const timeAmPmMatch = lower.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
      const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?h(?:(\d{2}))?|(\d{1,2}):(\d{2})/);
      let hour = 0, minute = 0, hasTime = false;
      if (timeAmPmMatch) {
        hasTime = true;
        hour = parseInt(timeAmPmMatch[1]);
        minute = parseInt(timeAmPmMatch[2]);
        const period = timeAmPmMatch[3].toLowerCase();
        if (period === "pm" && hour < 12) hour += 12;
        if (period === "am" && hour === 12) hour = 0;
      } else if (timeMatch) {
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
      if (/\b(todo\s*dia|todos\s*os\s*dias|diário|diario|diariamente)\b/.test(lower)) return "daily";
      if (/\b(toda\s*semana|todas\s*as\s*semanas|semanalmente|semanal)\b/.test(lower)) return "weekly";
      if (/\b(todo\s*m[eê]s|todos\s*os\s*meses|mensalmente|mensal)\b/.test(lower)) return "monthly";
      if (/\b(toda\s*(segunda|terça|terca|quarta|quinta|sexta|s[aá]bado|sabado|domingo))\b/.test(lower)) return "weekly";
      if (/\b(todo\s*(sábado|sabado|domingo|segunda|terça|terca|quarta|quinta|sexta))\b/.test(lower)) return "weekly";
      if (/\b(todas?\s*as?\s*(segunda|terça|terca|quarta|quinta|sexta|s[aá]bado|sabado|domingo))\b/.test(lower)) return "weekly";
      return "none";
    }

    // ── AI-powered reminder parser using Lovable AI ──
    async function parseReminderWithAI(text: string): Promise<{
      title: string;
      event_at: string | null;
      recurrence: string;
      notify_minutes_before: number | null;
    } | null> {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) return null;

      const nowBR = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short" });

      const systemPrompt = `Você é um assistente que extrai informações de lembretes a partir de mensagens em português brasileiro.
A data/hora atual em São Paulo é: ${nowBR}

Retorne APENAS um JSON válido com exatamente estes campos:
{
  "title": "nome limpo do lembrete, sem palavras de data/hora/recorrência",
  "event_at": "ISO 8601 com timezone -03:00 ou null se não houver data/hora clara",
  "recurrence": "none" | "daily" | "weekly" | "monthly",
  "notify_minutes_before": número de minutos ou null se não especificado
}

Regras:
- title: extraia APENAS o nome/evento, sem "todos os dias", "amanhã", horários etc.
- event_at: se o usuário diz "todos os dias às 12:00", use hoje às 12:00. Se diz "amanhã 15h", calcule corretamente.
- recurrence: "todos os dias/todo dia/diário" → "daily", "toda semana/toda segunda/etc" → "weekly", "todo mês" → "monthly"
- notify_minutes_before: "1h antes" → 60, "30 min antes" → 30, "1 dia antes" → 1440. null se não mencionado.
- Nunca adicione texto extra fora do JSON.`;

      try {
        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: text },
            ],
            stream: false,
            temperature: 0,
          }),
        });

        if (!resp.ok) {
          console.error("AI parse error:", resp.status, await resp.text());
          return null;
        }

        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content?.trim() || "";
        // Strip markdown code fences if present
        const jsonStr = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
        const parsed = JSON.parse(jsonStr);
        return {
          title: parsed.title || "",
          event_at: parsed.event_at || null,
          recurrence: ["none","daily","weekly","monthly"].includes(parsed.recurrence) ? parsed.recurrence : "none",
          notify_minutes_before: typeof parsed.notify_minutes_before === "number" ? parsed.notify_minutes_before : null,
        };
      } catch (e) {
        console.error("AI reminder parse failed:", e);
        return null;
      }
    }

    // Returns human-readable recurrence label with icon
    function recurrenceLabel(recurrence: string, eventAt?: string, reminderText?: string): string {
      const lower = (reminderText || "").toLowerCase();
      const dayNames: Record<number, string> = { 0: "domingo", 1: "segunda", 2: "terça", 3: "quarta", 4: "quinta", 5: "sexta", 6: "sábado" };
      if (recurrence === "daily") return "🔁 Diário";
      if (recurrence === "monthly") return "🔁 Mensal";
      if (recurrence === "weekly") {
        // Try to find the specific day
        if (/segunda/.test(lower)) return "🔁 Toda segunda-feira";
        if (/terça|terca/.test(lower)) return "🔁 Toda terça-feira";
        if (/quarta/.test(lower)) return "🔁 Toda quarta-feira";
        if (/quinta/.test(lower)) return "🔁 Toda quinta-feira";
        if (/sexta/.test(lower)) return "🔁 Toda sexta-feira";
        if (/sábado|sabado/.test(lower)) return "🔁 Todo sábado";
        if (/domingo/.test(lower)) return "🔁 Todo domingo";
        if (eventAt) {
          const wd = new Date(eventAt).getDay();
          return `🔁 Toda ${dayNames[wd] || "semana"}`;
        }
        return "🔁 Semanal";
      }
      return "";
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

        // ── Step: confirm and save recurring list (with inline editing) ──
        if (session.step === "confirm_recurring_list") {
          let items: any[] = ctx.items || [];
          const isConfirm = /sim|ok|yes|confirmar|✅ cadastrar todas|cadastrar todas?/i.test(effectiveText);
          const isCancel  = /^(não|nao|n|cancelar|cancel|❌ cancelar)$/i.test(effectiveText);

          // Helper to re-show the list with editing instructions
          const showList = async (currentItems: any[]) => {
            const totalAmount = currentItems.reduce((s: number, i: any) => s + Number(i.amount), 0);
            const lines = currentItems.map((i: any, idx: number) => {
              const dayStr = i.day_of_month ? ` · dia ${i.day_of_month}` : "";
              return `${idx + 1}. *${i.description}* — ${fmt(Number(i.amount))}${dayStr}`;
            });
            await sendWhatsAppButtons(
              cleanPhone,
              `🔄 *Confirmar ${currentItems.length} recorrências?*\n\n` + lines.join("\n") +
              `\n\n💸 *Total: ${fmt(totalAmount)}*\n\n` +
              `✏️ _Para editar antes de confirmar:_\n` +
              `• _"3 remover"_ — remove o item 3\n` +
              `• _"2 valor 50"_ — muda valor do item 2\n` +
              `• _"1 dia 15"_ — muda dia do item 1`,
              [{ id: "sim", text: "✅ Cadastrar todas" }, { id: "nao", text: "❌ Cancelar" }],
              "Confirme ou edite os itens"
            );
          };

          if (isCancel) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Cadastro de recorrências cancelado.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // ── Inline edit: "3 remover" ──
          const removeMatch = effectiveText.match(/^(\d+)\s+remover$/i);
          if (removeMatch) {
            const idx = parseInt(removeMatch[1]) - 1;
            if (idx >= 0 && idx < items.length) {
              const removed = items[idx];
              items = items.filter((_: any, i: number) => i !== idx);
              await supabaseAdmin.from("whatsapp_sessions").update({
                context: { ...ctx, items },
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
              }).eq("id", session.id);
              if (items.length === 0) {
                await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
                await sendWhatsAppMessage(cleanPhone, `🗑️ *${removed.description}* removido. Lista vazia, cadastro cancelado.`);
              } else {
                await sendWhatsAppMessage(cleanPhone, `🗑️ *${removed.description}* removido!`);
                await showList(items);
              }
            } else {
              await sendWhatsAppMessage(cleanPhone, `❓ Item ${removeMatch[1]} não existe. Use um número entre 1 e ${items.length}.`);
            }
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // ── Inline edit: "2 valor 50" ──
          const valorMatch = effectiveText.match(/^(\d+)\s+valor\s+([\d.,]+)$/i);
          if (valorMatch) {
            const idx = parseInt(valorMatch[1]) - 1;
            const newVal = parseFloat(valorMatch[2].replace(",", "."));
            if (idx >= 0 && idx < items.length && !isNaN(newVal) && newVal > 0) {
              items[idx] = { ...items[idx], amount: newVal };
              await supabaseAdmin.from("whatsapp_sessions").update({
                context: { ...ctx, items },
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
              }).eq("id", session.id);
              await sendWhatsAppMessage(cleanPhone, `✅ *${items[idx].description}* atualizado para ${fmt(newVal)}!`);
              await showList(items);
            } else {
              await sendWhatsAppMessage(cleanPhone, `❓ Não entendi. Exemplo: _"2 valor 50"_ para mudar o valor do item 2.`);
            }
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // ── Inline edit: "1 dia 15" ──
          const diaMatch = effectiveText.match(/^(\d+)\s+dia\s+(\d+)$/i);
          if (diaMatch) {
            const idx = parseInt(diaMatch[1]) - 1;
            const newDay = parseInt(diaMatch[2]);
            if (idx >= 0 && idx < items.length && newDay >= 1 && newDay <= 31) {
              items[idx] = { ...items[idx], day_of_month: newDay };
              await supabaseAdmin.from("whatsapp_sessions").update({
                context: { ...ctx, items },
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
              }).eq("id", session.id);
              await sendWhatsAppMessage(cleanPhone, `✅ *${items[idx].description}* agora vence todo dia ${newDay}!`);
              await showList(items);
            } else {
              await sendWhatsAppMessage(cleanPhone, `❓ Exemplo: _"1 dia 15"_ para mudar o dia de vencimento do item 1.`);
            }
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (isConfirm) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);

            // Insert all as recurring_transactions
            const inserts = items.map((item: any) => ({
              user_id: ctx.user_id,
              description: item.description,
              amount: Number(item.amount),
              type: item.type || "expense",
              category_id: item.category_id || null,
              day_of_month: item.day_of_month || new Date().getDate(),
              is_active: true,
              expense_type: "fixed",
            }));

            const { error: recErr } = await supabaseAdmin.from("recurring_transactions").insert(inserts);

            if (recErr) {
              await sendWhatsAppMessage(cleanPhone, `❌ Erro ao cadastrar recorrências: ${recErr.message}`);
            } else {
              const total = items.reduce((s: number, i: any) => s + Number(i.amount), 0);
              const savedList = items.map((i: any, idx: number) =>
                `${idx + 1}. ✅ *${i.description}* — ${fmt(Number(i.amount))} · todo dia ${i.day_of_month || new Date().getDate()}`
              ).join("\n");
              await sendWhatsAppMessage(cleanPhone,
                `🎉 *${items.length} recorrências cadastradas!*\n\n` +
                savedList +
                `\n\n💸 *Total mensal: ${fmt(total)}*\n\n` +
                `_Aparecem automaticamente todo mês no painel Brave! 📊_`
              );
            }
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Unknown input: re-show list with instructions
          await showList(items);
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: managing recurring transactions ──
        if (session.step === "manage_recurrentes") {
          const recList: any[] = ctx.recList || [];
          const fmt2 = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

          if (/^\s*(voltar|sair|cancelar|cancel)\s*$/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "👌 Ok! Até mais.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Match "cancelar X" or just a number
          const cancelNumMatch = effectiveText.match(/^(?:cancelar\s+)?(\d+)$/i);
          if (cancelNumMatch) {
            const allItems = [...(recList.filter((r: any) => r.type === "expense")), ...(recList.filter((r: any) => r.type === "income"))];
            const idx = parseInt(cancelNumMatch[1]) - 1;
            const chosen = allItems[idx];
            if (!chosen) {
              await sendWhatsAppMessage(cleanPhone, `❓ Item ${cancelNumMatch[1]} não encontrado. Envie um número válido ou *voltar* para sair.`);
              return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
            // Confirm cancellation
            await supabaseAdmin.from("whatsapp_sessions").update({
              step: "confirm_cancel_recurring",
              context: { ...ctx, chosen_recurring: chosen },
              expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            }).eq("id", session.id);
            await sendWhatsAppButtons(
              cleanPhone,
              `⚠️ Cancelar a recorrência *${chosen.description}* (${fmt2(Number(chosen.amount))}/mês · dia ${chosen.day_of_month})?`,
              [{ id: "sim_cancel_rec", text: "✅ Sim, cancelar" }, { id: "voltar", text: "❌ Não, voltar" }],
              ""
            );
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Unknown
          await sendWhatsAppMessage(cleanPhone, `❓ Envie o *número* da recorrência para cancelar, ou *voltar* para sair.\nEx: _"cancelar 2"_`);
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: confirming recurring cancellation ──
        if (session.step === "confirm_cancel_recurring") {
          const chosen = ctx.chosen_recurring;
          const isConfirm = /sim|sim_cancel_rec|✅|confirmar/i.test(effectiveText);
          const isCancel  = /não|nao|voltar|❌/i.test(effectiveText);

          if (isCancel) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "👌 Operação cancelada. A recorrência continua ativa.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (isConfirm) {
            await supabaseAdmin.from("recurring_transactions").update({ is_active: false }).eq("id", chosen.id);
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone,
              `🗑️ Recorrência *${chosen.description}* cancelada com sucesso!\n\n` +
              `_Ela não será mais gerada nos próximos meses._\n\n` +
              `_Brave IA - Seu assessor financeiro 🤖_`
            );
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

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

          // All data gathered – store and show full confirmation before saving
          const reminderCtx = ctx;

          // Update session to reminder_confirm step with notifyMins included
          await supabaseAdmin.from("whatsapp_sessions").update({
            step: "reminder_confirm",
            context: {
              ...ctx,
              notify_minutes_before: notifyMins,
            },
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          }).eq("id", session.id);

          const fmtDate = (s: string) =>
            new Date(s).toLocaleString("pt-BR", {
              day: "2-digit", month: "2-digit", year: "numeric",
              hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
            });

          let notifyLabel = "";
          if (notifyMins < 60) notifyLabel = `${notifyMins} minutos`;
          else if (notifyMins < 1440) notifyLabel = `${notifyMins / 60} hora(s)`;
          else notifyLabel = `${notifyMins / 1440} dia(s)`;

          const recLblForNotify = recurrenceLabel(reminderCtx.recurrence || "none", reminderCtx.event_at, reminderCtx.originalText || "");

          await sendWhatsAppButtons(
            cleanPhone,
            `🔔 *Confirmar lembrete?*\n\n` +
            `📝 *Nome:* ${reminderCtx.title}\n` +
            `📅 *Horário:* ${fmtDate(reminderCtx.event_at)}\n` +
            `⏰ *Aviso:* ${notifyLabel} antes\n` +
            (recLblForNotify ? `${recLblForNotify}\n` : `🔂 *Recorrência:* Nenhuma\n`),
            [{ id: "CONFIRM_REMINDER", text: "✅ Confirmar" }, { id: "cancelar", text: "❌ Cancelar" }],
            "Toque para confirmar"
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

          // Match by buttonId OR button text (UAZAPI may send text instead of ID)
          const isDeleteTrigger = /^(DELETE_REMINDER|cancelar.?lembrete|remover.?lembrete|deletar|🗑️|cancelar lembrete)/i.test(effectiveText);
          if (isDeleteTrigger) {
            await sendWhatsAppButtons(
              cleanPhone,
              `⚠️ Tem certeza que quer cancelar o lembrete *${chosen.title}*?`,
              [{ id: "CONFIRM_DELETE_REMINDER", text: "✅ Sim, cancelar" }, { id: "BACK_REMINDERS", text: "❌ Não, voltar" }],
              ""
            );
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (/^(CONFIRM_DELETE_REMINDER|✅ sim, cancelar|sim, cancelar)/i.test(effectiveText)) {
            await supabaseAdmin.from("reminders").delete().eq("id", chosen.id);
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, `🗑️ Lembrete *${chosen.title}* cancelado com sucesso!\n\n_Brave IA - Seu assessor financeiro 🤖_`);
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (/^(BACK_REMINDERS|⬅️ voltar|voltar)/i.test(effectiveText)) {
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

          if (/^(EDIT_REMINDER|✏️ editar|editar)/i.test(effectiveText)) {
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
          const cancel = /^\s*(cancelar|cancel|não|nao|n|❌ cancelar|❌)\s*$/i.test(effectiveText);
          if (cancel) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Lembrete cancelado.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // CONFIRM_REMINDER or "sim" or button text "✅ Confirmar"
          // Match broadly: button text, buttonId, or natural "sim/ok/confirmar"
          const isConfirmReminder = 
            /sim|ok|yes|confirmar/i.test(effectiveText) ||
            effectiveText.includes("✅") ||
            effectiveText.toUpperCase().includes("CONFIRM_REMINDER");

          if (isConfirmReminder) {
            // Create the reminder
            const { error: reminderInsertError } = await supabaseAdmin.from("reminders").insert({
              user_id: ctx.user_id,
              title: ctx.title,
              description: ctx.description || null,
              event_at: ctx.event_at,
              notify_minutes_before: ctx.notify_minutes_before ?? 30,
              recurrence: ctx.recurrence || "none",
              is_active: true,
              is_sent: false,
            });

            if (reminderInsertError) {
              console.error("Error inserting reminder:", reminderInsertError);
              await sendWhatsAppMessage(cleanPhone, `❌ Erro ao salvar lembrete: ${reminderInsertError.message}`);
              return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

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

            const recLbl = recurrenceLabel(ctx.recurrence || "none", ctx.event_at, ctx.originalText || "");

            await sendWhatsAppMessage(cleanPhone,
              `✅ *Lembrete salvo com sucesso!*\n\n` +
              `📝 *Nome:* ${ctx.title}\n` +
              `📅 *Horário:* ${fmtDate(ctx.event_at)}\n` +
              `⏰ *Aviso:* ${notifyLabel} antes\n` +
              (recLbl ? `${recLbl}` : `🔂 *Recorrência:* Nenhuma`) +
              `\n\n_Brave IA - Seu assessor financeiro 🤖_`
            );
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }

        // ── Step: help category selection ──
        if (session.step === "help_category") {
          const helpMessages: Record<string, string> = {
            HELP_FINANCAS: `💰 *Finanças - Comandos disponíveis:*\n\n` +
              `📝 *Registrar gasto:*\n_"Gastei 50 com almoço"_\n_"Paguei 200 no mercado"_\n\n` +
              `📸 *Enviar comprovante:*\nEnvie uma foto do recibo ou nota fiscal\n\n` +
              `🎙️ *Áudio:*\nEnvie um áudio descrevendo a transação\n\n` +
              `📋 *Ver contas:*\n_"conferir"_ ou _"minhas contas"_\n\n` +
              `💳 *Pagar conta:*\n_"marcar como pago"_\n\n` +
              `🔄 *Transações recorrentes:*\n_"recorrentes"_ → lista e cancela recorrências ativas\n\n` +
              `✏️ *Editar lista antes de confirmar:*\n_"3 remover"_ → remove item 3\n_"2 valor 50"_ → altera valor do item 2\n_"1 dia 15"_ → altera dia de vencimento do item 1\n\n` +
              `💬 *Perguntar ao Brave IA:*\n_"Qual meu saldo?"_, _"Quanto gastei esse mês?"_`,

            HELP_LEMBRETES: `🔔 *Lembretes - Comandos disponíveis:*\n\n` +
              `➕ *Criar lembrete:*\n_"lembrete: reunião amanhã 15h"_\n_"lembrete: médico 25/02 10h, avisar 1h antes"_\n\n` +
              `🔁 *Criar lembrete recorrente:*\n_"lembrete: academia toda segunda 07h"_\n_"lembrete: reunião toda sexta 14h, avisar 30 min antes"_\n_"lembrete: contas todo mês dia 10, avisar 1 dia antes"_\n\n` +
              `📋 *Ver lembretes:*\n_"meus lembretes"_ ou _"lembretes"_\n\n` +
              `✏️ *Editar lembrete:*\n_"editar lembrete 2"_ → edita o lembrete nº 2 da lista\n\n` +
              `❌ *Cancelar lembrete:*\nEnvie _"meus lembretes"_ e escolha pelo número`,

            HELP_PLANO: `👑 *Plano - Comandos disponíveis:*\n\n` +
              `📋 *Ver meu plano:*\n_"meu plano"_\n\n` +
              `💳 *Renovar/Assinar:*\nAcesse o app Brave → Configurações → Planos\n\n` +
              `🛎️ *Suporte:*\nFale com nossa equipe pelo número\n*+55 37 9981-95029*`,

            HELP_OUTROS: `🌟 *Outros Comandos:*\n\n` +
              `❓ *Ajuda:*\n_"ajuda"_ ou _"comandos"_\n\n` +
              `📊 *Resumo financeiro:*\n_"resumo"_ ou _"meu resumo"_\n\n` +
              `🔄 *Recorrentes:*\n_"recorrentes"_ → ver e cancelar transações fixas\n\n` +
              `🔗 *Vincular WhatsApp:*\nEnvie o código BRAVE-XXXXXX do app\n\n` +
              `💡 *Dica:*\nO Brave IA entende linguagem natural! Escreva como preferir e ele interpreta automaticamente.`,
          };

          // Check which category was requested
          const catKey = Object.keys(helpMessages).find(k => 
            effectiveText.toUpperCase().includes(k) || effectiveText.toUpperCase() === k
          );

          if (catKey) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppButtons(
              cleanPhone,
              helpMessages[catKey],
              [{ id: "HELP_OUTROS", text: "⚙️ Outros" }, { id: "ajuda", text: "🏠 Menu Ajuda" }],
              "Ver mais categorias"
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

      // ── AI-first parsing, regex fallback ──
      let title = "";
      let eventDate: Date | null = null;
      let notifyMins: number | null = null;
      let recurrence = "none";

      const aiParsed = await parseReminderWithAI(reminderText);
      if (aiParsed) {
        title = aiParsed.title || reminderText;
        recurrence = aiParsed.recurrence;
        notifyMins = aiParsed.notify_minutes_before;
        if (aiParsed.event_at) {
          const parsed = new Date(aiParsed.event_at);
          if (!isNaN(parsed.getTime())) eventDate = parsed;
        }
      }

      // Fallback to regex if AI didn't extract key fields
      if (!title) {
        title = reminderText
          .replace(/,?\s*(amanhã|amanha|hoje|segunda|terça|quarta|quinta|sexta|sábado|sabado|domingo|\d{1,2}\/\d{1,2}|\d{1,2}h|\d{2}:\d{2}|todos?\s*os?\s*dias?|todo\s*dia|ao|às|as|de|do|da).*/i, "")
          .trim() || reminderText.split(/[,;]/)[0].trim();
        title = title.replace(/\b(toda|todo)\s*(segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)\b/gi, "").trim();
      }
      if (!eventDate) eventDate = parseDateTimeBR(reminderText);
      if (notifyMins === null) {
        const notifyMatch = reminderText.match(/avisar\s+(.+?)(?:\s+antes|\s*$)/i);
        notifyMins = notifyMatch ? parseNotifyMinutes(notifyMatch[1]) : null;
      }
      if (recurrence === "none") recurrence = parseRecurrence(reminderText);

      // Clear any old reminder sessions
      await supabaseAdmin.from("whatsapp_sessions").delete()
        .eq("phone_number", cleanPhone).like("step", "reminder_%");

      if (!eventDate) {
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
        await supabaseAdmin.from("whatsapp_sessions").insert({
          phone_number: cleanPhone,
          step: "reminder_notify",
          context: {
            user_id: linkedForReminder.user_id,
            title: title || reminderText,
            event_at: eventDate.toISOString(),
            recurrence,
            originalText: reminderText,
          },
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        });

        const fmtDateStr = eventDate.toLocaleString("pt-BR", {
          day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
        });
        const recLbl = recurrenceLabel(recurrence, eventDate.toISOString(), reminderText);

        await sendWhatsAppButtons(
          cleanPhone,
          `🔔 *${title || reminderText}*\n📅 ${fmtDateStr}${recLbl ? `\n${recLbl}` : ""}\n\n⏰ Com quanto tempo de antecedência você quer ser avisado?`,
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
          originalText: reminderText,
        },
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

      const fmtDateStr = eventDate.toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
      });
      let notifyLabel = "";
      if (notifyMins < 60) notifyLabel = `${notifyMins} minutos`;
      else if (notifyMins < 1440) notifyLabel = `${notifyMins / 60} hora(s)`;
      else notifyLabel = `${notifyMins / 1440} dia(s)`;
      const recLbl = recurrenceLabel(recurrence, eventDate.toISOString(), reminderText);

      await sendWhatsAppButtons(
        cleanPhone,
        `🔔 *Confirmar lembrete?*\n\n` +
        `📝 *${title || reminderText}*\n` +
        `📅 ${fmtDateStr}\n` +
        `⏰ Aviso: *${notifyLabel} antes*\n` +
        (recLbl ? `${recLbl}\n` : ""),
        [{ id: "CONFIRM_REMINDER", text: "✅ Confirmar" }, { id: "cancelar", text: "❌ Cancelar" }],
        "Toque para confirmar"
      );
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── "ajuda" command — list all available commands with categories ──
    const ajudaMatch = /^\s*(ajuda|help|comandos|menu|o que você faz|oque voce faz)\s*$/i.test(effectiveText);
    if (ajudaMatch) {
      // Check if user is linked so we know context
      const { data: linkedForHelp } = await supabaseAdmin
        .from("whatsapp_links")
        .select("user_id")
        .eq("phone_number", cleanPhone)
        .eq("verified", true)
        .maybeSingle();

      // Show category selection via buttons
      await supabaseAdmin.from("whatsapp_sessions").delete().eq("phone_number", cleanPhone);
      await supabaseAdmin.from("whatsapp_sessions").insert({
        phone_number: cleanPhone,
        step: "help_category",
        context: { linked: !!linkedForHelp },
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });

      await sendWhatsAppButtons(
        cleanPhone,
        `🤖 *Brave IA - Central de Ajuda*\n\nEscolha uma categoria para ver os comandos disponíveis:`,
        [{ id: "HELP_FINANCAS", text: "💰 Finanças" }, { id: "HELP_LEMBRETES", text: "🔔 Lembretes" }, { id: "HELP_PLANO", text: "👑 Plano" }],
        "Ou escolha outra categoria abaixo"
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
    const meusLembretesMatch = /^\s*(qual\s+)?(meus\s+lembretes|lembretes|ver\s+lembretes|meus\s+compromissos|quais\s+(meus\s+)?lembretes|listar\s+lembretes|mostrar\s+lembretes)\s*$/i.test(effectiveText);
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
      // For recurring reminders, don't filter by event_at (they repeat indefinitely)
      // For non-recurring, only show future ones
      const { data: allUserReminders } = await supabaseAdmin
        .from("reminders")
        .select("id, title, description, event_at, notify_minutes_before, recurrence, is_active")
        .eq("user_id", linkedForReminders.user_id)
        .eq("is_active", true)
        .order("event_at", { ascending: true })
        .limit(20);

      // Filter: show recurring reminders always + non-recurring only if in the future
      const activeReminders = (allUserReminders || []).filter((r: any) => {
        if (r.recurrence && r.recurrence !== "none") return true; // recurring: always show
        return new Date(r.event_at) > now; // non-recurring: only future
      }).slice(0, 10);

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

    // ── "recorrentes" command — list active recurring transactions ──
    const recorrentesMatch = /^\s*(recorrentes?|meus\s+recorrentes?|minhas\s+recorr[eê]ncias?|recorr[eê]ncias?|cobran[cç]as?)\s*$/i.test(effectiveText);
    if (recorrentesMatch) {
      const { data: linkedForRec } = await supabaseAdmin
        .from("whatsapp_links")
        .select("user_id")
        .eq("phone_number", cleanPhone)
        .eq("verified", true)
        .maybeSingle();

      if (!linkedForRec) {
        await sendWhatsAppMessage(cleanPhone, "❌ Nenhuma conta vinculada. Vincule pelo app Brave primeiro.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: recList } = await supabaseAdmin
        .from("recurring_transactions")
        .select("id, description, amount, type, day_of_month, expense_type, categories(name)")
        .eq("user_id", linkedForRec.user_id)
        .eq("is_active", true)
        .order("day_of_month", { ascending: true })
        .limit(20);

      const fmt2 = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

      if (!recList || recList.length === 0) {
        await sendWhatsAppMessage(cleanPhone,
          "📭 Você não tem transações recorrentes ativas.\n\n" +
          "Para cadastrar, envie uma lista:\n" +
          "_Netflix R$45\nAcademia R$90\nInternet R$100_\n\n" +
          "_Brave IA - Seu assessor financeiro 🤖_"
        );
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const expenses = recList.filter((r: any) => r.type === "expense");
      const incomes = recList.filter((r: any) => r.type === "income");
      const totalExp = expenses.reduce((s: number, r: any) => s + Number(r.amount), 0);

      let lines = [`🔁 *Suas recorrências ativas (${recList.length}):*\n`];
      if (expenses.length > 0) {
        lines.push("💸 *Despesas:*");
        expenses.forEach((r: any, i: number) => {
          const cat = (r as any).categories?.name || "Geral";
          lines.push(`${i + 1}. *${r.description}* — ${fmt2(Number(r.amount))} · dia ${r.day_of_month} · ${cat}`);
        });
        lines.push(`\n💰 *Total mensal: ${fmt2(totalExp)}*`);
      }
      if (incomes.length > 0) {
        lines.push("\n✅ *Receitas:*");
        incomes.forEach((r: any, i: number) => {
          lines.push(`${expenses.length + i + 1}. *${r.description}* — ${fmt2(Number(r.amount))} · dia ${r.day_of_month}`);
        });
      }

      lines.push(`\nPara cancelar uma recorrência, envie o *número*.\nEx: _"cancelar 2"_\n\nOu envie *voltar* para sair.`);

      // Create session for managing recurring
      await supabaseAdmin.from("whatsapp_sessions").delete().eq("phone_number", cleanPhone);
      await supabaseAdmin.from("whatsapp_sessions").insert({
        phone_number: cleanPhone,
        step: "manage_recurrentes",
        context: { user_id: linkedForRec.user_id, recList },
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

      await sendWhatsAppMessage(cleanPhone, lines.join("\n"));
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── "resumo" command — show monthly financial summary ──
    const resumoMatch = /^\s*(resumo|resumo\s*do\s*m[eê]s|r[eê]sumo\s*financeiro|extrato|extrato\s*mensal|summary)\s*$/i.test(effectiveText);
    if (resumoMatch) {
      const { data: linkedForResumo } = await supabaseAdmin
        .from("whatsapp_links")
        .select("user_id")
        .eq("phone_number", cleanPhone)
        .eq("verified", true)
        .maybeSingle();

      if (!linkedForResumo) {
        await sendWhatsAppMessage(cleanPhone, "❌ Nenhuma conta vinculada a este número. Vincule pelo app Brave primeiro.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const resumoUserId = linkedForResumo.user_id;
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

      const [{ data: monthTx }, { data: resumoWallets }, { data: resumoProfile }] = await Promise.all([
        supabaseAdmin
          .from("transactions")
          .select("amount, type, description, date, categories(name)")
          .eq("user_id", resumoUserId)
          .gte("date", firstDay)
          .lte("date", lastDay)
          .eq("is_paid", true),
        supabaseAdmin.from("wallets").select("balance").eq("user_id", resumoUserId),
        supabaseAdmin.from("profiles").select("display_name, monthly_income").eq("id", resumoUserId).maybeSingle(),
      ]);

      const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const txList = monthTx || [];
      const totalSpent = txList.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const totalReceived = txList.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const totalBalance = (resumoWallets || []).reduce((s: number, w: any) => s + Number(w.balance), 0);
      const monthName = now.toLocaleString("pt-BR", { month: "long" });

      // Group by category
      const categoryMap: Record<string, number> = {};
      txList.filter((t: any) => t.type === "expense").forEach((t: any) => {
        const cat = (t as any).categories?.name || "Outros";
        categoryMap[cat] = (categoryMap[cat] || 0) + Number(t.amount);
      });
      const topCategories = Object.entries(categoryMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      const monthBudget = resumoProfile?.monthly_income ? Number(resumoProfile.monthly_income) : null;
      const budgetLine = monthBudget
        ? `💼 *Renda mensal:* ${fmt(monthBudget)}\n📊 *Comprometido:* ${Math.round((totalSpent / monthBudget) * 100)}%\n`
        : "";

      const categoriesLine = topCategories.length > 0
        ? `\n🏷️ *Top categorias de gasto:*\n${topCategories.map((c, i) => `  ${i + 1}. ${c[0]} — ${fmt(c[1])}`).join("\n")}\n`
        : "";

      const resumoMsg =
        `📊 *Resumo de ${monthName.charAt(0).toUpperCase() + monthName.slice(1)}*\n\n` +
        `💸 *Total gasto:* ${fmt(totalSpent)}\n` +
        `💰 *Total recebido:* ${fmt(totalReceived)}\n` +
        `💳 *Saldo atual:* ${fmt(totalBalance)}\n` +
        budgetLine +
        categoriesLine +
        `\n📈 *Transações no mês:* ${txList.length}\n\n` +
        `_Brave IA - Seu assessor financeiro 🤖_`;

      await sendWhatsAppMessage(cleanPhone, resumoMsg);
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
      // ── Detect recurring list action ──
      const listMatch = aiResponse.match(/\{[\s\S]*"action"\s*:\s*"add_recurring_list"[\s\S]*\}/);
      if (listMatch) {
        const action = JSON.parse(listMatch[0]);
        const items: any[] = action.items || [];

        if (items.length === 0) throw new Error("Empty list");

        const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        // Match categories for each item
        const enriched = items.map((item: any) => {
          const matchedCat = (categories || []).find(
            (c: any) => c.name.toLowerCase() === item.category?.toLowerCase()
          );
          return { ...item, category_id: matchedCat?.id || null, category_name: matchedCat?.name || item.category || "Outros" };
        });

        // Build summary text
        const totalAmount = enriched.reduce((s: number, i: any) => s + Number(i.amount), 0);
        const lines = enriched.map((i: any, idx: number) => {
          const dayStr = i.day_of_month ? ` · todo dia ${i.day_of_month}` : "";
          return `${idx + 1}. *${i.description}* — ${fmt(Number(i.amount))}${dayStr}`;
        });

        const summaryMsg =
          `🔄 *Encontrei ${items.length} recorrências mensais:*\n\n` +
          lines.join("\n") +
          `\n\n💸 *Total mensal: ${fmt(totalAmount)}*\n\n` +
          `_Cada item será cadastrado como conta recorrente mensal._`;

        // Store list in session for confirmation
        await supabaseAdmin.from("whatsapp_sessions").delete().eq("phone_number", cleanPhone);
        await supabaseAdmin.from("whatsapp_sessions").insert({
          phone_number: cleanPhone,
          step: "confirm_recurring_list",
          context: { user_id: userId, items: enriched },
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        });

        await sendWhatsAppButtons(
          cleanPhone,
          summaryMsg,
          [{ id: "sim", text: "✅ Cadastrar todas" }, { id: "nao", text: "❌ Cancelar" }],
          "Confirme para criar as recorrências mensais"
        );
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Detect single transaction action ──
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

    // Detect when bot doesn't understand and offer quick-command suggestions
    const notUnderstoodPatterns = [
      /não entendi/i, /não consegui entender/i, /pode reformular/i,
      /não reconheci/i, /tente novamente/i, /não foi possível/i,
      /não compreendi/i, /mensagem não clara/i, /poderia explicar/i,
    ];
    const isConfused = notUnderstoodPatterns.some(p => p.test(replyText));

    if (isConfused) {
      await sendWhatsAppButtons(
        cleanPhone,
        replyText + "\n\n💡 *Tente um desses comandos rápidos:*",
        [
          { id: "gastei", text: "💸 Registrar gasto" },
          { id: "resumo", text: "📊 Ver resumo" },
          { id: "conferir", text: "📋 Conferir contas" },
        ],
        "Ou envie 'ajuda' para ver todos os comandos"
      );
    } else {
      await sendWhatsAppMessage(cleanPhone, replyText);
    }

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
