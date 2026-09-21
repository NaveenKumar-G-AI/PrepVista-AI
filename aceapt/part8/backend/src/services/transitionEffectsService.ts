import type { MasteryStateEnum, StructuredSignal } from "../types/index.js";
import type { MasteryDecision } from "./masteryDecisionService.js";

export interface TransitionEffect {
  historyEventType: string;
  historyDescription: string;
}

const STATE_DESCRIPTIONS: Record<MasteryStateEnum, string> = {
  UNKNOWN: "No evidence recorded yet.",
  INTRODUCED: "Skill introduced.",
  LEARNING: "Started learning this skill.",
  PRACTICING: "Practicing - building toward consistent performance.",
  IMPROVING: "Practice performance trending upward.",
  PROVISIONALLY_MASTERED: "Strong practice performance - mastery verification pending.",
  VERIFIED_MASTERED: "Mastery verified through transfer evidence.",
  STABLE_MASTERED: "Mastery confirmed stable through consistency and delayed retention evidence.",
  AT_RISK: "Performance has dropped from the last verified level - flagged at risk.",
  REGRESSED: "Skill has regressed from its previously verified level.",
};

/** Only fires a history event when the state actually changed - a recompute
 *  that lands on the same state every evidence submission would otherwise
 *  flood the timeline (spec section 38 wants a meaningful journey, not a log
 *  of every attempt). */
export function buildTransitionHistoryEffect(previousState: MasteryStateEnum, decision: MasteryDecision): TransitionEffect | null {
  if (previousState === decision.state) return null;
  return {
    historyEventType: decision.state,
    historyDescription: STATE_DESCRIPTIONS[decision.state],
  };
}

/**
 * Structured signals for Features 3/4/6/7 (spec sections 32-36). Feature 8
 * never decides what intervention to take - it only reports evidence-backed
 * facts. The payload shape matches the spec's own example in section 32.
 */
export function buildTransitionSignals(
  previousState: MasteryStateEnum,
  decision: MasteryDecision,
  ctx: { studentId: string; skillId: string }
): Array<{ targetFeature: string; signal: StructuredSignal }> {
  const out: Array<{ targetFeature: string; signal: StructuredSignal }> = [];
  const confidenceNumeric = decision.confidence === "HIGH" ? 0.9 : decision.confidence === "MEDIUM" ? 0.65 : 0.4;
  const changed = previousState !== decision.state;

  if (changed && (decision.state === "VERIFIED_MASTERED" || decision.state === "STABLE_MASTERED")) {
    out.push({
      targetFeature: "FEATURE_4",
      signal: {
        studentId: ctx.studentId,
        skillId: ctx.skillId,
        signal: "SKILL_MASTERY_UPDATED",
        severity: "LOW",
        confidence: confidenceNumeric,
        evidence: { newState: decision.state, dimensions: decision.dimensions },
      },
    });
    out.push({
      targetFeature: "FEATURE_3",
      signal: {
        studentId: ctx.studentId,
        skillId: ctx.skillId,
        signal: "MASTERY_EVIDENCE_UPDATE",
        severity: "LOW",
        confidence: confidenceNumeric,
        evidence: { state: decision.state, dimensions: decision.dimensions, evidenceCounts: decision.evidenceCounts },
      },
    });
  }

  if (decision.regression.flagged && decision.regression.kind === "AT_RISK") {
    out.push({
      targetFeature: "FEATURE_7",
      signal: {
        studentId: ctx.studentId,
        skillId: ctx.skillId,
        signal: "PERFORMANCE_REGRESSION",
        severity: "MEDIUM",
        confidence: confidenceNumeric,
        evidence: { dropFromSnapshot: decision.regression.dropFromSnapshot, dimensions: decision.dimensions },
      },
    });
  }

  if (decision.regression.flagged && decision.regression.kind === "REGRESSED") {
    out.push({
      targetFeature: "FEATURE_7",
      signal: {
        studentId: ctx.studentId,
        skillId: ctx.skillId,
        signal: "PERFORMANCE_REGRESSION",
        severity: "HIGH",
        confidence: confidenceNumeric,
        evidence: { dropFromSnapshot: decision.regression.dropFromSnapshot, dimensions: decision.dimensions },
      },
    });
    out.push({
      targetFeature: "FEATURE_4",
      signal: {
        studentId: ctx.studentId,
        skillId: ctx.skillId,
        signal: "SKILL_REGRESSED",
        severity: "HIGH",
        confidence: confidenceNumeric,
        evidence: { dropFromSnapshot: decision.regression.dropFromSnapshot },
      },
    });
  }

  if (decision.retentionRiskDetected) {
    out.push({
      targetFeature: "FEATURE_7",
      signal: {
        studentId: ctx.studentId,
        skillId: ctx.skillId,
        signal: "RETENTION_RISK",
        severity: "LOW",
        confidence: confidenceNumeric,
        evidence: { retentionScore: decision.dimensions.retentionScore },
      },
    });
  }

  return out;
}
