import type { LLMProvider, ProviderCallArgs, ProviderCallResult } from "./provider.interface";
import { ProviderConfigError, ProviderRequestError } from "./provider.interface";

/**
 * Gemini (generateContent) provider — large-context tier, used when a
 * coaching turn needs more of the submission history or a long problem
 * statement than the fast tier comfortably supports.
 * Reads GEMINI_API_KEY from the environment. Left unset here.
 */
export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  readonly supportsLargeContext = true;
  readonly speedTier = "standard" as const;

  constructor(private model: string = "gemini-1.5-flash") {}

  async generate(args: ProviderCallArgs): Promise<ProviderCallResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new ProviderConfigError("GEMINI_API_KEY is not set");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), args.timeoutMs ?? 20000);
    const start = Date.now();
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: args.system }] },
            contents: [{ role: "user", parts: [{ text: args.user }] }],
            generationConfig: {
              temperature: args.temperature ?? 0.2,
              maxOutputTokens: args.maxTokens ?? 700,
              responseMimeType: "application/json",
            },
          }),
          signal: controller.signal,
        }
      );
      if (!res.ok) {
        throw new ProviderRequestError(`Gemini request failed: ${res.status} ${await res.text()}`);
      }
      const data = (await res.json()) as any;
      return {
        rawText: data.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
        promptTokens: data.usageMetadata?.promptTokenCount,
        completionTokens: data.usageMetadata?.candidatesTokenCount,
        latencyMs: Date.now() - start,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
