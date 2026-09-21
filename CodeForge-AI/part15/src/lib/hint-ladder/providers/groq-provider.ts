/**
 * Groq provider.
 *
 * Uses Groq's OpenAI-compatible Chat Completions endpoint directly via
 * fetch (no SDK dependency, so the request shape is fully visible here).
 *
 * We deliberately request `response_format: { type: "json_object" }`
 * (broad "JSON mode", supported across Groq's hosted chat models) rather
 * than the stricter `json_schema` structured-outputs mode, because that
 * stricter mode is only supported by a subset of models and this project
 * intentionally does not hardcode which model the deployer configures
 * (see .env.example — GROQ_MODEL_FAST/STRONG are left for the operator to
 * set). The exact JSON shape is still fully specified in the system
 * prompt, and schema.ts independently validates every response with Zod
 * regardless of what the provider claims to guarantee — provider-side
 * enforcement is a nice-to-have, not the thing we actually rely on.
 */

import { AIProvider, ProviderCallParams, ProviderCallResult, ProviderError, ProviderNotConfiguredError } from "./types";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export interface GroqConfig {
  apiKey: string | undefined;
  modelFast: string | undefined;
  modelStrong: string | undefined;
}

export function loadGroqConfigFromEnv(env: NodeJS.ProcessEnv = process.env): GroqConfig {
  return {
    apiKey: env.GROQ_API_KEY || undefined,
    modelFast: env.GROQ_MODEL_FAST || undefined,
    modelStrong: env.GROQ_MODEL_STRONG || undefined,
  };
}

export class GroqProvider implements AIProvider {
  readonly name = "groq" as const;

  constructor(private readonly config: GroqConfig) {}

  isConfigured(): boolean {
    return Boolean(this.config.apiKey && (this.config.modelFast || this.config.modelStrong));
  }

  async generate(params: ProviderCallParams): Promise<ProviderCallResult> {
    if (!this.config.apiKey) throw new ProviderNotConfiguredError("groq");
    const model = params.tier === "strong" ? this.config.modelStrong ?? this.config.modelFast : this.config.modelFast ?? this.config.modelStrong;
    if (!model) throw new ProviderNotConfiguredError("groq");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), params.timeoutMs);
    const started = Date.now();

    try {
      const response = await fetch(GROQ_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: params.systemPrompt },
            { role: "user", content: params.userPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
          max_completion_tokens: 700,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const bodyText = await safeReadText(response);
        throw new ProviderError(`Groq returned HTTP ${response.status}: ${bodyText.slice(0, 300)}`, "groq");
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content) throw new ProviderError("Groq response contained no message content.", "groq");

      return { rawText: content, provider: "groq", model, latencyMs: Date.now() - started };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      if ((err as { name?: string })?.name === "AbortError") {
        throw new ProviderError(`Groq call exceeded timeout of ${params.timeoutMs}ms`, "groq", err);
      }
      throw new ProviderError("Groq call failed.", "groq", err);
    } finally {
      clearTimeout(timer);
    }
  }
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "<unreadable body>";
  }
}
