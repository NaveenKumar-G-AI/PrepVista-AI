import { ActionGradeResult, BottleneckType, RawTopicEvidence, TopicCapabilityState } from "../types";
import {
  computeConfidence,
  computeMomentum,
  computePersistentErrorPattern,
  computeRegression,
  computeStability
} from "./signals";

/**
 * Section 6: Feature 26 should consume a unified current-state
 * representation rather than re-deriving mastery/retention/transfer itself.
 * This function is the seam - it takes whatever an evidence provider hands
 * back and normalizes it into one TopicCapabilityState, computing the
 * derived signals (confidence, momentum, stability, regression, error
 * pattern) that the rest of the engine reasons over.
 */
export function computeCapabilityState(evidence: RawTopicEvidence): TopicCapabilityState {
  const confidence = computeConfidence(evidence.sampleSize);
  const { momentum, trendNote } = computeMomentum(evidence.recentScores);
  const stability = computeStability(evidence.recentScores);
  const { regressionSuspected, possibleCauses } = computeRegression(evidence.recentScores);
  const { tag: persistentErrorPattern, severity: persistentErrorSeverity } = computePersistentErrorPattern(
    evidence.errorTags
  );

  return {
    topicId: evidence.topicId,
    topicName: evidence.topicName,
    mastery: evidence.mastery,
    retention: evidence.retention,
    transfer: evidence.transfer,
    accuracy: evidence.accuracy,
    speed: evidence.speed,
    consistency: evidence.consistency,
    momentum,
    momentumTrendNote: trendNote,
    stability,
    regressionSuspected,
    regressionPossibleCauses: possibleCauses,
    confidence,
    persistentErrorPattern,
    persistentErrorSeverity,
    goalRelevance: evidence.goalRelevance,
    prerequisiteTopicIds: evidence.prerequisiteTopicIds,
    sampleSize: evidence.sampleSize,
    lastPracticedAt: evidence.lastPracticedAt
  };
}

export function computeAllCapabilityStates(evidenceList: RawTopicEvidence[]): TopicCapabilityState[] {
  return evidenceList.map(computeCapabilityState);
}

function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function smooth(previous: number | null, signal: number, previousWeight: number): number {
  const base = previous ?? signal;
  return clamp100(base * previousWeight + signal * (1 - previousWeight));
}

const ERROR_TAG_BY_BOTTLENECK: Partial<Record<BottleneckType, string>> = {
  CONCEPT_GAP: "concept_error",
  RETENTION_DECAY: "retention_error",
  TRANSFER_GAP: "transfer_error",
  METHOD_ERROR: "method_error",
  SPEED_LIMIT: "speed_error",
  PREREQUISITE_GAP: "concept_error"
};

/**
 * Section: "MEASURE -> UPDATE" in the core loop. Takes what an evidence
 * provider already had for a topic plus the result of one completed
 * action, and returns updated evidence.
 *
 * This is a deliberately simple, transparent smoothing model (documented
 * inline per metric) standing in for PrepVista's real mastery/retention/
 * transfer algorithms, which weren't available to integrate with here
 * (section 4). Swap the body of this function for real calls into those
 * services; nothing else in the engine needs to know it happened.
 */
export function applyEvidenceUpdate(
  evidence: RawTopicEvidence,
  bottleneck: BottleneckType,
  grade: ActionGradeResult
): RawTopicEvidence {
  const accuracyPct = grade.accuracy * 100;
  const next: RawTopicEvidence = { ...evidence };

  switch (bottleneck) {
    case "CONCEPT_GAP":
    case "PREREQUISITE_GAP":
      next.mastery = smooth(evidence.mastery, accuracyPct, 0.4);
      break;
    case "RETENTION_DECAY":
      next.retention = smooth(evidence.retention, accuracyPct, 0.4);
      break;
    case "TRANSFER_GAP":
      next.transfer = smooth(evidence.transfer, accuracyPct, 0.4);
      break;
    case "METHOD_ERROR":
      next.mastery = smooth(evidence.mastery, accuracyPct, 0.5);
      break;
    case "SPEED_LIMIT": {
      // Faster AND correct raises the speed signal; slow-but-correct barely
      // moves it. 45s is treated as a neutral "expected" pace for this MVP.
      const paceSignal = clamp100(100 - (grade.avgResponseTimeSeconds - 15) * 2);
      const speedSignal = accuracyPct * 0.5 + paceSignal * 0.5;
      next.speed = smooth(evidence.speed, speedSignal, 0.4);
      break;
    }
    case "STABLE":
      next.transfer = smooth(evidence.transfer, accuracyPct, 0.6);
      break;
    default:
      break;
  }

  // Accuracy is a general supplementary signal - blend it a little more
  // gently regardless of which specific bottleneck was being worked on.
  next.accuracy = smooth(evidence.accuracy, accuracyPct, 0.6);

  next.recentScores = [...evidence.recentScores, Math.round(accuracyPct)].slice(-10);
  next.sampleSize = evidence.sampleSize + 1;
  next.lastPracticedAt = new Date().toISOString();

  const hadIncorrect = grade.correctCount < grade.totalCount;
  const tag = hadIncorrect ? ERROR_TAG_BY_BOTTLENECK[bottleneck] ?? "concept_error" : "clean";
  next.errorTags = [...evidence.errorTags, tag].slice(-10);

  return next;
}
