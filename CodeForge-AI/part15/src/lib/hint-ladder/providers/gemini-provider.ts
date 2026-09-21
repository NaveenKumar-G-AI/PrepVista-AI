/**
 * Gemini provider.
 *
 * Uses the Gemini REST `generateContent` endpoint directly via fetch (no
 * SDK dependency). Gemini supports genuine schema-constrained JSON output
 * via `generationConfig.responseSchema`, which we use — it's more
 * reliable than Groq's JSON-object mode — but schema.ts still validates
 * independently, because "the provider is supposed to guarantee this" is
 * never treated as sufficient on its own (see output-guard.ts for why).
 */

import { MODEL_HINT_JSON_SCHEMA } from "../schema";
import { AIProvider, ProviderCallParams, ProviderCallResult, ProviderError, ProviderNotConfiguredError } from "./types";

function endpointFor(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

export interface GeminiConfig {
  apiKey: string | undefined;
  modelFast: string | undefined;
  modelStrong: string | undefined;
}

export function loadGeminiConfigFromEnv(env: NodeJS.ProcessEnv = process.env): GeminiConfig {
  return {
    apiKey: env.GEMINI_API_KEY || undefined,
    modelFast: env.GEMINI_MODEL_FAST || undefined,
    modelStrong: env.GEMINI_MODEL_STRONG || undefined,
  };
}

// Gemini's responseSchema dialect doesn't accept `additionalProperties`;
// strip it rather than risk a 400 from an unsupported keyword.
function toGeminiSchema(schema: typeof MODEL_HINT_JSON_SCHEMA) {
  const { additionalProperties: _drop, ...rest } = schema as unknown as Record<string, unknown>;
  return rest;
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini" as const;

  constructor(private readonly config: GeminiConfig) {}

  isConfigured(): boolean {
    return Boolean(this.config.apiKey && (this.config.modelFast || this.config.modelStrong));
  }

  async generate(params: ProviderCallParams): Promise<ProviderCallResult> {
    if (!this.config.apiKey) throw new ProviderNotConfiguredError("gemini");
    const model = params.tier === "strong" ? this.config.modelStrong ?? this.config.modelFast : this.config.modelFast ?? this.config.modelStrong;
    if (!model) throw new ProviderNotConfiguredError("gemini");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), params.timeoutMs);
    const started = Date.now();

    try {
      const response = await fetch(endpointFor(model), {
        method: "POST",
        headers: {
          "x-goog-api-key": this.config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: params.systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: params.userPrompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: toGeminiSchema(MODEL_HINT_JSON_SCHEMA),
            temperature: 0.3,
            maxOutputTokens: 700,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const bodyText = await safeReadText(response);
        throw new ProviderError(`Gemini returned HTTP ${response.status}: ${bodyText.slice(0, 300)}`, "gemini");
      }

      const json = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new ProviderError("Gemini response contained no candidate text.", "gemini");

      return { rawText: text, provider: "gemini", model, latencyMs: Date.now() - started };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      if ((err as { name?: string })?.name === "AbortError") {
        throw new ProviderError(`Gemini call exceeded timeout of ${params.timeoutMs}ms`, "gemini", err);
      }
      throw new ProviderError("Gemini call failed.", "gemini", err);
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
