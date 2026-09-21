import type { AIProvider, AIProviderRequest, AIProviderResponse } from "../provider.js";
import { AIProviderError } from "../provider.js";

/**
 * Real Gemini generateContent REST API:
 *   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 *   header: x-goog-api-key: <GEMINI_API_KEY>
 *   body.generationConfig = { responseMimeType: "application/json", responseSchema }
 *   body.systemInstruction = { parts: [{ text }] }  (separate from `contents`)
 *
 * Gemini's responseSchema is a constrained subset of OpenAPI 3.0 schema with
 * UPPERCASE type names (OBJECT/STRING/ARRAY/...), not standard JSON Schema —
 * toGeminiSchema() below converts our one shared JSON Schema into that shape
 * so we author the contract once (src/domain/schema.ts) and adapt it per
 * provider, rather than hand-maintaining two schemas that can drift apart.
 */
export class GeminiProvider implements AIProvider {
  readonly name = "gemini";

  constructor(
    private readonly apiKey: string | undefined,
    readonly model: string = "gemini-2.5-flash",
    private readonly baseUrl: string = "https://generativelanguage.googleapis.com/v1beta/models"
  ) {}

  async complete(req: AIProviderRequest): Promise<AIProviderResponse> {
    if (!this.apiKey) {
      throw new AIProviderError("GEMINI_API_KEY is not configured", "network", this.name);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs);
    const started = Date.now();
    const url = `${this.baseUrl}/${this.model}:generateContent`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: req.userPrompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: toGeminiSchema(req.jsonSchema),
            temperature: 0.1,
            maxOutputTokens: 1200,
          },
        }),
        signal: controller.signal,
      });

      const latencyMs = Date.now() - started;

      if (res.status === 429) {
        throw new AIProviderError("Gemini rate limit exceeded", "rate_limited", this.name);
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new AIProviderError(`Gemini HTTP ${res.status}: ${body.slice(0, 300)}`, "http", this.name);
      }

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

      return {
        rawText: text,
        provider: this.name,
        model: this.model,
        latencyMs,
        promptTokens: data.usageMetadata?.promptTokenCount,
        completionTokens: data.usageMetadata?.candidatesTokenCount,
      };
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      if ((err as { name?: string }).name === "AbortError") {
        throw new AIProviderError("Gemini request timed out", "timeout", this.name);
      }
      throw new AIProviderError(`Gemini network error: ${(err as Error).message}`, "network", this.name);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Converts a plain-JSON-Schema subset into Gemini's UPPERCASE-typed responseSchema shape. */
export function toGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  // Handle `anyOf: [X, {type:"null"}]` -> X with nullable:true (our only use of anyOf).
  if (Array.isArray((schema as { anyOf?: unknown[] }).anyOf)) {
    const anyOf = (schema as { anyOf: Record<string, unknown>[] }).anyOf;
    const nonNull = anyOf.find((s) => s.type !== "null");
    const hasNull = anyOf.some((s) => s.type === "null");
    const converted = nonNull ? toGeminiSchema(nonNull) : {};
    return hasNull ? { ...converted, nullable: true } : converted;
  }

  const type = schema.type as string | undefined;
  const out: Record<string, unknown> = {};

  if (type) out.type = type.toUpperCase();
  if (schema.enum) out.enum = schema.enum;

  if (type === "object" && schema.properties) {
    const props = schema.properties as Record<string, Record<string, unknown>>;
    out.properties = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, toGeminiSchema(v)]));
    if (Array.isArray(schema.required)) out.required = schema.required;
  }

  if (type === "array" && schema.items) {
    out.items = toGeminiSchema(schema.items as Record<string, unknown>);
  }

  return out;
}
