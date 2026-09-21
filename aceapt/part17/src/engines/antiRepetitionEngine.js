// Anti-Repetition Engine (Section 14, 15, 27).
//
// The rule is NOT "never repeat a question." Deliberate repetition is
// valuable for diagnostics, verifying an intervention worked, and testing
// retention (Section 15). What's disallowed is meaningless overexposure —
// the same item shown again for no reason shortly after it was last seen.

const PURPOSES_THAT_ALLOW_DELIBERATE_REPETITION = new Set([
  'DIAGNOSTIC',
  'INTERVENTION_VERIFICATION',
  'RETENTION',
]);

function isEligible(exposure, purpose) {
  if (!exposure) return true;

  if (PURPOSES_THAT_ALLOW_DELIBERATE_REPETITION.has(purpose)) {
    return true;
  }

  const { timesSeen = 0, correctCount = 0, lastSeenAt = 0 } = exposure;

  if (timesSeen === 0) return true;

  // A recent failure on a non-diagnostic item is allowed a fairly quick
  // reattempt — this is the "smart repetition" case (Section 15), not
  // random repetition.
  if (correctCount === 0 && timesSeen < 2) return true;

  const hoursSinceLastSeen = (Date.now() - lastSeenAt) / 3600000;
  if (timesSeen >= 2 && hoursSinceLastSeen < 24) return false;

  return timesSeen < 3;
}

function recordExposure(db, studentId, questionId, correct) {
  const existing = db.getExposure(studentId, questionId) || { timesSeen: 0, correctCount: 0, incorrectCount: 0 };
  const next = {
    timesSeen: existing.timesSeen + 1,
    correctCount: existing.correctCount + (correct ? 1 : 0),
    incorrectCount: existing.incorrectCount + (correct ? 0 : 1),
    lastSeenAt: Date.now(),
  };
  db.setExposure(studentId, questionId, next);
  return next;
}

module.exports = { isEligible, recordExposure };
