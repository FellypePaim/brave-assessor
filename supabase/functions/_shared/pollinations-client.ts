// Pollinations AI client - OpenAI-compatible API (free, no API key required)
// Replaces direct Gemini calls with a more robust, rate-limit-friendly service

const POLLINATIONS_BASE = "https://gen.pollinations.ai";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: any; // string or array of content parts
}

/**
 * Call Pollinations text generation API (OpenAI-compatible).
 * Supports text, vision (image input), and structured outputs.
 */
export async function callPollinations(opts: {
  model?: string;
  systemPrompt: string;
  messages: { role: string; content: any }[];
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const model = opts.model || "openai";
  
  const apiMessages: ChatMessage[] = [
    { role: "system", content: opts.systemPrompt },
  ];

  for (const msg of opts.messages) {
    const role = msg.role === "assistant" ? "assistant" : "user";
    apiMessages.push({ role, content: msg.content });
  }

  const body: any = {
    model,
    messages: apiMessages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 2048,
  };

  const resp = await fetch(`${POLLINATIONS_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const t = await resp.text();
    console.error("Pollinations API error:", resp.status, t);
    throw new Error(`Pollinations API error: ${resp.status}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "";
}

/**
 * Transcribe audio using Pollinations transcription endpoint.
 * Accepts base64 audio and returns transcribed text.
 */
export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
  // Convert base64 to Blob for multipart form upload
  const binaryStr = atob(audioBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : "mp3";
  const blob = new Blob([bytes], { type: mimeType });

  const formData = new FormData();
  formData.append("file", blob, `audio.${ext}`);
  formData.append("model", "openai");

  const resp = await fetch(`${POLLINATIONS_BASE}/v1/audio/transcriptions`, {
    method: "POST",
    body: formData,
  });

  if (!resp.ok) {
    const t = await resp.text();
    console.error("Pollinations transcription error:", resp.status, t);
    throw new Error(`Pollinations transcription error: ${resp.status}`);
  }

  const data = await resp.json();
  return data.text || "";
}
