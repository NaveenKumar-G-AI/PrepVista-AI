import { config } from "../config.js";

export interface AICompletionRequest {
  system: string;
  user: string;
  maxTokens?: number;
}

export interface AICompletionSuccess {
  ok: true;
  text: string;
  provider: "groq" | "gemini" | "anthropic";
}

export interface AICompletionFailure {
  ok: false;
  reason: "NOT_CONFIGURED" | "REQUEST_FAILED" | "RATE_LIMITED" | "TIMEOUT";
  detail?: string;
}

export type AICompletionOutcome = AICompletionSuccess | AICompletionFailure;

export interface ProviderAdapter {
  name: "groq" | "gemini" | "anthropic";
  isConfigured: () => boolean;
  complete: (req: AICompletionRequest) => Promise<AICompletionOutcome>;
}

class TimeoutError extends Error {}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) throw new TimeoutError("AI request timed out");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function failureFromError(err: unknown): AICompletionFailure {
  if (err instanceof TimeoutError) return { ok: false, reason: "TIMEOUT", detail: err.message };
  return { ok: false, reason: "REQUEST_FAILED", detail: err instanceof Error ? err.message : String(err) };
}

// ---------------------------------------------------------------------------
// Groq (OpenAI-compatible chat completions)
// ---------------------------------------------------------------------------

export const groqAdapter: ProviderAdapter = {
  name: "groq",
  isConfigured: () => Boolean(config.ai.groq.apiKey),
  complete: async (req) => {
    if (!config.ai.groq.apiKey) return { ok: false, reason: "NOT_CONFIGURED" };
    try {
      const res = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.ai.groq.apiKey}` },
        body: JSON.stringify({
          model: config.ai.groq.model,
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user }
          ],
          max_tokens: req.maxTokens ?? 500,
          temperature: 0.2
        })
      });
      if (res.status === 429) return { ok: false, reason: "RATE_LIMITED" };
      if (!res.ok) return { ok: false, reason: "REQUEST_FAILED", detail: `HTTP ${res.status}` };
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const text = data.choices?.[0]?.message?.content;
      if (typeof text !== "string") return { ok: false, reason: "REQUEST_FAILED", detail: "malformed response shape" };
      return { ok: true, text, provider: "groq" };
    } catch (err) {
      return failureFromError(err);
    }
  }
};

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

export const geminiAdapter: ProviderAdapter = {
  name: "gemini",
  isConfigured: () => Boolean(config.ai.gemini.apiKey),
  complete: async (req) => {
    if (!config.ai.gemini.apiKey) return { ok: false, reason: "NOT_CONFIGURED" };
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.ai.gemini.model}:generateContent?key=${config.ai.gemini.apiKey}`;
      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: "user", parts: [{ text: req.user }] }],
          generationConfig: { maxOutputTokens: req.maxTokens ?? 500, temperature: 0.2 }
        })
      });
      if (res.status === 429) return { ok: false, reason: "RATE_LIMITED" };
      if (!res.ok) return { ok: false, reason: "REQUEST_FAILED", detail: `HTTP ${res.status}` };
      const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== "string") return { ok: false, reason: "REQUEST_FAILED", detail: "malformed response shape" };
      return { ok: true, text, provider: "gemini" };
    } catch (err) {
      return failureFromError(err);
    }
  }
};

// ---------------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------------

export const anthropicAdapter: ProviderAdapter = {
  name: "anthropic",
  isConfigured: () => Boolean(config.ai.anthropic.apiKey),
  complete: async (req) => {
    if (!config.ai.anthropic.apiKey) return { ok: false, reason: "NOT_CONFIGURED" };
    try {
      const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.ai.anthropic.apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: config.ai.anthropic.model,
          max_tokens: req.maxTokens ?? 500,
          system: req.system,
          messages: [{ role: "user", content: req.user }]
        })
      });
      if (res.status === 429) return { ok: false, reason: "RATE_LIMITED" };
      if (!res.ok) return { ok: false, reason: "REQUEST_FAILED", detail: `HTTP ${res.status}` };
      const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      const block = data.content?.find((b) => b.type === "text");
      if (!block?.text) return { ok: false, reason: "REQUEST_FAILED", detail: "malformed response shape" };
      return { ok: true, text: block.text, provider: "anthropic" };
    } catch (err) {
      return failureFromError(err);
    }
  }
};

// ---------------------------------------------------------------------------
// Router: tries each configured provider in order, never throws.
// ---------------------------------------------------------------------------

export class AIProviderRouter {
  private readonly providers: ProviderAdapter[];

  constructor(providers: ProviderAdapter[] = [groqAdapter, geminiAdapter, anthropicAdapter]) {
    this.providers = providers;
  }

  get isAnyConfigured(): boolean {
    return this.providers.some((p) => p.isConfigured());
  }

  async complete(req: AICompletionRequest): Promise<AICompletionOutcome> {
    const attempts: AICompletionFailure[] = [];
    for (const provider of this.providers) {
      if (!provider.isConfigured()) continue;
      const result = await provider.complete(req);
      if (result.ok) return result;
      attempts.push(result);
    }
    if (attempts.length === 0) {
      return { ok: false, reason: "NOT_CONFIGURED", detail: "No AI provider has an API key configured." };
    }
    return { ok: false, reason: "REQUEST_FAILED", detail: `All configured providers failed: ${attempts.map((a) => a.reason).join(", ")}` };
  }
}
