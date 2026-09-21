/**
 * Recommendation Engine.
 *
 * Recommendations are generated from ACTUAL gaps (never generic filler).
 * Common gap shapes get a curated, dimension-specific template so a
 * response is instant and doesn't depend on AI availability; anything that
 * doesn't match a template falls back to a grounded AI call using the
 * specific gap text, per the spec's worked examples for invariant/transfer/
 * complexity gaps.
 */
import type { ProviderChain } from "@/ai/provider.js";
import { RecommendationSchema } from "@/ai/schemas.js";
import { buildRecommendationPrompt } from "@/ai/prompts.js";
import { structuredCall } from "@/ai/structuredCall.js";
import type { DimensionProfile, Recommendation, UnderstandingDimension } from "@/types/index.js";

const DIMENSION_TEMPLATES: Partial<Record<UnderstandingDimension, string>> = {
  invariant: "Practice identifying what remains true after each state transition, and explain why it stays true.",
  transfer: "Practice applying the same algorithmic pattern to a problem with a different surface structure.",
  complexity: "Practice deriving complexity from the actual operations performed, rather than recalling a memorized label.",
  state: "Trace the important variables by hand across a small example, writing down when and why each one changes.",
  debugging: "Given a small deliberate bug, practice tracing from the observed failure back to the exact state/invariant it violates.",
  edge_case: "Before running the code, write down what you expect for empty, single-element, and boundary inputs — then check.",
  correctness: "Practice writing a short argument for why the algorithm covers every case, not just why the tests pass.",
  adaptation: "Practice restating how the solution would need to change if one requirement changed, before touching the code.",
  control_flow: "Practice tracing which branch executes and why, for a few concrete inputs, before running the code.",
};

export async function generateRecommendation(
  dimension: UnderstandingDimension,
  gap: string,
  chain: ProviderChain
): Promise<Recommendation> {
  const template = DIMENSION_TEMPLATES[dimension];
  if (template) {
    return { dimension, gap, recommendation: template };
  }

  const { systemPrompt, userContent } = buildRecommendationPrompt(dimension, gap);
  const outcome = await structuredCall({ chain, schema: RecommendationSchema, systemPrompt, userContent });

  if (outcome.ok) {
    return { dimension, gap, recommendation: outcome.data.recommendation };
  }

  // Safe, honest fallback — never invented as if it were specific advice.
  return {
    dimension,
    gap,
    recommendation: `Revisit this concept with a small worked example and focus specifically on: ${gap}`,
  };
}

export async function generateRecommendationsForProfile(
  dimensions: Record<UnderstandingDimension, DimensionProfile>,
  chain: ProviderChain
): Promise<Recommendation[]> {
  const targets = Object.values(dimensions).filter(
    (d) => d.identified_gaps.length > 0 && (d.status === "gap_identified" || d.status === "developing")
  );

  const recommendations = await Promise.all(
    targets.map((d) => generateRecommendation(d.dimension, d.identified_gaps[0] ?? "general understanding", chain))
  );
  return recommendations;
}
