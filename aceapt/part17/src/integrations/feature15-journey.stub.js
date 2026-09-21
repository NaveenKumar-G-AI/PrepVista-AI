// ============================================================================
// STUB for FEATURE 15 — Dynamic Personal Mastery Path & Learning Journey
// ============================================================================
// No Feature 15 codebase was provided. Feature 17 asks this module "what
// skill should the student work on right now" (getCurrentObjective) and
// reports evidence back to it (updateJourney) — Feature 17 does not decide
// the overall path (Section 40: "Feature 15 owns WHERE THE STUDENT SHOULD
// GO NEXT. Feature 17 owns WHICH QUESTION.").
//
// TO INTEGRATE THE REAL FEATURE 15: replace both functions with calls into
// the actual Feature 15 service, keeping the same return shapes.
// ============================================================================

const STAGES = Object.freeze([
  'BEGINNER',
  'UNDERSTANDING',
  'PRACTICE',
  'MASTERY',
  'TRANSFER',
  'RETENTION',
  'ASSESSMENT_READINESS',
  'PLACEMENT_READINESS',
]);

// A plausible skill progression across the seeded question bank — stands
// in for the real curriculum graph Feature 15 would own.
const DEFAULT_SKILL_ORDER = Object.freeze([
  'percentage-basics',
  'percentage-change-basic',
  'percentage-change-base-identification',
  'successive-percentage-change',
  'ratio-basic-scaling',
  'ratio-equations',
  'ratio-division',
  'profit-loss-basic',
  'profit-loss-cp-from-loss',
  'time-work-combined-rate',
  'time-work-reverse-rate',
  'average-basic',
  'average-new-element',
]);

function getCurrentObjective(student) {
  if (student?.journey?.currentObjectiveSkill) {
    return { skillId: student.journey.currentObjectiveSkill, stage: student.journey.stage };
  }
  return { skillId: DEFAULT_SKILL_ORDER[0], stage: 'BEGINNER' };
}

/**
 * @param {object} student
 * @param {object} evidence
 * @param {object} skillState the skill just exercised
 * @returns {object} partial journey update to merge in
 */
function updateJourney(student, evidence, skillState) {
  const stageIdx = STAGES.indexOf(student.journey.stage);
  let nextStage = student.journey.stage;

  if (skillState.concept >= 0.6 && skillState.strategy >= 0.6 && stageIdx < STAGES.indexOf('MASTERY')) {
    nextStage = 'MASTERY';
  }
  if (skillState.transfer >= 0.6 && STAGES.indexOf(nextStage) < STAGES.indexOf('TRANSFER')) {
    nextStage = 'TRANSFER';
  }
  if (skillState.transfer >= 0.7 && skillState.speed >= 0.6 && STAGES.indexOf(nextStage) < STAGES.indexOf('ASSESSMENT_READINESS')) {
    nextStage = 'ASSESSMENT_READINESS';
  }

  return { stage: nextStage, currentObjectiveSkill: student.journey.currentObjectiveSkill };
}

module.exports = { getCurrentObjective, updateJourney, STAGES, DEFAULT_SKILL_ORDER };
