/**
 * AI is only ever used to rephrase already-computed, structured evidence into
 * more natural language (spec section 56: "Do not let an LLM arbitrarily
 * decide the student's numerical readiness."). It never sees raw student data
 * beyond the WhyPanelContent it's asked to rephrase, and it's explicitly told
 * not to introduce new facts, numbers, or employment predictions. The output
 * is still run through utils/format.ts's guardAgainstEmploymentClaims before
 * it reaches a student (defense in depth, not just prompting).
 *
 * With AI_PROVIDER_ENABLED=false (the default — see .env.example) the system
 * uses NoOpAIExplanationProvider and nothing about this file needs to be
 * touched for Feature 27 to work end to end.
 */
import type { WhyPanelContent } from "../domain/types.js";
import { env } from "../config/env.js";

export interface AIExplanationProvider {
  /** Returns a short natural-language rendering of the given evidence, or
   * null if the provider declines/fails (caller falls back to deterministic text). */
  rephrase(whyPanel: WhyPanelContent): Promise<string | null>;
}

export class NoOpAIExplanationProvider implements AIExplanationProvider {
  async rephrase(): Promise<string | null> {
    return null;
  }
}

const SYSTEM_PROMPT = `You rephrase a student's readiness evidence into 2-3 warm, plain-language sentences.
Rules:
- Use ONLY the facts given below. Do not invent numbers, causes, or outcomes not present in the input.
- Never mention employment, placement, jobs, offers, or "chances of getting hired" — this tool predicts capability readiness only, never job outcomes.
- Do not use decimal precision; round numbers as given.
- Keep it encouraging but honest — do not soften a real risk into something it isn't.`;

/**
 * Example wiring against Anthropic's Messages API. This is illustrative and
 * intentionally minimal (model name is env-configured, not hardcoded, since
 * that's a deployment decision, not something this module should assert).
 * Swap for whatever provider your platform already standardizes on.
 */
export class AnthropicAIExplanationProvider implements AIExplanationProvider {
  async rephrase(whyPanel: WhyPanelContent): Promise<string | null> {
    if (!env.aiProviderEnabled || !env.aiProviderApiKey || !env.aiProviderModel) return null;
    try {
      const response = await fetch(env.aiProviderBaseUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": env.aiProviderApiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: env.aiProviderModel,
          max_tokens: 300,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: JSON.stringify(whyPanel) }],
        }),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as { content?: { type: string; text?: string }[] };
      const text = data.content?.find((block) => block.type === "text")?.text;
      return text?.trim() || null;
    } catch {
      return null; // network/parse failure -> caller falls back to deterministic text
    }
  }
}

export function createAIExplanationProvider(): AIExplanationProvider {
  return env.aiProviderEnabled ? new AnthropicAIExplanationProvider() : new NoOpAIExplanationProvider();
}
