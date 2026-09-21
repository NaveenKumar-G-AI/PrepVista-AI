import type { AIProvider, AIProviderRequest, AIProviderResponse } from "../provider.js";
import { AIProviderError } from "../provider.js";

/**
 * Real Groq Chat Completions API (OpenAI-compatible):
 *   POST https://api.groq.com/openai/v1/chat/completions
 *   Authorization: Bearer <GROQ_API_KEY>
 *   body.response_format = { type: "json_schema", json_schema: { name, strict, schema } }
 *
 * Groq's structured-output "strict" mode requires every property to be
 * listed in `required` and `additionalProperties: false` on every object
 * (stricter than OpenAI's) and is only reliably honored on gpt-oss models,
 * so we request strict:false and defer to Zod (see responseValidator.ts)
 * with bounded retries — this matches Groq's own documented recommendation
 * for strict:false usage.
 */
export class GroqProvider implements AIProvider {
  readonly name = "groq";

  constructor(
    private readonly apiKey: string | undefined,
    readonly model: string = "llama-3.3-70b-versatile",
    private readonly baseUrl: string = "https://api.groq.com/openai/v1/chat/completions"
  ) {}

  async complete(req: AIProviderRequest): Promise<AIProviderResponse> {
    if (!this.apiKey) {
      throw new AIProviderError("GROQ_API_KEY is not configured", "network", this.name);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs);
    const started = Date.now();

    try {
      const res = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: req.systemPrompt },
            { role: "user", content: req.userPrompt },
          ],
          temperature: 0.1,
          max_completion_tokens: 1200,
          response_format: {
            type: "json_schema",
            json_schema: { name: req.schemaName, strict: false, schema: req.jsonSchema },
          },
        }),
        signal: controller.signal,
      });

      const latencyMs = Date.now() - started;

      if (res.status === 429) {
        throw new AIProviderError("Groq rate limit exceeded", "rate_limited", this.name);
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new AIProviderError(`Groq HTTP ${res.status}: ${body.slice(0, 300)}`, "http", this.name);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        model?: string;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const content = data.choices?.[0]?.message?.content ?? "";

      return {
        rawText: content,
        provider: this.name,
        model: data.model ?? this.model,
        latencyMs,
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
      };
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      if ((err as { name?: string }).name === "AbortError") {
        throw new AIProviderError("Groq request timed out", "timeout", this.name);
      }
      throw new AIProviderError(`Groq network error: ${(err as Error).message}`, "network", this.name);
    } finally {
      clearTimeout(timer);
    }
  }
}
