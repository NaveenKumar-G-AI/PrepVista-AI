// ============================================================================
// STUB for FEATURE 13 — Continuous Readiness & Exam-Condition Performance
// ============================================================================
// No Feature 13 codebase was provided. Feature 17 forwards evidence from
// timed / mixed / simulation questions here; Feature 13 owns interpreting
// readiness (Section 41: "Do not duplicate readiness logic.").
// ============================================================================

function updateReadiness(student, evidence) {
  student.readiness = student.readiness || { examConditionScore: 0.3, normalPracticeScore: 0.3, samples: 0 };
  const delta = evidence.correct ? 0.08 : -0.05;

  if (student.mode === 'EXAM' || evidence.purposeServed === 'ASSESSMENT_SIMULATION') {
    student.readiness.examConditionScore = Math.max(0, Math.min(1, student.readiness.examConditionScore + delta));
  } else {
    student.readiness.normalPracticeScore = Math.max(0, Math.min(1, student.readiness.normalPracticeScore + delta * 0.6));
  }
  student.readiness.samples += 1;
  return student.readiness;
}

module.exports = { updateReadiness };
