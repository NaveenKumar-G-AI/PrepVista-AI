// ============================================================================
// AI provider abstraction (Section 41)
// ============================================================================
// If your project already has a provider abstraction (it should — Section 2
// says not to duplicate it), point that abstraction at these same env vars
// instead of using this file. This exists so the coach module is testable
// standalone; it is not meant to become a second, competing abstraction.
//
// Neither GroqProvider nor GeminiProvider is called by this repo's own test
// suite: no network egress to either host is available in the sandbox this
// was built in, and GROQ_API_KEY / GEMINI_API_KEY are intentionally blank
// per instruction. Both are implemented against each provider's documented
// REST shape as of this writing, but have NOT been exercised against a live
// endpoint — verify request/response shape against current provider docs
// before relying on them. All orchestrator tests instead use FakeProvider.
// ============================================================================

export interface AiCompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface AiProvider {
  readonly name: string;
  complete(request: AiCompletionRequest): Promise<string>;
}

export class GroqProvider implements AiProvider {
  readonly name = "groq";

  constructor(
    private readonly apiKey: string,
    private readonly model: string = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile"
  ) {}

  async complete(request: AiCompletionRequest): Promise<string> {
    if (!this.apiKey) throw new Error("GROQ_API_KEY is not set.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? 8000);
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: request.systemPrompt },
            { role: "user", content: request.userPrompt },
          ],
          max_tokens: request.maxTokens ?? 500,
          temperature: 0.3,
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Groq request failed: ${res.status} ${await res.text()}`);
      const json: any = await res.json();
      const content = json?.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new Error("Groq response missing choices[0].message.content");
      return content;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class GeminiProvider implements AiProvider {
  readonly name = "gemini";

  constructor(
    private readonly apiKey: string,
    private readonly model: string = process.env.GEMINI_MODEL ?? "gemini-1.5-flash"
  ) {}

  async complete(request: AiCompletionRequest): Promise<string> {
    if (!this.apiKey) throw new Error("GEMINI_API_KEY is not set.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? 8000);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: request.userPrompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: request.maxTokens ?? 500 },
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Gemini request failed: ${res.status} ${await res.text()}`);
      const json: any = await res.json();
      const content = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof content !== "string") throw new Error("Gemini response missing candidates[0].content.parts[0].text");
      return content;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Deterministic, network-free provider — used in tests only. */
export class FakeProvider implements AiProvider {
  readonly name = "fake";
  constructor(private readonly responder: (request: AiCompletionRequest) => string) {}
  async complete(request: AiCompletionRequest): Promise<string> {
    return this.responder(request);
  }
}

/** Tries providers in order, falling through on failure, so one outage doesn't take the coach down. */
export class FallbackProvider implements AiProvider {
  readonly name = "fallback";
  constructor(private readonly providers: AiProvider[]) {}

  async complete(request: AiCompletionRequest): Promise<string> {
    const errors: string[] = [];
    for (const provider of this.providers) {
      try {
        return await provider.complete(request);
      } catch (err) {
        errors.push(`${provider.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    throw new Error(`All providers failed: ${errors.join(" | ")}`);
  }
}
