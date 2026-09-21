/**
 * AI provider abstraction.
 *
 * Mirrors CodeForge's existing "prefer free/low-cost infrastructure" policy:
 * Groq first (fast, cheap), Gemini as fallback. Nothing above this layer
 * (probe engine, evidence engine, controllers) ever imports Groq/Gemini
 * SDKs directly — they only depend on the AIProvider interface, so adding a
 * third provider or reordering the chain never touches business logic.
 *
 * Keys are read from process.env and are NEVER hard-coded. If a key is
 * missing, that provider reports itself unavailable rather than throwing at
 * import time, so the app can still boot with e.g. only Gemini configured.
 */

export interface StructuredCallParams {
  systemPrompt: string;
  userContent: string;
  /** JSON schema (already converted from zod) the model must follow. */
  jsonSchema: Record<string, unknown>;
  temperature?: number;
}

export interface ProviderResult {
  rawText: string;
  provider: string;
  latencyMs: number;
}

export class ProviderUnavailableError extends Error {
  constructor(public provider: string, message: string) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

export interface AIProvider {
  readonly name: string;
  isConfigured(): boolean;
  generate(params: StructuredCallParams): Promise<ProviderResult>;
}

const DEFAULT_TIMEOUT_MS = 20_000;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Groq — OpenAI-compatible chat completions API with JSON-object response
 * format. Groq's structured-output support varies by model; we additionally
 * enforce the schema ourselves downstream (structuredCall.ts) via zod, so
 * this layer only needs to ask nicely and return raw text.
 */
export class GroqProvider implements AIProvider {
  readonly name = "groq";
  private apiKey: string | undefined;
  private model: string;

  constructor(opts?: { apiKey?: string; model?: string }) {
    this.apiKey = opts?.apiKey ?? process.env.GROQ_API_KEY;
    this.model = opts?.model ?? process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async generate(params: StructuredCallParams): Promise<ProviderResult> {
    if (!this.apiKey) throw new ProviderUnavailableError(this.name, "GROQ_API_KEY is not set.");
    const start = Date.now();

    const res = await withTimeout(
      fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: params.temperature ?? 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: params.systemPrompt },
            { role: "user", content: params.userContent },
          ],
        }),
      }),
      DEFAULT_TIMEOUT_MS,
      "Groq request"
    );

    if (!res.ok) {
      throw new ProviderUnavailableError(this.name, `Groq responded ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const rawText = json.choices?.[0]?.message?.content ?? "";
    return { rawText, provider: this.name, latencyMs: Date.now() - start };
  }
}

/**
 * Gemini — generateContent with responseMimeType=application/json and a
 * responseSchema derived from the same zod schema used for validation.
 */
export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  private apiKey: string | undefined;
  private model: string;

  constructor(opts?: { apiKey?: string; model?: string }) {
    this.apiKey = opts?.apiKey ?? process.env.GEMINI_API_KEY;
    this.model = opts?.model ?? process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async generate(params: StructuredCallParams): Promise<ProviderResult> {
    if (!this.apiKey) throw new ProviderUnavailableError(this.name, "GEMINI_API_KEY is not set.");
    const start = Date.now();

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const res = await withTimeout(
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: params.systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: params.userContent }] }],
          generationConfig: {
            temperature: params.temperature ?? 0.2,
            responseMimeType: "application/json",
            responseSchema: params.jsonSchema,
          },
        }),
      }),
      DEFAULT_TIMEOUT_MS,
      "Gemini request"
    );

    if (!res.ok) {
      throw new ProviderUnavailableError(this.name, `Gemini responded ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return { rawText, provider: this.name, latencyMs: Date.now() - start };
  }
}

/**
 * Tries providers in order, falling through to the next on any failure
 * (missing key, timeout, non-2xx, network error). Never throws unless
 * every provider in the chain failed — callers must still handle that case
 * per the "report uncertainty, don't fabricate confidence" failure mode.
 */
export class ProviderChain {
  constructor(private providers: AIProvider[]) {}

  configuredProviders(): AIProvider[] {
    return this.providers.filter((p) => p.isConfigured());
  }

  async generate(
    params: StructuredCallParams,
    onProviderFailure?: (provider: string, error: unknown) => void
  ): Promise<ProviderResult> {
    const configured = this.configuredProviders();
    if (configured.length === 0) {
      throw new ProviderUnavailableError("none", "No AI provider is configured (missing API keys).");
    }
    let lastError: unknown;
    for (const provider of configured) {
      try {
        return await provider.generate(params);
      } catch (err) {
        lastError = err;
        onProviderFailure?.(provider.name, err);
      }
    }
    throw new ProviderUnavailableError(
      "all",
      `All configured providers failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`
    );
  }
}

/** Default chain matching CodeForge's stated preference order: Groq, then Gemini. */
export function defaultProviderChain(): ProviderChain {
  return new ProviderChain([new GroqProvider(), new GeminiProvider()]);
}
