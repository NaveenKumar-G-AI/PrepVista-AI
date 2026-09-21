import type { LLMProvider, ProviderCallArgs, ProviderCallResult } from "./provider.interface";
import { ProviderConfigError, ProviderRequestError } from "./provider.interface";

/**
 * Groq (OpenAI-compatible chat completions) provider — fast tier.
 * Reads GROQ_API_KEY from the environment. Left unset here; set it in your
 * real deployment environment. Never commit a real key.
 */
export class GroqProvider implements LLMProvider {
  readonly name = "groq";
  readonly supportsLargeContext = false;
  readonly speedTier = "fast" as const;

  constructor(private model: string = "llama-3.1-70b-versatile") {}

  async generate(args: ProviderCallArgs): Promise<ProviderCallResult> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new ProviderConfigError("GROQ_API_KEY is not set");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), args.timeoutMs ?? 15000);
    const start = Date.now();
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: args.temperature ?? 0.2,
          max_tokens: args.maxTokens ?? 700,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: args.system },
            { role: "user", content: args.user },
          ],
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new ProviderRequestError(`Groq request failed: ${res.status} ${await res.text()}`);
      }
      const data = (await res.json()) as any;
      return {
        rawText: data.choices?.[0]?.message?.content ?? "",
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        latencyMs: Date.now() - start,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
