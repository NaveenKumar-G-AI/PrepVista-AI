const { RISK_MODEL_V1 } = require('../config/readinessConfig');

/**
 * Collects independent, evidenced risk signals for one student.
 * Each signal is a reason, not a verdict — severity is decided
 * afterwards, by counting how many independent signals fired
 * (section 38's false-positive safeguard).
 */
async function detectRiskSignals(studentId, { readinessSnapshot, repos, model = RISK_MODEL_V1 }) {
  const signals = [];
  const t = model.thresholds;

  if (readinessSnapshot.overallScore !== null && readinessSnapshot.overallScore < t.lowReadinessScore) {
    signals.push({
      type: 'LOW_READINESS',
      evidence: `Overall readiness ${readinessSnapshot.overallScore} is below ${t.lowReadinessScore}.`,
    });
  }

  if (readinessSnapshot.momentum.state === 'DECLINING') {
    signals.push({ type: 'READINESS_DECLINE', evidence: readinessSnapshot.momentum.evidence });
  }

  const assessments = (await repos.assessments.getRecentAssessments(studentId)) || [];
  if (assessments.length === 0) {
    signals.push({ type: 'NO_RECENT_ASSESSMENT', evidence: 'No assessment records found.' });
  } else {
    const sortedDesc = [...assessments].sort((a, b) => new Date(b.takenAt) - new Date(a.takenAt));
    const daysSinceLatest = (Date.now() - new Date(sortedDesc[0].takenAt).getTime()) / 86400000;
    if (daysSinceLatest > t.staleAssessmentDays) {
      signals.push({
        type: 'NO_RECENT_ASSESSMENT',
        evidence: `Most recent assessment was ${Math.round(daysSinceLatest)} days ago.`,
      });
    }

    // Checked PER DIMENSION, not across the student's assessments in
    // general — otherwise an unrelated pass (e.g. a communication
    // assessment) sitting between two failed technical ones would mask
    // a genuine technical losing streak. Section 88's own example is
    // specifically "2 recent TECHNICAL assessment failures".
    const byDimension = {};
    for (const a of sortedDesc) {
      (byDimension[a.dimension] = byDimension[a.dimension] || []).push(a);
    }
    for (const [dim, list] of Object.entries(byDimension)) {
      let consecutiveFails = 0;
      for (const a of list) {
        const pct = (a.rawScore / a.maxScore) * 100;
        if (pct < t.assessmentFailScore) consecutiveFails += 1;
        else break;
      }
      if (consecutiveFails >= t.consecutiveFailuresForSignal) {
        signals.push({
          type: 'REPEATED_ASSESSMENT_FAILURES',
          evidence: `${consecutiveFails} consecutive ${dim} assessment(s) below ${t.assessmentFailScore}.`,
        });
      }
    }
  }

  const training = (await repos.training.getTrainingHistory(studentId)) || [];
  const enrolled = training.filter((tr) => tr.enrolled);
  if (enrolled.length > 0) {
    const noCompletions = enrolled.every((tr) => !tr.completed);
    const lowAttendance = enrolled.some((tr) => tr.attendancePct < t.lowAttendancePct);
    if (noCompletions || lowAttendance) {
      signals.push({
        type: 'LOW_TRAINING_PARTICIPATION',
        evidence: noCompletions
          ? 'Enrolled in training with no completions.'
          : 'Attendance below threshold in at least one enrolled program.',
      });
    }
  }

  const mocks = repos.mockInterviews ? (await repos.mockInterviews.getMockInterviews(studentId)) || [] : [];
  const realInterviews = repos.interviews ? (await repos.interviews.getInterviews(studentId)) || [] : [];
  const failedCount =
    mocks.filter((m) => m.overallScore < t.interviewFailScore).length +
    realInterviews.filter((iv) => iv.result === 'FAIL').length;
  if (failedCount >= t.interviewFailuresForSignal) {
    signals.push({
      type: 'REPEATED_INTERVIEW_FAILURES',
      evidence: `${failedCount} failed interview attempt(s) across mock and real interviews.`,
    });
  }

  if (repos.applications) {
    const apps = (await repos.applications.getApplications(studentId)) || [];
    if (apps.length === 0) {
      signals.push({ type: 'NO_APPLICATION_ACTIVITY', evidence: 'No drive applications on record this season.' });
    }
  }

  if (repos.profile) {
    const profile = await repos.profile.getProfileCompleteness(studentId);
    if (profile && profile.completenessPct < t.incompleteProfilePct) {
      signals.push({
        type: 'INCOMPLETE_PROFILE',
        evidence: `Profile ${profile.completenessPct}% complete.`,
      });
    }
  }

  return signals;
}

function severityFromSignalCount(count, model = RISK_MODEL_V1) {
  for (const row of model.severityBySignalCount) {
    if (count >= row.minSignals) return row.level;
  }
  return 'NONE';
}

/**
 * @param {object} previousRiskState  last known { level, firstDetected } for
 *   this student, if any — used only to preserve `firstDetected` across a
 *   continued risk episode, never to decide the current level.
 */
async function calculateRisk(
  studentId,
  { readinessSnapshot, repos, model = RISK_MODEL_V1, previousRiskState = null, now = new Date().toISOString() }
) {
  if (!readinessSnapshot) {
    return {
      studentId,
      level: 'INSUFFICIENT_DATA',
      signalCount: 0,
      signals: [],
      firstDetected: null,
      latestUpdate: now,
    };
  }

  const signals = await detectRiskSignals(studentId, { readinessSnapshot, repos, model });
  const level = severityFromSignalCount(signals.length, model);

  const wasActive = previousRiskState && previousRiskState.level && previousRiskState.level !== 'NONE';
  const isActive = level !== 'NONE';
  const firstDetected = wasActive && isActive ? previousRiskState.firstDetected : isActive ? now : null;

  return { studentId, level, signalCount: signals.length, signals, firstDetected, latestUpdate: now };
}

module.exports = { detectRiskSignals, severityFromSignalCount, calculateRisk };
