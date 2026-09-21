// Question Purpose Engine (master prompt Section 1 & 2).
//
// Decides WHY a question should be shown next, for a given skill, given
// the student's current evidence. This is intentionally deterministic and
// legible — every branch has a plain-language rationale attached, because
// the orchestrator surfaces that rationale to the student as "why this
// question?" (Section 34).
//
// This function does NOT handle "something is already in progress" cases
// (an active remediation arc, a pending diagnostic, exam mode) — those are
// short-circuited by the orchestrator before this is called, because they
// represent state that spans multiple questions rather than a fresh
// per-question decision.

const PURPOSES = Object.freeze({
  CONCEPT_LEARNING: 'CONCEPT_LEARNING',
  FOUNDATION_PRACTICE: 'FOUNDATION_PRACTICE',
  REINFORCEMENT: 'REINFORCEMENT',
  DIAGNOSTIC: 'DIAGNOSTIC',
  DIFFERENTIATION: 'DIFFERENTIATION',
  INTERVENTION_VERIFICATION: 'INTERVENTION_VERIFICATION',
  MASTERY_VERIFICATION: 'MASTERY_VERIFICATION',
  TRANSFER: 'TRANSFER',
  RETENTION: 'RETENTION',
  SPEED: 'SPEED',
  MIXED_PRACTICE: 'MIXED_PRACTICE',
  ASSESSMENT_SIMULATION: 'ASSESSMENT_SIMULATION',
  READINESS: 'READINESS',
  STRETCH: 'STRETCH',
});

/**
 * @param {object} ctx
 * @param {object} ctx.skillState - concept/strategy/transfer/speed in [0,1], plus attempts[]
 * @returns {{purpose: string, rationale: string}}
 */
function decidePurpose({ skillState }) {
  if (!skillState || (skillState.attempts || []).length === 0) {
    return {
      purpose: PURPOSES.CONCEPT_LEARNING,
      rationale: "This is the first question we're using to introduce this skill.",
    };
  }

  const { concept = 0.3, strategy = 0.3, transfer = 0.2, speed = 0.3 } = skillState;

  if (concept < 0.5) {
    return {
      purpose: PURPOSES.FOUNDATION_PRACTICE,
      rationale: 'Recent answers suggest the core concept here still needs more foundational practice.',
    };
  }

  if (strategy < 0.5) {
    return {
      purpose: PURPOSES.DIAGNOSTIC,
      rationale: 'Concept understanding looks solid — checking whether strategy selection is the gap.',
    };
  }

  if (transfer < 0.5) {
    return {
      purpose: PURPOSES.TRANSFER,
      rationale: 'Concept and strategy are both holding up — time to test this in an unfamiliar context.',
    };
  }

  if (speed < 0.5) {
    return {
      purpose: PURPOSES.SPEED,
      rationale: 'Accuracy is strong here — building comfortable, quicker recall next.',
    };
  }

  if (concept >= 0.7 && strategy >= 0.7 && transfer >= 0.7 && speed >= 0.6) {
    return {
      purpose: PURPOSES.MIXED_PRACTICE,
      rationale: "This skill is strong on its own — let's see it inside a mixed set of topics.",
    };
  }

  return {
    purpose: PURPOSES.REINFORCEMENT,
    rationale: 'A general check to keep this skill fresh while other dimensions catch up.',
  };
}

module.exports = { PURPOSES, decidePurpose };
