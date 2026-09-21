import {
  ClaimExtractionResponseSchema,
  SemanticJudgementResponseSchema,
  FollowUpPhrasingResponseSchema,
  type AIProvider,
  type AIResult,
  type ClaimExtractionResponse,
  type SemanticJudgementResponse,
  type FollowUpPhrasingResponse,
} from "./provider.js";
import { wrapUntrustedText, UNTRUSTED_CONTENT_SYSTEM_NOTE } from "./promptInjectionGuard.js";
import type { Claim } from "../types.js";

const DEFAULT_TIMEOUT_MS = 20_000;

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<AIResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const value = await fn(controller.signal);
    return { ok: true, value };
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === "AbortError") {
      return { ok: false, reason: "AI_TIMEOUT", message: `Request exceeded ${timeoutMs}ms.` };
    }
    return { ok: false, reason: "AI_PROVIDER_FAILURE", message: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

function extractionPrompt(reasoningText: string, ruleBasedHints: Claim[]): string {
  return [
    "A student wrote the following explanation of their code solution.",
    "A deterministic rule-based pass already extracted these candidate claims",
    "(you may confirm, refine wording, adjust claimType/importance, or add a",
    "claim ONLY if it is clearly present in the text — never invent a claim",
    "with no basis in the text):",
    "",
    JSON.stringify(ruleBasedHints, null, 2),
    "",
    "Student explanation:",
    wrapUntrustedText(reasoningText),
    "",
    'Respond with JSON only: { "claims": [...], "confidence": "HIGH"|"MEDIUM"|"LOW" }',
    "Each claim needs: claimId, claimType, originalText, normalizedMeaning, importance, confidence (0-1).",
  ].join("\n");
}

// ── Groq — OpenAI-compatible /chat/completions, JSON object mode ──────────
// Endpoint & auth confirmed against console.groq.com/docs (Aug 2026).
export class GroqProvider implements AIProvider {
  readonly name = "groq";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl = "https://api.groq.com/openai/v1/chat/completions";

  constructor(opts: { apiKey?: string; model?: string } = {}) {
    this.apiKey = opts.apiKey ?? process.env.GROQ_API_KEY ?? "";
    // Groq's fast/free-tier model lineup changes; check console.groq.com/docs/models
    // for the current list rather than trusting this default long-term.
    this.model = opts.model ?? process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
  }

  private async call(systemPrompt: string, userPrompt: string): Promise<AIResult<unknown>> {
    if (!this.apiKey) return { ok: false, reason: "AI_PROVIDER_FAILURE", message: "GROQ_API_KEY is not set." };
    return withTimeout(async (signal) => {
      const res = await fetch(this.baseUrl, {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: `${systemPrompt}\n\n${UNTRUSTED_CONTENT_SYSTEM_NOTE}` },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0,
        }),
      });
      if (!res.ok) throw new Error(`Groq API returned ${res.status}: ${await res.text()}`);
      const body = (await res.json()) as any;
      const content = body?.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new Error("Groq response missing choices[0].message.content");
      return JSON.parse(content);
    }, DEFAULT_TIMEOUT_MS);
  }

  async extractClaims(input: { reasoningText: string; ruleBasedHints: Claim[] }): Promise<AIResult<ClaimExtractionResponse>> {
    const raw = await this.call(
      "You extract structured claims from a student's explanation of their code. Never invent claims not present in the text.",
      extractionPrompt(input.reasoningText, input.ruleBasedHints)
    );
    if (!raw.ok) return raw;
    const parsed = ClaimExtractionResponseSchema.safeParse(raw.value);
    if (!parsed.success) return { ok: false, reason: "INVALID_AI_RESPONSE", message: parsed.error.message };
    return { ok: true, value: parsed.data };
  }

  async judgeSemanticMatch(input: { claimText: string; targetConcept: string }): Promise<AIResult<SemanticJudgementResponse>> {
    const raw = await this.call(
      "You judge whether a student's free-text claim semantically matches a target technical concept, regardless of vocabulary or phrasing.",
      [
        `Target concept: ${input.targetConcept}`,
        `Student claim: ${wrapUntrustedText(input.claimText)}`,
        'Respond with JSON only: { "matches": boolean, "confidence": "HIGH"|"MEDIUM"|"LOW", "reasoning": string }',
      ].join("\n")
    );
    if (!raw.ok) return raw;
    const parsed = SemanticJudgementResponseSchema.safeParse(raw.value);
    if (!parsed.success) return { ok: false, reason: "INVALID_AI_RESPONSE", message: parsed.error.message };
    return { ok: true, value: parsed.data };
  }

  async phraseFollowUpQuestion(input: { templateType: string; evidenceSummary: string }): Promise<AIResult<FollowUpPhrasingResponse>> {
    const raw = await this.call(
      "You phrase a targeted coaching question for a student, based on a specific piece of evidence. Do not change what is being asked, only how it reads. Keep it under 2 sentences.",
      [
        `Question type: ${input.templateType}`,
        `Evidence: ${wrapUntrustedText(input.evidenceSummary)}`,
        'Respond with JSON only: { "question": string }',
      ].join("\n")
    );
    if (!raw.ok) return raw;
    const parsed = FollowUpPhrasingResponseSchema.safeParse(raw.value);
    if (!parsed.success) return { ok: false, reason: "INVALID_AI_RESPONSE", message: parsed.error.message };
    return { ok: true, value: parsed.data };
  }
}

