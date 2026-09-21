import { AI_SEMANTIC_OUTPUT_SCHEMA, buildPrompt, AIUnavailableError } from "./AIValidatorClient.js";
import type { AIValidatorClient, AISemanticInput, AISemanticOutput } from "./AIValidatorClient.js";

/**
 * Real Groq integration, matching the adapter used across every prior ACEAPT/
 * CodeForge feature in this series (Groq behind a deterministic fallback, used
 * only for restating/semantic judgment, never for scoring truth). The API key
 * is intentionally left BLANK here — set GROQ_API_KEY in your environment.
 *
 * This sandbox has no network route to api.groq.com (see network allowlist),
 * so — same as CodeForge's Feature 35 adapter — this class is real, complete,
 * and UNEXERCISED in this delivery's test run. Tests instead run against
 * SimulatedAIClient (see ai/SimulatedAIClient.ts), which is contract-faithful
 * to this same interface.
 */
export class GroqAdapter implements AIValidatorClient {
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly endpoint = "https://api.groq.com/openai/v1/chat/completions";

  constructor(options?: { apiKey?: string; model?: string }) {
    this.apiKey = options?.apiKey ?? process.env.GROQ_API_KEY ?? undefined;
    this.model = options?.model ?? process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
  }

  async assess(input: AISemanticInput): Promise<AISemanticOutput> {
    if (!this.apiKey) {
      // spec §170: AI fallback must never be silently treated as "reviewed and fine."
      throw new AIUnavailableError("GROQ_API_KEY is not set.");
    }

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: buildPrompt(input) }]
        })
      });
    } catch (err) {
      throw new AIUnavailableError(`network error calling Groq: ${(err as Error).message}`);
    }

    if (!response.ok) {
      throw new AIUnavailableError(`Groq returned HTTP ${response.status}`);
    }

    const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = body.choices?.[0]?.message?.content;
    if (!raw) throw new AIUnavailableError("Groq response had no message content.");

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      // A malformed response is AI_OUTPUT_INVALID territory, handled by the
      // caller (AISemanticValidator) — we still throw here so it's treated
      // uniformly with "unavailable" from the executor's retry perspective,
      // and the validator itself decides how to code it.
      throw new AIOutputParseError(raw);
    }

    const validated = AI_SEMANTIC_OUTPUT_SCHEMA.safeParse(parsedJson);
    if (!validated.success) {
      throw new AIOutputParseError(raw);
    }
    return validated.data;
  }
}

export class AIOutputParseError extends Error {
  constructor(public readonly rawOutput: string) {
    super("AI output did not match the required structured schema.");
    this.name = "AIOutputParseError";
  }
}
