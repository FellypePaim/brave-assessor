/**
 * Shared AI response parser and post-processor.
 * Compensates for Gemini API quirks when used directly (without Lovable AI Gateway).
 */

// ── JSON Extraction ──

/** Strip markdown fences and extract raw JSON string */
export function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

/** Extract a JSON object from mixed text (AI might add explanation before/after) */
export function extractJsonFromMixed(text: string): string | null {
  // Try markdown code block first
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlock) return codeBlock[1].trim();

  // Try to find JSON object boundaries
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return text.substring(firstBrace, lastBrace + 1);
  }

  return null;
}

/** Find JSON matching a specific action pattern */
export function extractActionJson(text: string, actionName: string): any | null {
  // First try: exact action match with regex
  const pattern = new RegExp(`\\{[\\s\\S]*?"action"\\s*:\\s*"${actionName}"[\\s\\S]*?\\}`, "i");
  const match = text.match(pattern);
  if (!match) return null;

  try {
    return safeJsonParse(match[0]);
  } catch {
    // Try extracting from broader context
    const broader = extractJsonFromMixed(text);
    if (broader) {
      try {
        const parsed = safeJsonParse(broader);
        if (parsed?.action === actionName) return parsed;
      } catch { /* ignore */ }
    }
    return null;
  }
}

/** Safely parse JSON, handling common LLM output issues */
export function safeJsonParse(text: string): any {
  let cleaned = text.trim();

  // Remove trailing commas before closing braces/brackets
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");

  // Remove control characters (except newline/tab)
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");

  // Try direct parse
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to repair: count braces
    return repairAndParse(cleaned);
  }
}

/** Attempt to repair malformed JSON by fixing brace/bracket balance */
function repairAndParse(text: string): any {
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escaped = false;

  for (const ch of text) {
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") braces++;
    if (ch === "}") braces--;
    if (ch === "[") brackets++;
    if (ch === "]") brackets--;
  }

  let repaired = text;
  while (brackets > 0) { repaired += "]"; brackets--; }
  while (braces > 0) { repaired += "}"; braces--; }

  return JSON.parse(repaired);
}

// ── Post-Processing for Transactions ──

/** Clean transaction description: capitalize, remove temporal words */
export function cleanDescription(desc: string): string {
  if (!desc) return desc;
  let clean = desc.trim();
  // Remove leading prepositions
  clean = clean.replace(/^(de|do|da|no|na|pro|pra)\s+/i, "");
  // Capitalize first letter
  clean = clean.charAt(0).toUpperCase() + clean.slice(1);
  return clean;
}

/** Normalize amount: handle "2k", "1.5k", string values */
export function normalizeAmount(amount: any): number {
  if (typeof amount === "number") return Math.abs(amount);
  if (typeof amount === "string") {
    let str = amount.replace(/[rR$\s]/g, "").replace(",", ".");
    const kMatch = str.match(/^([\d.]+)\s*k$/i);
    if (kMatch) return Math.abs(parseFloat(kMatch[1]) * 1000);
    return Math.abs(parseFloat(str)) || 0;
  }
  return 0;
}

/** Normalize transaction type */
export function normalizeType(type: string): "expense" | "income" {
  const t = (type || "").toLowerCase().trim();
  if (t === "income" || t === "receita" || t === "entrada") return "income";
  return "expense";
}

// ── Post-Processing for Reminders ──

/** Clean reminder title: remove temporal words, prepositions, capitalize */
export function cleanReminderTitle(title: string, originalText?: string): string {
  if (!title) return title;
  let clean = title.trim();

  // Remove leading prepositions
  clean = clean.replace(/^(de|do|da|para|pra)\s+/i, "");

  // Remove temporal words
  clean = clean.replace(/\s*(amanhã|amanha|hoje|ontem|segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)\s*/gi, " ");
  clean = clean.replace(/\s*(às|as|ao|à)\s*\d{1,2}[h:]\d{0,2}\s*/gi, " ");
  clean = clean.replace(/\s*\d{1,2}[h:]\d{2}\s*/g, " ");
  clean = clean.replace(/\s*\d{1,2}h\b\s*/gi, " ");
  clean = clean.replace(/\s*(dia\s+)?\d{1,2}\/\d{1,2}(\/\d{2,4})?\s*/g, " ");
  clean = clean.replace(/\s*\d{2}:\d{2}\s*/g, " ");
  // Remove "lembrete", "me lembra" etc
  clean = clean.replace(/^(lembrete|me\s+lembra|lembrar)\s*/i, "");
  clean = clean.replace(/\s{2,}/g, " ").trim();

  // Capitalize each important word
  clean = clean.replace(/\b\w/g, c => c.toUpperCase());

  if (!clean) clean = title;
  return clean;
}