// ── Gemini — generateContent with responseSchema (structured output) ─────
// Endpoint & auth confirmed against ai.google.dev/gemini-api/docs (Aug 2026).
// Uses the stable generateContent API (not the Interactions beta).
export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  private readonly apiKey: string;
  private readonly model: string;

  constructor(opts: { apiKey?: string; model?: string } = {}) {
    this.apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY ?? "";
    this.model = opts.model ?? process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
  }

  private async call(systemPrompt: string, userPrompt: string, responseSchema: object): Promise<AIResult<unknown>> {
    if (!this.apiKey) return { ok: false, reason: "AI_PROVIDER_FAILURE", message: "GEMINI_API_KEY is not set." };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    return withTimeout(async (signal) => {
      const res = await fetch(url, {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: `${systemPrompt}\n\n${UNTRUSTED_CONTENT_SYSTEM_NOTE}` }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: { responseMimeType: "application/json", responseSchema, temperature: 0 },
        }),
      });
      if (!res.ok) throw new Error(`Gemini API returned ${res.status}: ${await res.text()}`);
      const body = (await res.json()) as any;
      const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== "string") throw new Error("Gemini response missing candidates[0].content.parts[0].text");
      return JSON.parse(text);
    }, DEFAULT_TIMEOUT_MS);
  }

  async extractClaims(input: { reasoningText: string; ruleBasedHints: Claim[] }): Promise<AIResult<ClaimExtractionResponse>> {
    const schema = {
      type: "object",
      properties: {
        claims: {
          type: "array",
          items: {
            type: "object",
            properties: {
              claimId: { type: "string" },
              claimType: { type: "string" },
              originalText: { type: "string" },
              normalizedMeaning: { type: "string" },
              importance: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["claimId", "claimType", "originalText", "normalizedMeaning", "importance", "confidence"],
          },
        },
        confidence: { type: "string" },
      },
      required: ["claims", "confidence"],
    };
    const raw = await this.call(
      "You extract structured claims from a student's explanation of their code. Never invent claims not present in the text.",
      extractionPrompt(input.reasoningText, input.ruleBasedHints),
      schema
    );
    if (!raw.ok) return raw;
    const parsed = ClaimExtractionResponseSchema.safeParse(raw.value);
    if (!parsed.success) return { ok: false, reason: "INVALID_AI_RESPONSE", message: parsed.error.message };
    return { ok: true, value: parsed.data };
  }

  async judgeSemanticMatch(input: { claimText: string; targetConcept: string }): Promise<AIResult<SemanticJudgementResponse>> {
    const schema = {
      type: "object",
      properties: { matches: { type: "boolean" }, confidence: { type: "string" }, reasoning: { type: "string" } },
      required: ["matches", "confidence", "reasoning"],
    };
    const raw = await this.call(
      "You judge whether a student's free-text claim semantically matches a target technical concept, regardless of vocabulary or phrasing.",
      [`Target concept: ${input.targetConcept}`, `Student claim: ${wrapUntrustedText(input.claimText)}`].join("\n"),
      schema
    );
    if (!raw.ok) return raw;
    const parsed = SemanticJudgementResponseSchema.safeParse(raw.value);
    if (!parsed.success) return { ok: false, reason: "INVALID_AI_RESPONSE", message: parsed.error.message };
    return { ok: true, value: parsed.data };
  }

  async phraseFollowUpQuestion(input: { templateType: string; evidenceSummary: string }): Promise<AIResult<FollowUpPhrasingResponse>> {
    const schema = { type: "object", properties: { question: { type: "string" } }, required: ["question"] };
    const raw = await this.call(
      "You phrase a targeted coaching question for a student, based on a specific piece of evidence. Do not change what is being asked, only how it reads. Keep it under 2 sentences.",
      [`Question type: ${input.templateType}`, `Evidence: ${wrapUntrustedText(input.evidenceSummary)}`].join("\n"),
      schema
    );
    if (!raw.ok) return raw;
    const parsed = FollowUpPhrasingResponseSchema.safeParse(raw.value);
    if (!parsed.success) return { ok: false, reason: "INVALID_AI_RESPONSE", message: parsed.error.message };
    return { ok: true, value: parsed.data };
  }
}
