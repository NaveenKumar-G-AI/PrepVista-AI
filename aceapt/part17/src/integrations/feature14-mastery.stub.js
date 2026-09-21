// ============================================================================
// STUB for FEATURE 14 — Adaptive Mastery & Skill Transfer Intelligence
// ============================================================================
// No Feature 14 codebase was provided, so this is a clean stand-in for its
// contract, not a competing mastery engine (Section 39: "Do not create a
// competing mastery engine"). Feature 17 calls updateMastery() after every
// attempt and treats the result as the new skill state — it does not decide
// mastery thresholds itself.
//
// TO INTEGRATE THE REAL FEATURE 14: replace the body of updateMastery()
// with a call into the actual Feature 14 service. Keep the returned shape
// (concept/strategy/transfer/speed in [0,1], plus bookkeeping fields) so
// questionOrchestrator.js does not need to change.
// ============================================================================

const { clamp01 } = require('../utils/text');

// How much each purpose moves each mastery dimension. A DIAGNOSTIC question
// mostly informs strategy; a TRANSFER question mostly informs transfer; a
// SPEED question mostly informs speed; and so on.
const PURPOSE_WEIGHTS = Object.freeze({
  CONCEPT_LEARNING: { concept: 1.0, strategy: 0.2, transfer: 0, speed: 0 },
  FOUNDATION_PRACTICE: { concept: 0.8, strategy: 0.3, transfer: 0, speed: 0 },
  REINFORCEMENT: { concept: 0.5, strategy: 0.5, transfer: 0.1, speed: 0.1 },
  DIAGNOSTIC: { concept: 0.3, strategy: 0.9, transfer: 0, speed: 0 },
  DIFFERENTIATION: { concept: 0.4, strategy: 0.8, transfer: 0.2, speed: 0 },
  INTERVENTION_VERIFICATION: { concept: 0.3, strategy: 0.9, transfer: 0, speed: 0 },
  MASTERY_VERIFICATION: { concept: 0.6, strategy: 0.6, transfer: 0.3, speed: 0.1 },
  TRANSFER: { concept: 0.2, strategy: 0.4, transfer: 1.0, speed: 0 },
  RETENTION: { concept: 0.3, strategy: 0.3, transfer: 0.2, speed: 0 },
  SPEED: { concept: 0, strategy: 0.1, transfer: 0, speed: 1.0 },
  MIXED_PRACTICE: { concept: 0.3, strategy: 0.6, transfer: 0.7, speed: 0.1 },
  ASSESSMENT_SIMULATION: { concept: 0.3, strategy: 0.5, transfer: 0.4, speed: 0.4 },
  READINESS: { concept: 0.2, strategy: 0.4, transfer: 0.3, speed: 0.5 },
  STRETCH: { concept: 0.5, strategy: 0.7, transfer: 0.6, speed: 0 },
});

/**
 * @param {object} skillState current dims for this skill
 * @param {object} evidence { correct, purposeServed, responseTimeMs, expectedTimeSeconds, questionId }
 * @returns {object} the next skillState (caller is responsible for persisting it)
 */
function updateMastery(skillState, evidence) {
  const weights = PURPOSE_WEIGHTS[evidence.purposeServed] || PURPOSE_WEIGHTS.REINFORCEMENT;
  const base = evidence.correct ? 0.15 : -0.12;
  const next = { ...skillState };

  ['concept', 'strategy', 'transfer'].forEach((dim) => {
    const w = weights[dim] ?? 0;
    if (w > 0) {
      next[dim] = clamp01((skillState[dim] ?? 0.3) + base * w);
    }
  });

  // Speed only moves meaningfully on a correct answer — a wrong answer's
  // response time doesn't tell us much about fluency.
  if (evidence.correct && evidence.expectedTimeSeconds) {
    const ratio = (evidence.responseTimeMs / 1000) / evidence.expectedTimeSeconds;
    const speedSignal = ratio <= 0.85 ? 0.1 : ratio <= 1.15 ? 0.02 : -0.08;
    const speedWeight = (weights.speed || 0) + 0.2; // small baseline so speed still moves a little on any correct answer
    next.speed = clamp01((skillState.speed ?? 0.3) + speedSignal * speedWeight);
  }

  if (evidence.correct && next.concept >= 0.6 && next.strategy >= 0.6 && !skillState.masteredAt) {
    next.masteredAt = Date.now();
  }

  next.attempts = [...(skillState.attempts || []), evidence.questionId];
  next.lastSeenAt = Date.now();
  if (evidence.correct) next.lastCorrectAt = Date.now();

  return next;
}

module.exports = { updateMastery, PURPOSE_WEIGHTS };
