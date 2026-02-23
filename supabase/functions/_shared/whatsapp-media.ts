import { guessMimeType } from "./whatsapp-utils.ts";

export async function decryptWhatsAppMedia(
  encryptedBuffer: ArrayBuffer,
  mediaKeyBase64: string,
  mediaType: string
): Promise<ArrayBuffer> {
  const mediaKey = Uint8Array.from(atob(mediaKeyBase64), c => c.charCodeAt(0));

  const mediaTypeInfo: Record<string, string> = {
    "audio": "WhatsApp Audio Keys",
    "ptt":   "WhatsApp Audio Keys",
    "image": "WhatsApp Image Keys",
    "video": "WhatsApp Video Keys",
    "document": "WhatsApp Document Keys",
  };
  const infoString = mediaTypeInfo[mediaType] || "WhatsApp Audio Keys";

  const baseKey = await crypto.subtle.importKey("raw", mediaKey, "HKDF", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode(infoString) },
    baseKey,
    112 * 8
  );
  const derivedBytes = new Uint8Array(derived);
  const iv = derivedBytes.slice(0, 16);
  const aesKey = derivedBytes.slice(16, 48);

  const cryptoKey = await crypto.subtle.importKey("raw", aesKey, { name: "AES-CBC" }, false, ["decrypt"]);

  const encBytes = new Uint8Array(encryptedBuffer);
  const ciphertext = encBytes.slice(0, encBytes.length - 10);

  const decrypted = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, cryptoKey, ciphertext);
  return decrypted;
}

export function extractMediaFromPayload(message: any, mediaType?: string): { encUrl?: string; base64?: string; mimetype: string; mediaKey?: string } | null {
  const content = message.content;
  console.log("Checking inline media in payload. content type:", typeof content, "keys:", content && typeof content === "object" ? Object.keys(content).join(", ") : String(content)?.substring(0, 100));

  if (content && typeof content === "object") {
    const mime = content.mimetype || content.mimeType || guessMimeType(mediaType);

    if (content.base64) {
      return { base64: content.base64, mimetype: mime };
    }

    const url = content.URL || content.url || content.mediaUrl || content.fileUrl || content.downloadUrl || content.link;
    if (url) {
      console.log("Found media URL in content:", url.substring(0, 100), "mediaKey:", content.mediaKey ? "present" : "absent");
      return { encUrl: url, mimetype: mime, mediaKey: content.mediaKey };
    }
  }

  if (typeof content === "string" && (content.startsWith("http://") || content.startsWith("https://"))) {
    return { encUrl: content, mimetype: guessMimeType(mediaType) };
  }

  const mediaUrl = message.mediaUrl || message.media?.url || message.fileUrl || message.url;
  if (mediaUrl) {
    return { encUrl: mediaUrl, mimetype: message.mimetype || guessMimeType(mediaType) };
  }

  return null;
}

export async function downloadMediaFromUazapi(messageId: string, mediaType?: string, message?: any): Promise<{ base64: string; mimetype: string } | null> {
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
              const mt = (mediaType || "audio").toLowerCase();
              finalBuffer = await decryptWhatsAppMedia(encBuffer, inline.mediaKey, mt === "ptt" ? "audio" : mt);
              console.log("Decrypted buffer size:", finalBuffer.byteLength);
            } else {
              finalBuffer = encBuffer;
            }

            const bytes = new Uint8Array(finalBuffer);
            let binary = "";
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            const mime = inline.mimetype.split(";")[0].trim();
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
