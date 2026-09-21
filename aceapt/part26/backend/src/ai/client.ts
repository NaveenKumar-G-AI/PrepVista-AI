import { env } from "../config/env";
import { NextActionExplanation } from "../types";

/**
 * Section 38: "Do not let an LLM arbitrarily control the entire learning
 * path." This client is deliberately narrow - it can only rephrase a
 * `why` explanation the deterministic engine already computed. It is never
 * given the power to choose an action, invent a number, or change a
 * diagnosis; if ANTHROPIC_API_KEY is unset (the default, per your
 * .env.example) this short-circuits before making any network call at all,
 * and every caller already has a deterministic fallback.
 */
export async function enhanceExplanation(explanation: NextActionExplanation): Promise<string | null> {
  if (!env.anthropicApiKey) return null;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.anthropicApiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 200,
        system:
          "Rewrite the given explanation for a student in one or two warm, plain-language sentences. " +
          "You may ONLY reword what is given - never add numbers, claims, topics, or advice that are not " +
          "already present in the input. Return only the rewritten sentence(s), nothing else.",
        messages: [
          {
            role: "user",
            content: `What: ${explanation.what}\nWhy: ${explanation.why}\nTime: ${explanation.time}`
          }
        ]
      })
    });

    if (!response.ok) return null;
    const data = (await response.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((block) => block.type === "text")?.text;
    return text?.trim() || null;
  } catch {
    // Network issues, rate limits, bad keys, etc. all fall back silently -
    // the deterministic explanation is always correct on its own.
    return null;
  }
}
