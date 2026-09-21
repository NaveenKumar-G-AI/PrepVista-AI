import type { MasteryEvidence, MasteryStateEnum, ConfidenceLevel, DimensionScores } from "../types/index.js";
import { computeConceptScore, computeExecutionScore, computeTimedScore, computeConsistencyScore } from "./dimensionScoring.js";
import { assessTransfer } from "./transferAssessmentService.js";
import { assessRetention } from "./retentionService.js";
import { getMasteryModelConfig } from "../config/masteryModel.js";

export interface MasteryDecisionInput {
  previousState: MasteryStateEnum;
  /** Snapshot captured the moment mastery was last (re)verified - see
   *  buildVerifiedSnapshot(). Used only to detect drop-from-peak, never
   *  read as an absolute target. */
  previousVerifiedSnapshot: Record<string, unknown> | null;
  /** Full evidence history for one student+skill, oldest first. */
  evidence: MasteryEvidence[];
}

export interface MasteryDecision {
  state: MasteryStateEnum;
  confidence: ConfidenceLevel;
  dimensions: DimensionScores;
  rationale: string[];
  evidenceCounts: {
    concept: number;
    execution: number;
    transfer: number;
    novel: number;
    delayed: number;
    consistencyWindow: number;
  };
  regression: { flagged: boolean; kind: "AT_RISK" | "REGRESSED" | null; dropFromSnapshot: number | null };
  retentionRiskDetected: boolean;
  masteryModelVersion: string;
}

function round(n: number | null): number | null {
  return n === null ? null : Math.round(n * 1000) / 1000;
}

function confidenceFromRatio(count: number, minRequired: number): ConfidenceLevel {
  if (minRequired <= 0) return count > 0 ? "MEDIUM" : "LOW";
  const ratio = count / minRequired;
  if (ratio < 1) return "LOW";
  if (ratio < 1.5) return "MEDIUM";
  return "HIGH";
}

/** Weighted combination of whatever dimension scores are actually available,
 *  renormalized over the dimensions present - same "don't invent evidence
 *  for a null dimension" principle used in assessTransfer(). Used both for
 *  the drop-from-peak regression check and for the snapshot stamped onto
 *  mastery_state.verified_snapshot at the moment a skill is (re)verified. */
export function weightedOverallScore(dims: DimensionScores, weights: ReturnType<typeof getMasteryModelConfig>["dimensionWeights"]): number | null {
  const entries: Array<[keyof DimensionScores, number]> = [
    ["conceptScore", weights.concept],
    ["executionScore", weights.execution],
    ["transferScore", weights.transfer],
    ["retentionScore", weights.retention],
    ["timedScore", weights.timed],
    ["consistencyScore", weights.consistency],
  ];
  const available = entries.filter(([key]) => dims[key] !== null) as Array<[keyof DimensionScores, number]>;
  if (available.length === 0) return null;
  const totalWeight = available.reduce((s, [, w]) => s + w, 0);
  return available.reduce((s, [key, w]) => s + (dims[key] as number) * w, 0) / totalWeight;
}

export function buildVerifiedSnapshot(dims: DimensionScores, weights: ReturnType<typeof getMasteryModelConfig>["dimensionWeights"]): Record<string, unknown> {
  return { ...dims, overallScore: weightedOverallScore(dims, weights), capturedAt: new Date().toISOString() };
}

