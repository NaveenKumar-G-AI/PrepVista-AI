import { Diagnosis, TopicCapabilityState } from "../types";
import {
  CONCEPT_GAP_MASTERY,
  PREREQUISITE_WEAK_MASTERY,
  RETENTION_DECAY_MAX,
  SPEED_LIMIT_MAX,
  SPEED_LIMIT_REQUIRES_ACCURACY_AT_LEAST,
  STABLE_MIN,
  TRANSFER_GAP_MAX,
  TRANSFER_GAP_REQUIRES_MASTERY_AT_LEAST
} from "./constants";

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Section 8: a wrong answer can come from many different causes. This
 * function is where ACEAPT Adapt decides which one is most likely for a
 * single topic, given everything currently known about it - never jumping
 * straight to "the student is weak here."
 *
 * Check order matters and mirrors the document's own worked examples:
 *   1. Is there even enough evidence to diagnose anything? (section 18)
 *   2. Is the real problem a weak prerequisite, not this topic? (section 27)
 *   3. Missing concept entirely?
 *   4. Forgotten over time (retention), separate from never having known it?
 *   5. A recurring wrong method, not a knowledge gap? (section 22)
 *   6. Solid on the concept but falls apart when the problem changes? (transfer)
 *   7. Accurate but slow?
 *   8. Everything strong and steady -> stable, stop re-testing it (section 19)
 */
export function diagnoseTopic(
  state: TopicCapabilityState,
  prerequisiteStates: TopicCapabilityState[]
): Diagnosis {
  const base = { topicId: state.topicId, topicName: state.topicName };

  if (state.confidence === "LOW") {
    return {
      ...base,
      bottleneck: "LOW_EVIDENCE",
      severity: 0.5,
      confidence: state.confidence,
      notes: [
        `Only ${state.sampleSize} attempt(s) recorded - not enough to tell what's actually going on yet.`,
        "Recommending a short check before committing to a bigger intervention."
      ]
    };
  }

  if (state.mastery !== null && state.mastery < CONCEPT_GAP_MASTERY) {
    const weakPrereq = prerequisiteStates.find(
      (p) => p.mastery !== null && p.mastery < PREREQUISITE_WEAK_MASTERY
    );
    if (weakPrereq) {
      return {
        ...base,
        bottleneck: "PREREQUISITE_GAP",
        severity: clamp01((PREREQUISITE_WEAK_MASTERY - (weakPrereq.mastery ?? 0)) / PREREQUISITE_WEAK_MASTERY),
        confidence: state.confidence,
        notes: [
          `${state.topicName} looks weak (mastery ${state.mastery}%), but its prerequisite ` +
            `"${weakPrereq.topicName}" is also weak (mastery ${weakPrereq.mastery}%).`,
          `Addressing ${weakPrereq.topicName} first is likely to fix more than practicing ${state.topicName} directly.`
        ],
        redirectTopicId: weakPrereq.topicId,
        redirectTopicName: weakPrereq.topicName
      };
    }
    return {
      ...base,
      bottleneck: "CONCEPT_GAP",
      severity: clamp01((CONCEPT_GAP_MASTERY - state.mastery) / CONCEPT_GAP_MASTERY),
      confidence: state.confidence,
      notes: [`Mastery is ${state.mastery}% - the concept itself isn't solid yet.`]
    };
  }

  if (state.retention !== null && state.retention < RETENTION_DECAY_MAX) {
    return {
      ...base,
      bottleneck: "RETENTION_DECAY",
      severity: clamp01((RETENTION_DECAY_MAX - state.retention) / RETENTION_DECAY_MAX),
      confidence: state.confidence,
      notes: [
        `Mastery (${state.mastery ?? "n/a"}%) is fine, but retention has slipped to ${state.retention}%.`,
        "This reads as forgetting, not a knowledge gap - a short recall exercise is the fix, not re-teaching the concept."
      ]
    };
  }

  if (state.persistentErrorPattern) {
    return {
      ...base,
      bottleneck: "METHOD_ERROR",
      severity: clamp01(state.persistentErrorSeverity),
      confidence: state.confidence,
      notes: [
        `The same error ("${state.persistentErrorPattern}") has shown up repeatedly, not just once.`,
        "That points to a method-selection habit to correct, rather than a general accuracy problem."
      ]
    };
  }

  if (
    state.transfer !== null &&
    state.transfer < TRANSFER_GAP_MAX &&
    (state.mastery ?? 0) >= TRANSFER_GAP_REQUIRES_MASTERY_AT_LEAST
  ) {
    return {
      ...base,
      bottleneck: "TRANSFER_GAP",
      severity: clamp01((TRANSFER_GAP_MAX - state.transfer) / TRANSFER_GAP_MAX),
      confidence: state.confidence,
      notes: [
        `Concept mastery (${state.mastery}%) and retention (${state.retention ?? "n/a"}%) are both strong.`,
        `Performance drops to ${state.transfer}% once the problem representation changes - that's a transfer gap, not a knowledge gap.`
      ]
    };
  }

  if (
    state.speed !== null &&
    state.speed < SPEED_LIMIT_MAX &&
    (state.accuracy ?? 0) >= SPEED_LIMIT_REQUIRES_ACCURACY_AT_LEAST
  ) {
    return {
      ...base,
      bottleneck: "SPEED_LIMIT",
      severity: clamp01((SPEED_LIMIT_MAX - state.speed) / SPEED_LIMIT_MAX),
      confidence: state.confidence,
      notes: [
        `Accuracy (${state.accuracy}%) is strong, but speed (${state.speed}%) lags - this is a pace problem, not a correctness problem.`
      ]
    };
  }

  const isStable =
    (state.mastery ?? 0) >= STABLE_MIN.mastery &&
    (state.retention ?? 0) >= STABLE_MIN.retention &&
    (state.transfer ?? 100) >= STABLE_MIN.transfer &&
    (state.accuracy ?? 0) >= STABLE_MIN.accuracy;

  if (isStable) {
    return {
      ...base,
      bottleneck: "STABLE",
      severity: 0,
      confidence: state.confidence,
      notes: ["Mastery, retention, transfer, and accuracy are all strong. Repeating this topic would waste time better spent elsewhere."]
    };
  }

  // Nothing crossed an explicit threshold, and it isn't confidently stable
  // either - evidence just doesn't point at a specific bottleneck right
  // now. Per section 8, the engine doesn't invent one to fill the gap: it
  // stays quiet on this topic (no candidate action) until a real signal
  // shows up, rather than manufacturing low-confidence "weakness" out of a
  // merely-average profile.
  return {
    ...base,
    bottleneck: "STABLE",
    severity: 0,
    confidence: state.confidence,
    notes: ["No specific bottleneck stands out from current evidence - not flagging a weakness that isn't there."]
  };
}

export function diagnoseAllTopics(states: TopicCapabilityState[]): Diagnosis[] {
  const byId = new Map(states.map((s) => [s.topicId, s]));
  return states.map((state) => {
    const prereqStates = state.prerequisiteTopicIds
      .map((id) => byId.get(id))
      .filter((s): s is TopicCapabilityState => Boolean(s));
    return diagnoseTopic(state, prereqStates);
  });
}
