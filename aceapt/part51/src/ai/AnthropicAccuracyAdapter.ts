import { z } from "zod";
import { isAiConfigured, getAnthropicConfig } from "../config/env.js";
import type { ErrorType, InterventionType } from "../types/errorTaxonomy.js";
import { ERROR_FEEDBACK_TEMPLATES, whyThisFocusMessage, trainingResultSummary } from "./promptTemplates.js";

/**
 * §99 — AI output contract. Deliberately narrow: the AI is trusted for
 * `message` (wording) ONLY. §100/§98: correctness, scores, accuracy,
 * intervention selection, and difficulty are ALWAYS decided by
 * src/domain + src/policy before this adapter is even called — this module
 * cannot change any of them, only phrase them. If the model's JSON echoes
 * back an intervention_type or a number, this code ignores those fields;
 * they are not part of the schema and are never parsed into anything used
 * downstream.
 */
const AiExplanationSchema = z.object({
  message: z.string().min(1).max(600)
});

export type ExplanationKind = "error_feedback" | "why_this_focus" | "training_result";

export interface ExplanationRequest {
  kind: ExplanationKind;
  errorType?: ErrorType | null;
  interventionType?: InterventionType | null;
  recurrenceNote?: string;
  beforePct?: number | null;
  afterPct?: number | null;
  independentVerificationPassed?: boolean | null;
}

export interface ExplanationResult {
  message: string;
  source: "ai" | "fallback";
}

const SYSTEM_PROMPT = `You write short explanation copy for ACEAPT's Accuracy Training Engine, a placement-exam aptitude coach.
Rules you must follow exactly:
- Never say "wrong" or "incorrect" bluntly — describe the observable issue instead (e.g. "the setup was right, the arithmetic changed the result").
- Never invent praise, motivation, or an accuracy number that wasn't given to you in the request.
- Never call a student "careless" or label them — describe behavior, not character.
- Keep it to 1-3 short sentences.
- Reply with ONLY a JSON object of the exact shape {"message": "..."} — no markdown fences, no other keys, no preamble or explanation outside the JSON.`;

/**
 * Fetch is injectable for tests (§130/§131 exercise this without a real key
 * or network call). Defaults to the platform global.
 */
export interface ExplainDeps {
  fetchImpl?: typeof fetch;
}

export async function explain(request: ExplanationRequest, deps: ExplainDeps = {}): Promise<ExplanationResult> {
  if (!isAiConfigured()) {
    return { message: fallbackMessage(request), source: "fallback" };
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const { apiKey, model } = getAnthropicConfig();

  try {
    const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserPrompt(request) }]
      })
    });

    if (!res.ok) {
      return { message: fallbackMessage(request), source: "fallback" }; // §130 AI unavailable
    }

    const data = (await res.json()) as unknown;
    const text = extractText(data);
    const jsonText = extractJsonObject(text);
    const candidate = jsonText ? safeJsonParse(jsonText) : null;
    const parsed = AiExplanationSchema.safeParse(candidate);

    if (!parsed.success) {
      return { message: fallbackMessage(request), source: "fallback" }; // §131 malformed AI output
    }
    return { message: parsed.data.message, source: "ai" };
  } catch {
    return { message: fallbackMessage(request), source: "fallback" }; // §130 AI unavailable (network/timeout/etc.)
  }
}

function fallbackMessage(request: ExplanationRequest): string {
  switch (request.kind) {
    case "error_feedback":
      return request.errorType
        ? ERROR_FEEDBACK_TEMPLATES[request.errorType]
        : ERROR_FEEDBACK_TEMPLATES.UNKNOWN;
    case "why_this_focus":
      return request.errorType
        ? whyThisFocusMessage(request.errorType, request.recurrenceNote)
        : "Continuing precision practice at the current focus.";
    case "training_result":
      return trainingResultSummary({
        interventionType: request.interventionType ?? null,
        beforePct: request.beforePct ?? null,
        afterPct: request.afterPct ?? null,
        independentVerificationPassed: request.independentVerificationPassed ?? null
      });
  }
}

function buildUserPrompt(request: ExplanationRequest): string {
  return JSON.stringify({
    instructions: `Write the "${request.kind}" explanation described in the system prompt, using only the facts below. Do not add facts not present here.`,
    facts: request
  });
}

function extractText(data: unknown): string {
  if (
    typeof data === "object" &&
    data !== null &&
    "content" in data &&
    Array.isArray((data as { content: unknown }).content)
  ) {
    return (data as { content: Array<{ type: string; text?: string }> }).content
      .map((block) => (block.type === "text" ? (block.text ?? "") : ""))
      .join("");
  }
  return "";
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  return text.slice(start, end + 1);
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
