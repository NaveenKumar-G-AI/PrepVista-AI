// Difficulty Engine (Section 4, 5, 6).
//
// Difficulty is never a single number here. A target is a profile across
// independent dimensions (concept / strategy / calculation / reading) plus
// a time budget and a transfer-distance requirement. The Selection Engine
// scores bank candidates against this profile instead of a single scalar.

const BASE_TARGETS = Object.freeze({
  CONCEPT_LEARNING: { concept: 'easy', strategy: 'easy', calculation: 'easy', reading: 'easy' },
  FOUNDATION_PRACTICE: { concept: 'easy', strategy: 'easy', calculation: 'medium', reading: 'easy' },
  REINFORCEMENT: { concept: 'medium', strategy: 'medium', calculation: 'medium', reading: 'easy' },
  DIAGNOSTIC: { concept: 'medium', strategy: 'hard', calculation: 'easy', reading: 'medium' },
  DIFFERENTIATION: { concept: 'medium', strategy: 'hard', calculation: 'medium', reading: 'medium' },
  INTERVENTION_VERIFICATION: { concept: 'medium', strategy: 'medium', calculation: 'easy', reading: 'easy' },
  MASTERY_VERIFICATION: { concept: 'hard', strategy: 'hard', calculation: 'medium', reading: 'medium' },
  TRANSFER: { concept: 'medium', strategy: 'hard', calculation: 'medium', reading: 'medium', transferDistance: 'far' },
  RETENTION: { concept: 'medium', strategy: 'medium', calculation: 'easy', reading: 'easy' },
  SPEED: { concept: 'easy', strategy: 'easy', calculation: 'easy', reading: 'easy', maxExpectedTimeSeconds: 30 },
  MIXED_PRACTICE: { concept: 'medium', strategy: 'hard', calculation: 'medium', reading: 'medium' },
  ASSESSMENT_SIMULATION: { concept: 'medium', strategy: 'medium', calculation: 'medium', reading: 'medium' },
  READINESS: { concept: 'medium', strategy: 'medium', calculation: 'medium', reading: 'medium' },
  STRETCH: { concept: 'hard', strategy: 'hard', calculation: 'hard', reading: 'medium' },
});

/**
 * Student-specific difficulty (Section 5): only claim a personalized
 * effective-difficulty estimate once there's enough evidence. Below the
 * confidence threshold, callers should treat this as "unknown" rather than
 * silently falling back to a guess presented as fact.
 */
function effectiveDifficulty(skillState) {
  const sampleSize = (skillState?.attempts || []).length;
  const CONFIDENCE_THRESHOLD = 3;
  if (sampleSize < CONFIDENCE_THRESHOLD) {
    return { estimate: 'unknown', confidence: Math.round((sampleSize / CONFIDENCE_THRESHOLD) * 100) / 100, sampleSize };
  }
  const composite = ((skillState.concept || 0) + (skillState.strategy || 0)) / 2;
  const estimate = composite >= 0.7 ? 'easy' : composite >= 0.45 ? 'medium' : 'hard';
  return { estimate, confidence: Math.min(1, sampleSize / 8), sampleSize };
}

function targetFor(purpose) {
  return { ...(BASE_TARGETS[purpose] || BASE_TARGETS.REINFORCEMENT) };
}

module.exports = { targetFor, effectiveDifficulty, BASE_TARGETS };
