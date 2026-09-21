import { CandidateAction, PriorityBreakdownTerm, TopicCapabilityState } from "../types";
import {
  CONFIDENCE_WEIGHT,
  EV_PER_MINUTE_CEILING,
  MOMENTUM_URGENCY,
  PRIORITY_WEIGHTS
} from "./constants";

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Section 13/14: "expected capability improvement per unit of student
 * time," combined with severity, goal relevance, evidence confidence,
 * momentum, and retention-decay urgency - each one a named, weighted term
 * so the score is explainable rather than an arbitrary number.
 *
 * `state` must be the capability state for the topic the action actually
 * targets (for a PREREQUISITE_GAP redirect, that's the prerequisite's own
 * state, since that's the topic being worked on).
 */
export function scoreCandidate(candidate: CandidateAction, state: TopicCapabilityState): CandidateAction {
  const evNorm = clamp01(candidate.expectedValuePerMinute / EV_PER_MINUTE_CEILING);
  const severity = clamp01(candidate.severity);
  const goalRelevance = clamp01(state.goalRelevance);
  const confidenceWeight = CONFIDENCE_WEIGHT[state.confidence] ?? 0.5;
  const momentumUrgency = MOMENTUM_URGENCY[state.momentum] ?? 0.5;
  const retentionRisk = candidate.bottleneck === "RETENTION_DECAY" ? severity : 0;

  const terms: PriorityBreakdownTerm[] = [
    {
      factor: "Expected value per minute",
      rawValue: candidate.expectedValuePerMinute,
      weight: PRIORITY_WEIGHTS.expectedValuePerMinute,
      contribution: PRIORITY_WEIGHTS.expectedValuePerMinute * evNorm,
      note: `${Math.round(candidate.expectedImpact * 100)}% expected impact over ${candidate.estimatedMinutes} min`
    },
    {
      factor: "Severity",
      rawValue: severity,
      weight: PRIORITY_WEIGHTS.severity,
      contribution: PRIORITY_WEIGHTS.severity * severity,
      note: "How far this metric is from an acceptable level"
    },
    {
      factor: "Goal relevance",
      rawValue: goalRelevance,
      weight: PRIORITY_WEIGHTS.goalRelevance,
      contribution: PRIORITY_WEIGHTS.goalRelevance * goalRelevance,
      note: "How relevant this topic is to the student's current goal"
    },
    {
      factor: "Evidence confidence",
      rawValue: confidenceWeight,
      weight: PRIORITY_WEIGHTS.confidence,
      contribution: PRIORITY_WEIGHTS.confidence * confidenceWeight,
      note: `${state.confidence} confidence (${state.sampleSize} attempt(s) on record)`
    },
    {
      factor: "Momentum urgency",
      rawValue: momentumUrgency,
      weight: PRIORITY_WEIGHTS.momentumUrgency,
      contribution: PRIORITY_WEIGHTS.momentumUrgency * momentumUrgency,
      note: `Recent trend: ${state.momentum.toLowerCase()}`
    },
    {
      factor: "Retention risk",
      rawValue: retentionRisk,
      weight: PRIORITY_WEIGHTS.retentionRisk,
      contribution: PRIORITY_WEIGHTS.retentionRisk * retentionRisk,
      note:
        candidate.bottleneck === "RETENTION_DECAY"
          ? "Forgetting compounds the longer it's left"
          : "Not a retention-decay bottleneck"
    }
  ];

  const priorityScore = terms.reduce((sum, t) => sum + t.contribution, 0);

  return {
    ...candidate,
    priorityScore: clamp01(priorityScore),
    priorityBreakdown: terms
  };
}

/**
 * Scores, sorts, and de-duplicates by topic. A topic can produce more than
 * one candidate in edge cases (e.g. it's both someone's weak prerequisite
 * AND has its own independent diagnosis) - only its single highest-value
 * action is worth recommending in one cycle.
 */
export function rankCandidates(
  candidates: CandidateAction[],
  statesByTopicId: Map<string, TopicCapabilityState>
): CandidateAction[] {
  const scored = candidates
    .map((c) => {
      const state = statesByTopicId.get(c.topicId);
      if (!state) return null;
      return scoreCandidate(c, state);
    })
    .filter((c): c is CandidateAction => Boolean(c))
    .sort((a, b) => b.priorityScore - a.priorityScore);

  const seenTopics = new Set<string>();
  const deduped: CandidateAction[] = [];
  for (const candidate of scored) {
    if (seenTopics.has(candidate.topicId)) continue;
    seenTopics.add(candidate.topicId);
    deduped.push(candidate);
  }
  return deduped;
}
