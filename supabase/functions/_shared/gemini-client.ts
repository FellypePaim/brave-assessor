// Shared Google Gemini API client for all edge functions

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

/**
 * Convert OpenAI-style messages to Gemini format.
 * System prompt is prepended to the first user message.
 */
export function convertToGeminiMessages(
  systemPrompt: string,
  messages: { role: string; content: any }[]
): GeminiContent[] {
  const geminiMessages: GeminiContent[] = [];

  for (const msg of messages) {
    const role = msg.role === "assistant" ? "model" : "user";

    if (typeof msg.content === "string") {
      geminiMessages.push({ role, parts: [{ text: msg.content }] });
    } else if (Array.isArray(msg.content)) {
      const parts: GeminiPart[] = [];
      for (const part of msg.content) {
        if (part.type === "text") {
          parts.push({ text: part.text });
        } else if (part.type === "image_url") {
          const url: string = part.image_url?.url || "";
          const dataMatch = url.match(/^data:(.+?);base64,(.+)$/);
          if (dataMatch) {
            parts.push({
              inlineData: { mimeType: dataMatch[1], data: dataMatch[2] },
            });
          }
        }
      }
      geminiMessages.push({ role, parts });
    }
  }

  // Prepend system prompt to first user message
  if (geminiMessages.length > 0 && geminiMessages[0].role === "user") {
    geminiMessages[0].parts.unshift({
      text: `[System Instructions]\n${systemPrompt}\n[End System Instructions]\n\n`,
    });
  } else {
    // Insert system as first user message if needed
    geminiMessages.unshift({
      role: "user",
      parts: [{ text: systemPrompt }],
    });
    // Add placeholder model response to maintain alternation
    geminiMessages.splice(1, 0, {
      role: "model",
      parts: [{ text: "Entendido." }],
    });
  }

  return geminiMessages;
}

/**
 * Sleep helper for retry backoff.
 */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call Gemini API (non-streaming) with automatic retry on 429.
 */
export async function callGemini(opts: {
  model?: string;
  systemPrompt: string;
  messages: { role: string; content: any }[];
  temperature?: number;
  maxRetries?: number;
}): Promise<string> {
  const GOOGLE_AI_KEY = Deno.env.get("GOOGLE_AI_KEY");
  if (!GOOGLE_AI_KEY) throw new Error("GOOGLE_AI_KEY not configured");

  const model = opts.model || "gemini-2.0-flash-lite";
  const contents = convertToGeminiMessages(opts.systemPrompt, opts.messages);
  const maxRetries = opts.maxRetries ?? 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await fetch(
      `${GEMINI_BASE}/${model}:generateContent?key=${GOOGLE_AI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: opts.temperature ?? 0.3,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    if (resp.status === 429 && attempt < maxRetries) {
      const waitMs = Math.min(1000 * Math.pow(2, attempt), 8000);
      console.warn(`Gemini 429, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
      await sleep(waitMs);
      continue;
    }

    if (!resp.ok) {
      const t = await resp.text();
      console.error("Gemini API error:", resp.status, t);
      throw new Error(`Gemini API error: ${resp.status}`);
    }

    const data = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  throw new Error("Gemini API: max retries exceeded (429)");
}

/**
 * Call Gemini API with streaming. Returns the raw Response with the stream body.
 */
export async function callGeminiStream(opts: {
  model?: string;
  systemPrompt: string;
  messages: { role: string; content: any }[];
  maxRetries?: number;
}): Promise<Response> {
  const GOOGLE_AI_KEY = Deno.env.get("GOOGLE_AI_KEY");
  if (!GOOGLE_AI_KEY) throw new Error("GOOGLE_AI_KEY not configured");

  const model = opts.model || "gemini-2.0-flash-lite";
  const contents = convertToGeminiMessages(opts.systemPrompt, opts.messages);
  const maxRetries = opts.maxRetries ?? 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await fetch(
      `${GEMINI_BASE}/${model}:streamGenerateContent?alt=sse&key=${GOOGLE_AI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 4096,
          },
        }),
      }
    );

    if (resp.status === 429 && attempt < maxRetries) {
      const waitMs = Math.min(1000 * Math.pow(2, attempt), 8000);
      console.warn(`Gemini stream 429, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
      await sleep(waitMs);
      continue;
    }

    if (!resp.ok) {
      const t = await resp.text();
      console.error("Gemini stream error:", resp.status, t);
      throw new Error(`Gemini stream error: ${resp.status}`);
    }

    return resp;
  }

  throw new Error("Gemini stream: max retries exceeded (429)");
}
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
        },
      }),
    }
  );

  if (!resp.ok) {
    const t = await resp.text();
    console.error("Gemini stream error:", resp.status, t);
    throw new Error(`Gemini stream error: ${resp.status}`);
  }

  return resp;
}

/**
 * Transform Gemini SSE stream to OpenAI-compatible SSE stream.
 * This ensures the frontend streaming code doesn't need to change.
 */
export function geminiStreamToOpenAI(geminiResponse: Response): ReadableStream {
  const reader = geminiResponse.body!.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new ReadableStream({
    async pull(controller) {
      let buffer = "";
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }

        buffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ") || line.trim() === "") continue;

          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const parsed = JSON.parse(jsonStr);
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
            if (text) {
              const openaiChunk = {
                choices: [{ delta: { content: text }, index: 0 }],
              };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(openaiChunk)}\n\n`)
              );
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    },
  });
}