export function decideMasteryState(input: MasteryDecisionInput): MasteryDecision {
  const config = getMasteryModelConfig();
  const rationale: string[] = [];
  const evidence = input.evidence.filter((e) => e.questionExposureState !== "MEMORIZATION_RISK");
  const excludedCount = input.evidence.length - evidence.length;
  if (excludedCount > 0) {
    rationale.push(`Excluded ${excludedCount} attempt(s) flagged MEMORIZATION_RISK (repeated exact question) from evidence.`);
  }

  if (input.evidence.length === 0) {
    return {
      state: "UNKNOWN",
      confidence: "LOW",
      dimensions: { conceptScore: null, executionScore: null, transferScore: null, retentionScore: null, timedScore: null, consistencyScore: null },
      rationale: ["No evidence recorded yet for this skill."],
      evidenceCounts: { concept: 0, execution: 0, transfer: 0, novel: 0, delayed: 0, consistencyWindow: 0 },
      regression: { flagged: false, kind: null, dropFromSnapshot: null },
      retentionRiskDetected: false,
      masteryModelVersion: config.version,
    };
  }

  const concept = computeConceptScore(evidence);
  const execution = computeExecutionScore(evidence);
  const timed = computeTimedScore(evidence);
  const consistency = computeConsistencyScore(evidence);
  const transfer = assessTransfer(evidence);
  const retention = assessRetention(evidence);

  const dims: DimensionScores = {
    conceptScore: round(concept.score),
    executionScore: round(execution.score),
    transferScore: round(transfer.transferScore),
    retentionScore: round(retention.retentionScore),
    timedScore: round(timed.score),
    consistencyScore: round(consistency.score),
  };

  if (concept.count > 0) rationale.push(`Concept score ${dims.conceptScore} from ${concept.count} practice/assessment attempt(s).`);
  if (execution.count > 0) rationale.push(`Execution score ${dims.executionScore} from ${execution.count} familiar/slightly-variant attempt(s).`);
  if (transfer.transferScore !== null) {
    rationale.push(
      `Transfer score ${round(transfer.transferScore)} (direct=${round(transfer.tierScores.direct)}, variation=${round(transfer.tierScores.variation)}, novel=${round(transfer.tierScores.novel)}), ${transfer.novelEvidenceCount} novel-tier attempt(s).`
    );
  }
  if (retention.retentionScore !== null) {
    rationale.push(`Retention score ${round(retention.retentionScore)} from ${retention.delayedEvidenceCount} delayed attempt(s).`);
  }
  if (timed.score !== null) rationale.push(`Timed score ${round(timed.score)} from ${timed.count} timed attempt(s).`);
  if (consistency.score !== null) rationale.push(`Consistency score ${round(consistency.score)} (stddev ${consistency.stdDev?.toFixed(3)}) over last ${consistency.count} verification-style attempt(s).`);

  // ---------- Forward state machine (never skips a stage) ----------
  let state: MasteryStateEnum;
  let confidence: ConfidenceLevel;

  if (concept.count === 0) {
    state = "INTRODUCED";
    confidence = "LOW";
    rationale.push("No practice/assessment evidence yet - skill is introduced but not yet attempted.");
  } else if (concept.count < config.thresholds.provisional.minPracticeEvidence) {
    state = "LEARNING";
    confidence = confidenceFromRatio(concept.count, config.thresholds.provisional.minPracticeEvidence);
    rationale.push(`Only ${concept.count}/${config.thresholds.provisional.minPracticeEvidence} practice attempts recorded - too early to assess a trend.`);
  } else {
    const half = Math.max(1, Math.floor(concept.count / 2));
    const relevantConceptEvidence = evidence.filter((e) => e.evidenceType === "PRACTICE" || e.evidenceType === "ASSESSMENT");
    const earlyMean = relevantConceptEvidence.slice(0, half).reduce((s, e) => s + e.score, 0) / half;
    const recentMean = relevantConceptEvidence.slice(-half).reduce((s, e) => s + e.score, 0) / half;
    const trend = recentMean - earlyMean;

    const meetsProvisional =
      (dims.conceptScore ?? 0) >= config.thresholds.provisional.conceptMin &&
      execution.count > 0 &&
      (dims.executionScore ?? 0) >= config.thresholds.provisional.executionMin;

    if (!meetsProvisional) {
      if (trend > config.thresholds.learningToImproving.trendMin) {
        state = "IMPROVING";
        rationale.push(`Recent attempts trending up (+${round(trend)}) but not yet past the provisional-mastery bar.`);
      } else {
        state = "PRACTICING";
        rationale.push("Concept/execution not yet consistently above the provisional-mastery bar.");
      }
      confidence = confidenceFromRatio(concept.count, config.thresholds.provisional.minPracticeEvidence);
    } else {
      rationale.push("Concept and execution both above the provisional-mastery bar - checking transfer evidence for VERIFIED.");
      const meetsVerified =
        transfer.transferScore !== null &&
        transfer.novelEvidenceCount >= config.thresholds.verified.minTransferEvidence &&
        transfer.transferScore >= config.thresholds.verified.transferMin;

      if (!meetsVerified) {
        state = "PROVISIONALLY_MASTERED";
        confidence = confidenceFromRatio(concept.count, config.thresholds.provisional.minPracticeEvidence * 1.5);
        if (transfer.novelEvidenceCount < config.thresholds.verified.minTransferEvidence) {
          rationale.push(
            `Strong practice performance - mastery verification pending (${transfer.novelEvidenceCount}/${config.thresholds.verified.minTransferEvidence} novel-tier attempts collected).`
          );
        } else {
          rationale.push(`Novel-tier transfer accuracy (${round(transfer.transferScore)}) is below the verified bar (${config.thresholds.verified.transferMin}).`);
        }
      } else {
        rationale.push("Transfer evidence sufficient - checking consistency and retention for STABLE.");
        const meetsStable =
          consistency.score !== null &&
          consistency.count >= config.thresholds.stable.minVerificationAttempts &&
          consistency.score >= config.thresholds.stable.consistencyMin &&
          retention.retentionScore !== null &&
          retention.delayedEvidenceCount >= config.thresholds.stable.minDelayedEvidence &&
          retention.retentionScore >= config.thresholds.stable.retentionMin;

        if (!meetsStable) {
          state = "VERIFIED_MASTERED";
          confidence = confidenceFromRatio(transfer.novelEvidenceCount, config.thresholds.verified.minTransferEvidence * 1.5);
          rationale.push("Mastery verified through transfer evidence. Stability/retention evidence still accumulating for STABLE.");
        } else {
          state = "STABLE_MASTERED";
          confidence = confidenceFromRatio(
            Math.min(consistency.count, retention.delayedEvidenceCount),
            Math.min(config.thresholds.stable.minVerificationAttempts, config.thresholds.stable.minDelayedEvidence)
          );
          rationale.push("Consistent across independent attempts and confirmed via delayed verification - mastery is stable.");
        }
      }
    }
  }

  // ---------- Regression overlay ----------
  let regression: MasteryDecision["regression"] = { flagged: false, kind: null, dropFromSnapshot: null };
  const cameFromVerified = input.previousState === "VERIFIED_MASTERED" || input.previousState === "STABLE_MASTERED";

  if (cameFromVerified && input.previousVerifiedSnapshot && typeof input.previousVerifiedSnapshot.overallScore === "number") {
    const currentOverall = weightedOverallScore(dims, config.dimensionWeights);
    if (currentOverall !== null) {
      const drop = (input.previousVerifiedSnapshot.overallScore as number) - currentOverall;
      if (drop >= config.thresholds.regressed.dropFromSnapshot) {
        state = "REGRESSED";
        confidence = "HIGH";
        regression = { flagged: true, kind: "REGRESSED", dropFromSnapshot: round(drop) as number };
        rationale.push(`Overall performance dropped ${round(drop)} from the last verified snapshot - flagged REGRESSED, not just naturally recomputed.`);
      } else if (drop >= config.thresholds.atRisk.dropFromSnapshot) {
        state = "AT_RISK";
        confidence = "MEDIUM";
        regression = { flagged: true, kind: "AT_RISK", dropFromSnapshot: round(drop) as number };
        rationale.push(`Overall performance dropped ${round(drop)} from the last verified snapshot - flagged AT_RISK.`);
      }
    }
  }

  return {
    state,
    confidence: confidence!,
    dimensions: dims,
    rationale,
    evidenceCounts: {
      concept: concept.count,
      execution: execution.count,
      transfer: transfer.totalTransferEvidenceCount,
      novel: transfer.novelEvidenceCount,
      delayed: retention.delayedEvidenceCount,
      consistencyWindow: consistency.count,
    },
    regression,
    retentionRiskDetected: retention.retentionRiskDetected,
    masteryModelVersion: config.version,
  };
}
