// Illustrative Groq / Gemini adapters. These are NOT wired to your real
// provider client — the spec says to reuse your existing Groq/Gemini
// integration instead of hard-coding a new one. Treat this file as a
// reference implementation of the AIProvider contract; replace the guts of
// each class with calls into your existing provider abstraction, or delete
// this file entirely and point getConfiguredAIProvider() at your own client.
//
// Endpoint shapes below follow each provider's standard chat/generate
// pattern (Groq: OpenAI-compatible chat completions; Gemini: generateContent)
// — double check current parameter names against your provider's docs before
// relying on this in production, since APIs evolve.
//
// Not executed or network-tested in this build: no keys were provided (by
// request) and this sandbox's network allowlist doesn't include these hosts.

import type { z } from "zod";
import { NullAIProvider, type AIProvider, type AIResult } from "./provider";

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

function safeParseJSON<T>(text: string, schema: z.ZodType<T>): AIResult<T> {
  try {
    const cleaned = text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    const result = schema.safeParse(parsed);
    if (!result.success) {
      return { ok: false, reason: "INVALID_RESPONSE", detail: result.error.message };
    }
    return { ok: true, data: result.data, raw: text };
  } catch (e) {
    return { ok: false, reason: "INVALID_RESPONSE", detail: e instanceof Error ? e.message : String(e) };
  }
}

export class GroqProvider implements AIProvider {
  readonly name = "groq";
  private apiKey = process.env.GROQ_API_KEY ?? "";
  get configured(): boolean {
    return this.apiKey.length > 0;
  }

  async completeStructured<T>(params: {
    system: string;
    user: string;
    schema: z.ZodType<T>;
    maxTokens?: number;
    timeoutMs?: number;
  }): Promise<AIResult<T>> {
    if (!this.configured) return { ok: false, reason: "NOT_CONFIGURED" };
    try {
      const res = await withTimeout(
        fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify({
            model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
            messages: [
              { role: "system", content: params.system },
              { role: "user", content: params.user },
            ],
            max_tokens: params.maxTokens ?? 800,
            response_format: { type: "json_object" },
          }),
        }),
        params.timeoutMs ?? 15000,
      );
      if (!res.ok) return { ok: false, reason: "PROVIDER_ERROR", detail: `HTTP ${res.status}` };
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = json?.choices?.[0]?.message?.content ?? "";
      return safeParseJSON(text, params.schema);
    } catch (e) {
      const timedOut = e instanceof Error && e.message === "timeout";
      return { ok: false, reason: timedOut ? "TIMEOUT" : "PROVIDER_ERROR", detail: e instanceof Error ? e.message : String(e) };
    }
  }
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  private apiKey = process.env.GEMINI_API_KEY ?? "";
  get configured(): boolean {
    return this.apiKey.length > 0;
  }

  async completeStructured<T>(params: {
    system: string;
    user: string;
    schema: z.ZodType<T>;
    maxTokens?: number;
    timeoutMs?: number;
  }): Promise<AIResult<T>> {
    if (!this.configured) return { ok: false, reason: "NOT_CONFIGURED" };
    const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
    try {
      const res = await withTimeout(
        fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: params.system }] },
            contents: [{ role: "user", parts: [{ text: params.user }] }],
            generationConfig: { maxOutputTokens: params.maxTokens ?? 800, responseMimeType: "application/json" },
          }),
        }),
        params.timeoutMs ?? 15000,
      );
      if (!res.ok) return { ok: false, reason: "PROVIDER_ERROR", detail: `HTTP ${res.status}` };
      const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      return safeParseJSON(text, params.schema);
    } catch (e) {
      const timedOut = e instanceof Error && e.message === "timeout";
      return { ok: false, reason: timedOut ? "TIMEOUT" : "PROVIDER_ERROR", detail: e instanceof Error ? e.message : String(e) };
    }
  }
}

/** Picks whichever provider has a key configured; falls back to the null provider (deterministic heuristics only). */
export function getConfiguredAIProvider(): AIProvider {
  const groq = new GroqProvider();
  if (groq.configured) return groq;
  const gemini = new GeminiProvider();
  if (gemini.configured) return gemini;
  return new NullAIProvider();
}
