import Anthropic from "@anthropic-ai/sdk";

// ============================================================
// AI Trust Rules (spec section 56):
//   - AI is only ever asked to phrase/explain/decompose facts that
//     are already in the database. It is never asked to invent
//     activity, results, deadlines, or feedback.
//   - Every prompt in prompts.ts includes the real data as JSON and
//     an explicit instruction not to add facts beyond it.
//   - If the key is absent, or the call errors or times out, every
//     caller in lib/services/* has a deterministic fallback path —
//     the core execution loop never depends on the AI being up
//     (spec sections 66 and 82).
// ============================================================

let client: Anthropic | null | undefined;

function getClient(): Anthropic | null {
  if (client !== undefined) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    client = null;
    return client;
  }
  client = new Anthropic({ apiKey, timeout: 15_000, maxRetries: 1 });
  return client;
}

export function isAiAvailable(): boolean {
  return getClient() !== null;
}

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

/** Plain-text completion. Returns null on any failure — callers must
 *  treat null as "fall back to deterministic text", not as an error
 *  to surface to the student. */
export async function callClaudeText(system: string, userPrompt: string, maxTokens = 400): Promise<string | null> {
  const anthropic = getClient();
  if (!anthropic) return null;
  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userPrompt }],
    });
    const textBlock = message.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    return textBlock?.text?.trim() || null;
  } catch (err) {
    console.warn("[aceapt] AI text call failed, falling back to deterministic text:", (err as Error).message);
    return null;
  }
}

/** JSON-structured completion. `system` must instruct the model to
 *  return only JSON. Returns null (never throws) if the call fails
 *  or the response cannot be parsed as valid JSON matching a plain
 *  object/array shape. */
export async function callClaudeJson<T>(system: string, userPrompt: string, maxTokens = 1200): Promise<T | null> {
  const raw = await callClaudeText(system, userPrompt, maxTokens);
  if (!raw) return null;
  try {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    return JSON.parse(cleaned) as T;
  } catch (err) {
    console.warn("[aceapt] AI JSON parse failed, falling back to deterministic logic:", (err as Error).message);
    return null;
  }
}
