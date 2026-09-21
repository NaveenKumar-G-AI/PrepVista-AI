// ============================================================================
// STUB for FEATURE 16 — Adaptive Learning Intervention & Recovery Engine
// ============================================================================
// No Feature 16 codebase was provided to inspect, so this file is a clean
//, clearly-labeled stand-in for its public contract, not a real
// implementation of Feature 16 itself (Section 38: "DO NOT duplicate
// Feature 16"). Feature 17 calls diagnose() with evidence and consumes
// whatever comes back — it does not own diagnosis logic long-term.
//
// TO INTEGRATE THE REAL FEATURE 16: replace the body of diagnose() with a
// call into the actual Feature 16 service (HTTP call, queue event, or a
// shared internal module import). Keep the same return shape so
// questionOrchestrator.js does not need to change.
// ============================================================================

// Maps an observed misconception tag (attached to a distractor in the
// question bank — Section 11 Distractor Intelligence) to the underlying
// gap type it's evidence for.
const TAG_TO_GAP = Object.freeze({
  wrote_percent_as_answer: 'concept_gap',
  half_error: 'calculation_gap',
  arithmetic_error: 'calculation_gap',
  wrong_base_new: 'concept_gap',
  raw_difference_as_percent: 'concept_gap',
  naive_percentage_subtraction: 'strategy_gap',
  naive_percentage_subtraction_sign: 'strategy_gap',
  added_percentages_instead_of_multiplying: 'strategy_gap',
  assumes_equal_percent_changes_cancel: 'strategy_gap',
  sign_confusion: 'strategy_gap',
  ignored_compounding: 'strategy_gap',
  rounding_error: 'calculation_gap',
  wrong_base_used_sp_not_cp: 'concept_gap',
  multiplied_instead_of_divided: 'calculation_gap',
  forgot_final_step: 'strategy_gap',
  averaged_days_instead_of_rates: 'strategy_gap',
  added_days: 'strategy_gap',
  subtracted_days_directly: 'strategy_gap',
  used_average_as_answer: 'concept_gap',
});

const INTERVENTION_FOR_GAP = Object.freeze({
  concept_gap: 'base_concept_reteach',
  strategy_gap: 'contrast_training',
  calculation_gap: 'guided_computation_practice',
  unknown: 'general_review',
});

/**
 * Given a skill's accumulated misconception counts, return the most likely
 * gap type, a confidence in [0,1], and the recommended intervention.
 * @param {object} skillState
 */
function diagnose(skillState) {
  const counts = {};
  Object.entries(skillState?.misconceptions || {}).forEach(([tag, n]) => {
    const gap = TAG_TO_GAP[tag] || 'unknown';
    counts[gap] = (counts[gap] || 0) + n;
  });

  const entries = Object.entries(counts);
  if (entries.length === 0) {
    return { gapType: 'unknown', confidence: 0, recommendedIntervention: null };
  }

  entries.sort((a, b) => b[1] - a[1]);
  const [gapType, weight] = entries[0];
  const confidence = Math.min(1, weight * 0.5);

  return {
    gapType,
    confidence,
    recommendedIntervention: INTERVENTION_FOR_GAP[gapType] || INTERVENTION_FOR_GAP.unknown,
  };
}

module.exports = { diagnose, TAG_TO_GAP, INTERVENTION_FOR_GAP };
