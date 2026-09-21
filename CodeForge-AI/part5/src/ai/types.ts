/**
 * AI is supplemental (Phase 38). It may assist with wording and ambiguous-
 * evidence interpretation. It is NEVER the source of truth for test results,
 * attempt history, mastery evidence, challenge completion, authorization, or
 * database state — all of those are computed deterministically elsewhere and
 * simply passed TO these methods as context, never received FROM them.
 *
 * Every method returns `| null` on any failure (network error, timeout,
 * schema-invalid output) rather than throwing, so callers always have a safe
 * deterministic fallback path (Phase 41) and the engine keeps functioning
 * with AI fully unavailable.
 */
export interface AIProvider {
  readonly name: string;

  generateLearningObjective(ctx: { deterministicObjective: string }): Promise<string | null>;

  interpretAmbiguousEvidence(ctx: {
    skillName: string;
    contradictionExplanation: string;
    recentScores: number[];
  }): Promise<{ interpretation: string; recommendedAction: string } | null>;

  explainFeedback(ctx: { skillName: string; mistakeCategory: string; deterministicExplanation: string }): Promise<string | null>;
}
