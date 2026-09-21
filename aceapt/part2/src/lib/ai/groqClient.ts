import Groq from "groq-sdk";

/**
 * Provider abstraction (spec section 36): every AI call in this codebase
 * goes through this one function. Swapping providers later means editing
 * this file, not the callers.
 */

let cachedClient: Groq | null | undefined; // undefined = not yet resolved, null = no key available

function getClient(): Groq | null {
  if (cachedClient !== undefined) return cachedClient;
  const apiKey = process.env.GROQ_API_KEY?.trim();
  cachedClient = apiKey ? new Groq({ apiKey }) : null;
  return cachedClient;
}

export interface GroqJsonCallOptions {
  systemPrompt: string;
  userPrompt: string;
  timeoutMs?: number;
}

/**
 * Returns the raw text of the model's response, or null if the call could
 * not be made (no key, network error, timeout, provider error). Callers
 * MUST treat null as "fall back to deterministic behavior" — never as an
 * exception to surface to the student (spec section 64).
 */
export async function callGroqForJson(options: GroqJsonCallOptions): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 12000);

  try {
    const model = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-20b";
    const completion = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: "system", content: options.systemPrompt },
          { role: "user", content: options.userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 900,
        response_format: { type: "json_object" },
      },
      { signal: controller.signal }
    );
    return completion.choices[0]?.message?.content ?? null;
  } catch (err) {
    console.error("[groqClient] call failed — caller will use deterministic fallback:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
