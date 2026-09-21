import { ActionType, CandidateAction, Diagnosis } from "../types";
import { ACTION_BASE, SEVERITY_IMPACT_WEIGHT } from "./constants";

function impact(base: number, severity: number): number {
  return Math.min(1, base + SEVERITY_IMPACT_WEIGHT * severity);
}

function makeCandidate(args: {
  topicId: string;
  topicName: string;
  actionType: ActionType;
  bottleneck: Diagnosis["bottleneck"];
  severity: number;
  minutes: number;
  expectedImpact: number;
  rationale: string[];
}): CandidateAction {
  const evPerMinute = args.expectedImpact / args.minutes;
  return {
    id: `${args.topicId}::${args.actionType}`,
    topicId: args.topicId,
    topicName: args.topicName,
    actionType: args.actionType,
    bottleneck: args.bottleneck,
    severity: args.severity,
    estimatedMinutes: args.minutes,
    expectedImpact: args.expectedImpact,
    expectedValuePerMinute: evPerMinute,
    priorityScore: 0, // filled in by the priority engine
    priorityBreakdown: [],
    rationale: args.rationale
  };
}

/**
 * Section 15: use the smallest intervention likely to address the
 * bottleneck - not a full lesson when three minutes will do. Returns null
 * for STABLE topics (section 19: don't keep testing what's already solid;
 * the plan generator redirects that time elsewhere).
 */
export function buildCandidateAction(diagnosis: Diagnosis): CandidateAction | null {
  const { topicId, topicName, severity } = diagnosis;

  switch (diagnosis.bottleneck) {
    case "LOW_EVIDENCE":
      return makeCandidate({
        topicId,
        topicName,
        actionType: "VERIFY",
        bottleneck: diagnosis.bottleneck,
        severity,
        minutes: ACTION_BASE.VERIFY_LOW_EVIDENCE.minutes,
        expectedImpact: ACTION_BASE.VERIFY_LOW_EVIDENCE.baseImpact,
        rationale: diagnosis.notes
      });

    case "PREREQUISITE_GAP": {
      const targetId = diagnosis.redirectTopicId ?? topicId;
      const targetName = diagnosis.redirectTopicName ?? topicName;
      return makeCandidate({
        topicId: targetId,
        topicName: targetName,
        actionType: "REVIEW",
        bottleneck: diagnosis.bottleneck,
        severity,
        minutes: ACTION_BASE.PREREQUISITE_REVIEW.minutes,
        expectedImpact: impact(ACTION_BASE.PREREQUISITE_REVIEW.baseImpact, severity),
        rationale: diagnosis.notes
      });
    }

    case "CONCEPT_GAP": {
      const severe = severity >= 0.35;
      const base = severe ? ACTION_BASE.CONCEPT_LEARN : ACTION_BASE.CONCEPT_PRACTICE;
      return makeCandidate({
        topicId,
        topicName,
        actionType: severe ? "LEARN" : "PRACTICE",
        bottleneck: diagnosis.bottleneck,
        severity,
        minutes: base.minutes,
        expectedImpact: impact(base.baseImpact, severity),
        rationale: diagnosis.notes
      });
    }

    case "RETENTION_DECAY":
      return makeCandidate({
        topicId,
        topicName,
        actionType: "RECALL",
        bottleneck: diagnosis.bottleneck,
        severity,
        minutes: ACTION_BASE.RETENTION_RECALL.minutes,
        expectedImpact: impact(ACTION_BASE.RETENTION_RECALL.baseImpact, severity),
        rationale: diagnosis.notes
      });

    case "METHOD_ERROR":
      return makeCandidate({
        topicId,
        topicName,
        actionType: "METHOD_REPAIR",
        bottleneck: diagnosis.bottleneck,
        severity,
        minutes: ACTION_BASE.METHOD_REPAIR.minutes,
        expectedImpact: impact(ACTION_BASE.METHOD_REPAIR.baseImpact, severity),
        rationale: diagnosis.notes
      });

    case "TRANSFER_GAP":
      return makeCandidate({
        topicId,
        topicName,
        actionType: "TRANSFER_CHALLENGE",
        bottleneck: diagnosis.bottleneck,
        severity,
        minutes: ACTION_BASE.TRANSFER_CHALLENGE.minutes,
        expectedImpact: impact(ACTION_BASE.TRANSFER_CHALLENGE.baseImpact, severity),
        rationale: diagnosis.notes
      });

    case "SPEED_LIMIT":
      return makeCandidate({
        topicId,
        topicName,
        actionType: "TIMED_PRACTICE",
        bottleneck: diagnosis.bottleneck,
        severity,
        minutes: ACTION_BASE.TIMED_PRACTICE.minutes,
        expectedImpact: impact(ACTION_BASE.TIMED_PRACTICE.baseImpact, severity),
        rationale: diagnosis.notes
      });

    case "STABLE":
    default:
      return null;
  }
}

export function buildCandidateActions(diagnoses: Diagnosis[]): CandidateAction[] {
  const candidates: CandidateAction[] = [];
  for (const d of diagnoses) {
    const c = buildCandidateAction(d);
    if (c) candidates.push(c);
  }
  return candidates;
}
