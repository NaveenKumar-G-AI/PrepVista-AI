import type { Claim, ClaimVerification, ReasoningScore, DimensionScore, VerificationStatus } from "../types.js";

/**
 * Centralized scoring configuration. The spec is explicit: "Do not
 * hard-code scoring logic throughout the application. Create a centralized
 * scoring configuration." Everything tunable lives here — change weights
 * or add a dimension in one place, not by hunting through verifiers.
 */
export interface ScoringConfig {
  dimensions: Array<{ name: string; claimTypes: Claim["claimType"][]; weight: number }>;
  statusValue: Record<VerificationStatus, number>; // 0-1 contribution per status
  importanceWeight: Record<Claim["importance"], number>;
  band: { strong: number; solid: number; partial: number }; // overall-score thresholds
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  dimensions: [
    { name: "Problem Understanding", claimTypes: ["PROBLEM_UNDERSTANDING"], weight: 1 },
    { name: "Algorithm Understanding", claimTypes: ["ALGORITHM", "INVARIANT"], weight: 1 },
    { name: "Implementation Understanding", claimTypes: ["DATA_STRUCTURE", "IMPLEMENTATION_DECISION", "CONTROL_FLOW"], weight: 1 },
    { name: "Correctness Reasoning", claimTypes: ["CORRECTNESS", "BEHAVIOR"], weight: 1 },
    { name: "Complexity Understanding", claimTypes: ["COMPLEXITY", "SPACE_COMPLEXITY"], weight: 1 },
    { name: "Edge-Case Understanding", claimTypes: ["EDGE_CASE"], weight: 1 },
  ],
  statusValue: { SUPPORTED: 1, PARTIALLY_SUPPORTED: 0.55, CONTRADICTED: 0, UNVERIFIED: 0.5 },
  importanceWeight: { CORE: 3, IMPORTANT: 2, SUPPORTING: 1, INCIDENTAL: 0.5 },
  band: { strong: 80, solid: 60, partial: 40 },
};

function dimensionScore(
  dimensionName: string,
  claimTypes: Claim["claimType"][],
  claims: Claim[],
  verifications: Map<string, ClaimVerification>,
  config: ScoringConfig
): DimensionScore | null {
  const relevant = claims.filter((c) => claimTypes.includes(c.claimType));
  if (relevant.length === 0) return null;

  let weightedSum = 0;
  let weightTotal = 0;
  const notes: string[] = [];

  for (const claim of relevant) {
    const v = verifications.get(claim.claimId);
    if (!v) continue;
    const w = config.importanceWeight[claim.importance];
    weightedSum += w * config.statusValue[v.status];
    weightTotal += w;
    if (v.status === "CONTRADICTED" && claim.importance !== "INCIDENTAL") {
      notes.push(v.explanation);
    }
  }

  if (weightTotal === 0) return null;
  const score = Math.round((weightedSum / weightTotal) * 100);
  const reason = notes.length > 0 ? notes[0]! : `Based on ${relevant.length} claim(s) in this dimension.`;
  return { dimension: dimensionName, score, reason };
}

export interface ScoreInput {
  claims: Claim[];
  verifications: ClaimVerification[];
  aiAssisted: boolean;
  config?: ScoringConfig;
}

/**
 * Score determinism: for identical claims + verifications + config, this
 * always returns the identical score — it does no AI calls and no
 * randomness. (Covered by scorer.test.ts.)
 */
export function computeScore(input: ScoreInput): ReasoningScore {
  const config = input.config ?? DEFAULT_SCORING_CONFIG;
  const vMap = new Map(input.verifications.map((v) => [v.claimId, v]));

  const dimensions: DimensionScore[] = [];
  for (const dim of config.dimensions) {
    const d = dimensionScore(dim.name, dim.claimTypes, input.claims, vMap, config);
    if (d) dimensions.push(d);
  }

  let overall = 0;
  if (dimensions.length > 0) {
    // Re-weight each dimension by its configured weight, not just an
    // unweighted mean, so a dimension marked weight:2 counts double.
    let sum = 0;
    let weightTotal = 0;
    for (const dim of dimensions) {
      const cfgWeight = config.dimensions.find((c) => c.name === dim.dimension)?.weight ?? 1;
      sum += dim.score * cfgWeight;
      weightTotal += cfgWeight;
    }
    overall = Math.round(sum / weightTotal);
  }

  const band: ReasoningScore["band"] =
    overall >= config.band.strong ? "STRONG UNDERSTANDING" : overall >= config.band.solid ? "SOLID UNDERSTANDING" : overall >= config.band.partial ? "PARTIAL UNDERSTANDING" : "WEAK UNDERSTANDING";

  const unverifiedRatio = input.verifications.length === 0 ? 1 : input.verifications.filter((v) => v.status === "UNVERIFIED").length / input.verifications.length;
  const confidence: ReasoningScore["confidence"] = !input.aiAssisted || unverifiedRatio > 0.5 ? "Low" : unverifiedRatio > 0.25 ? "Medium" : "High";

  return { overall, band, dimensions, confidence };
}
