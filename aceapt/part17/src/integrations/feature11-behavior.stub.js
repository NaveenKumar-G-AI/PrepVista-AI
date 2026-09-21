// ============================================================================
// STUB for FEATURE 11 — Learning Behavior Intelligence
// ============================================================================
// No Feature 11 codebase was provided. Section 43 is explicit: "Never make
// unsupported judgments about the student's personality." This stub only
// records observable, factual signals (hints used, retries, response-time
// deviation) — it never labels or interprets the student. Interpretation
// is Feature 11's job in the real system.
// ============================================================================

function recordBehaviorSignal(student, signal) {
  student.behaviorSignals = student.behaviorSignals || [];
  student.behaviorSignals.push({ ...signal, at: Date.now() });
  if (student.behaviorSignals.length > 50) student.behaviorSignals.shift();
  return student.behaviorSignals;
}

module.exports = { recordBehaviorSignal };
