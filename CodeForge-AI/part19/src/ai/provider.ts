import { z } from "zod";
import { ClaimSchema, type Claim, type FailureReason } from "../types.js";

// ─────────────────────────────────────────────────────────────────────────
// Every AI call in this engine returns data validated against one of these
// schemas. An LLM response that doesn't parse is treated as a failure
// (INVALID_AI_RESPONSE) and the pipeline falls back to deterministic
// evidence only — it is never rendered to the student unvalidated.
// ─────────────────────────────────────────────────────────────────────────

export const ClaimExtractionResponseSchema = z.object({
  claims: z.array(ClaimSchema),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
});
export type ClaimExtractionResponse = z.infer<typeof ClaimExtractionResponseSchema>;

export const SemanticJudgementResponseSchema = z.object({
  /** Does the student's free-text claim semantically match the target
   *  concept (e.g. a canonical algorithm name), independent of vocabulary? */
  matches: z.boolean(),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  reasoning: z.string().max(400),
});
export type SemanticJudgementResponse = z.infer<typeof SemanticJudgementResponseSchema>;

export const FollowUpPhrasingResponseSchema = z.object({
  question: z.string().min(1).max(300),
});
export type FollowUpPhrasingResponse = z.infer<typeof FollowUpPhrasingResponseSchema>;

export type AIResult<T> = { ok: true; value: T } | { ok: false; reason: FailureReason; message: string };

/**
 * Everything the deterministic pipeline needs from an LLM, and nothing more.
 * The AI layer never sees raw problem answers or is asked to invent
 * evidence — only to interpret free-text meaning. Swap implementations via
 * config; business logic never imports a concrete provider directly.
 */
export interface AIProvider {
  readonly name: string;

  /** Refine/dedupe rule-based claim hints and surface anything the regex
   *  pass plausibly missed. Must not invent claims with no basis in
   *  `reasoningText`. */
  extractClaims(input: { reasoningText: string; ruleBasedHints: Claim[] }): Promise<AIResult<ClaimExtractionResponse>>;

  /** Ask whether a free-text claim semantically matches a target concept
   *  when the deterministic synonym table (patternDetector.normalizeAlgorithmClaim)
   *  didn't confidently resolve it. */
  judgeSemanticMatch(input: { claimText: string; targetConcept: string }): Promise<AIResult<SemanticJudgementResponse>>;

  /** Turn a targeted follow-up question template + concrete evidence into a
   *  natural, specific question. Must not change what is being asked —
   *  only how it reads. */
  phraseFollowUpQuestion(input: { templateType: string; evidenceSummary: string }): Promise<AIResult<FollowUpPhrasingResponse>>;
}

// ─────────────────────────────────────────────────────────────────────────
// MockAIProvider — deterministic, no network, no key required. This is the
// default provider (AI_PROVIDER=mock) so the engine and its full test suite
// run with zero external dependencies. It intentionally does the *minimum*
// useful thing (echo/pass-through) rather than simulating intelligence —
// real semantic interpretation requires a real model; faking it here would
// be exactly the "fake AI response" the spec prohibits.
// ─────────────────────────────────────────────────────────────────────────

export class MockAIProvider implements AIProvider {
  readonly name = "mock";

  async extractClaims(input: { reasoningText: string; ruleBasedHints: Claim[] }): Promise<AIResult<ClaimExtractionResponse>> {
    return { ok: true, value: { claims: input.ruleBasedHints, confidence: "MEDIUM" } };
  }

  async judgeSemanticMatch(input: { claimText: string; targetConcept: string }): Promise<AIResult<SemanticJudgementResponse>> {
    const matches = input.claimText.toLowerCase().includes(input.targetConcept.toLowerCase());
    return {
      ok: true,
      value: { matches, confidence: "LOW", reasoning: "Mock provider: substring match only, no real semantic interpretation performed." },
    };
  }

  async phraseFollowUpQuestion(input: { templateType: string; evidenceSummary: string }): Promise<AIResult<FollowUpPhrasingResponse>> {
    return { ok: true, value: { question: `[${input.templateType}] ${input.evidenceSummary}` } };
  }
}