/** Extract the user's intended time from original text and override AI time */
export function extractUserTime(originalText: string): { hours: number; minutes: number } | null {
  // Match patterns: "às 14:00", "as 14h", "14:00", "14h30", "3 da tarde"
  const patterns = [
    /(?:às|as|à)\s*(\d{1,2})[h:](\d{0,2})/i,
    /(\d{1,2})[h:](\d{2})/,
    /(\d{1,2})h(\d{0,2})(?:\b|$)/i,
    /(\d{1,2})\s*(?:da\s+tarde)/i,  // "3 da tarde" → 15
    /(\d{1,2})\s*(?:da\s+manhã|da\s+manha)/i,
  ];

  for (const pat of patterns) {
    const m = originalText.match(pat);
    if (m) {
      let hours = parseInt(m[1]);
      const minutes = parseInt(m[2] || "0");

      // "3 da tarde" → 15
      if (/da\s+tarde/i.test(originalText) && hours < 12) hours += 12;

      if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
        return { hours, minutes };
      }
    }
  }
  return null;
}

/** Force the user's time onto an ISO datetime string */
export function forceTimeOnIso(isoDate: string, hours: number, minutes: number): string {
  const dateStr = isoDate.substring(0, 10); // YYYY-MM-DD
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${dateStr}T${pad(hours)}:${pad(minutes)}:00-03:00`;
}

// ── Post-Processing for Search Terms ──

/** Clean search term: remove common noise words */
export function cleanSearchTerm(search: string): string {
  if (!search) return search;
  return search
    .replace(/^(o|a|os|as|do|da|dos|das|de|no|na|nos|nas|meu|minha|aquele|aquela)\s+/i, "")
    .trim();
}

// ── Combined Post-Processing for Full AI Responses ──

/** Post-process a full AI response: extract JSON actions with robust parsing */
export function extractAllActions(aiResponse: string): { action: any; textResponse: string } {
  // All known action names
  const actionNames = [
    "add_transaction", "add_recurring_list", "add_reminder", "list_reminders",
    "delete_reminder", "edit_reminder", "add_goal", "deposit_goal", "edit_goal",
    "delete_goal", "list_goals", "add_wallet", "edit_wallet", "delete_wallet",
    "list_wallets", "add_category", "edit_category", "delete_category", "list_categories",
    "add_card", "edit_card", "delete_card", "list_cards", "delete_transaction",
    "edit_transaction", "list_transactions", "list_recurring", "edit_recurring",
    "delete_recurring", "transfer_wallet", "update_profile", "pay_bill", "list_bills",
  ];

  for (const name of actionNames) {
    const action = extractActionJson(aiResponse, name);
    if (action) {
      // Post-process based on action type
      if (action.amount !== undefined) action.amount = normalizeAmount(action.amount);
      if (action.description) action.description = cleanDescription(action.description);
      if (action.type && (name.includes("transaction") || name === "add_recurring_list")) {
        action.type = normalizeType(action.type);
      }
      if (action.search) action.search = cleanSearchTerm(action.search);
      if (action.title) action.title = cleanReminderTitle(action.title);

      // For recurring lists, clean each item
      if (name === "add_recurring_list" && Array.isArray(action.items)) {
        action.items = action.items.map((item: any) => ({
          ...item,
          amount: normalizeAmount(item.amount),
          description: cleanDescription(item.description || ""),
          type: normalizeType(item.type || "expense"),
        }));
      }

      return { action, textResponse: "" };
    }
  }

  // No action found — it's a text response
  return { action: null, textResponse: aiResponse };
}

/** Post-process the reminder AI parse result with programmatic overrides */
export function postProcessReminder(
  parsed: { title: string; event_at: string | null; recurrence: string; notify_minutes_before: number | null },
  originalText: string
): { title: string; event_at: string | null; recurrence: string; notify_minutes_before: number | null } {
  // Clean title programmatically
  const title = cleanReminderTitle(parsed.title, originalText);

  // Force user's time if we can detect it from original text
  let eventAt = parsed.event_at;
  if (eventAt) {
    const userTime = extractUserTime(originalText);
    if (userTime) {
      eventAt = forceTimeOnIso(eventAt, userTime.hours, userTime.minutes);
    }
  }

  return {
    title,
    event_at: eventAt,
    recurrence: ["none", "daily", "weekly", "monthly"].includes(parsed.recurrence) ? parsed.recurrence : "none",
    notify_minutes_before: typeof parsed.notify_minutes_before === "number" ? parsed.notify_minutes_before : null,
  };
}
