import { randomUUID } from "node:crypto";
import type {
  ConfidenceLevel,
  DimensionScore,
  DimensionStatus,
  Evidence,
  ReadinessContributor,
  ReadinessGap,
  ReadinessSnapshot,
  ReadinessState,
  SimulationRecord,
} from "../domain/types.js";
import { computeConfidence } from "./confidenceEngine.js";
import { computeDimensions, type ConceptMasteryHint } from "./dimensionScoring.js";
import { confidenceWeightMultiplier } from "./scoringHelpers.js";

export interface PreviousSnapshotDimensions {
  snapshotId: string;
  dimensions: DimensionScore[];
}

export interface ComputeReadinessInput {
  studentId: string;
  profileId: string | null;
  simulations: SimulationRecord[];
  conceptMasteryHint: ConceptMasteryHint | null;
  previousSnapshot: PreviousSnapshotDimensions | null;
  /** Defaults to real now. Overridable so historical snapshots (tests, seed
   * backfill) compute recency/decay relative to the moment they represent,
   * not the moment the script happens to run. */
  asOf?: Date;
}

/**
 * Section 19 gap-map status. A dimension can only be READY when both the
 * score clears the bar AND confidence isn't LOW — an unmeasured dimension
 * with a coincidentally-decent default score must never present as ready
 * (this is the dimension-level version of Section 2's "never READY merely
 * because a score exceeds a threshold").
 */
function deriveDimensionStatus(score: number, confidence: ConfidenceLevel): DimensionStatus {
  if (score >= 75 && confidence !== "LOW") return "READY";
  if (score < 50) return "HIGH_RISK";
  return "DEVELOPING";
}

function gapDescription(dimensionKey: string, status: DimensionStatus, evidenceSummary: string): string | null {
  if (status === "READY") return null;
  const label = dimensionKey.replace(/_/g, " ");
  const prefix = status === "HIGH_RISK" ? "High risk" : "Developing";
  return `${prefix}: ${label}. ${evidenceSummary}`;
}

/**
 * Section 36's six-tier certification. Deliberately evaluated strongest-first
 * so criteria stay monotonic and easy to audit — each tier requires strictly
 * more evidence AND a higher score AND (from CONDITIONALLY_READY up) at
 * least MEDIUM confidence than the one below it. `evidenceCount` here is
 * realistic-simulation submissions specifically, not all practice.
 */
function deriveOverallState(overallScore: number, evidenceCount: number, confidence: ConfidenceLevel): ReadinessState {
  if (evidenceCount === 0) return "INSUFFICIENT_EVIDENCE";
  if (evidenceCount === 1) return "EARLY_EVIDENCE";
  if (evidenceCount >= 4 && overallScore >= 85 && confidence === "HIGH") return "STRONGLY_READY";
  if (evidenceCount >= 3 && overallScore >= 75 && confidence !== "LOW") return "CONDITIONALLY_READY";
  if (evidenceCount >= 2 && overallScore >= 60 && confidence !== "LOW") return "NEAR_READY";
  return "DEVELOPING";
}

export function computeReadinessSnapshot(input: ComputeReadinessInput): ReadinessSnapshot {
  const { studentId, profileId, simulations, conceptMasteryHint, previousSnapshot } = input;
  const asOf = input.asOf ?? new Date();

  const { dimensions: rawDimensions, overallConfidenceInputs, realisticSimulationCount } = computeDimensions(
    simulations,
    conceptMasteryHint,
    asOf
  );

  const dimensionScores: DimensionScore[] = [];
  const gaps: ReadinessGap[] = [];
  const evidence: Evidence[] = [];

  let weightedScoreSum = 0;
  let weightSum = 0;

  for (const dim of rawDimensions) {
    const confidence = computeConfidence(dim.confidenceInputs);
    const status = deriveDimensionStatus(dim.score, confidence.level);

    dimensionScores.push({
      dimensionKey: dim.dimensionKey,
      score: dim.score,
      status,
      confidence: confidence.level,
      evidenceSummary: dim.evidenceSummary,
    });

    const weight = confidenceWeightMultiplier(confidence.level);
    weightedScoreSum += dim.score * weight;
    weightSum += weight;

    const description = gapDescription(dim.dimensionKey, status, dim.evidenceSummary);
    const dimEvidenceIds: string[] = [];
    for (const e of dim.evidence) {
      const id = randomUUID();
      dimEvidenceIds.push(id);
      evidence.push({ id, dimensionKey: dim.dimensionKey, confidence: confidence.level, ...e });
    }
    if (description && status !== "READY") {
      gaps.push({
        dimensionKey: dim.dimensionKey,
        severity: status === "HIGH_RISK" ? "HIGH_RISK" : "DEVELOPING",
        description,
        evidenceIds: dimEvidenceIds,
      });
    }
  }

  // Sort gaps worst-first so "what's holding the student back" (Section 34)
  // is trivial for the API/UI layer to present without re-deriving order.
  gaps.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "HIGH_RISK" ? -1 : 1));

  const overallScore = weightSum > 0 ? Math.round((weightedScoreSum / weightSum) * 10) / 10 : 0;
  const overallConfidence = computeConfidence(overallConfidenceInputs);
  const overallState = deriveOverallState(overallScore, realisticSimulationCount, overallConfidence.level);

  const contributors: ReadinessContributor[] = [];
  if (previousSnapshot) {
    const prevByKey = new Map(previousSnapshot.dimensions.map((d) => [d.dimensionKey, d.score]));
    for (const d of dimensionScores) {
      const prevScore = prevByKey.get(d.dimensionKey);
      if (prevScore === undefined) continue;
      const delta = Math.round((d.score - prevScore) * 10) / 10;
      if (Math.abs(delta) >= 1) {
        contributors.push({ dimensionKey: d.dimensionKey, delta, direction: delta >= 0 ? "up" : "down" });
      }
    }
    contributors.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }

  const simulationIds = simulations.filter((s) => s.status === "submitted").map((s) => s.id);

  return {
    id: randomUUID(),
    studentId,
    profileId,
    previousSnapshotId: previousSnapshot?.snapshotId ?? null,
    createdAt: asOf.toISOString(),
    overallScore,
    overallState,
    confidence: overallConfidence,
    evidenceCount: realisticSimulationCount,
    simulationIds,
    dimensions: dimensionScores,
    gaps,
    evidence,
    contributors,
  };
}
