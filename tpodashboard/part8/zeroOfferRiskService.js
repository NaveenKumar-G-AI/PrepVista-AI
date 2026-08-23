function round2(n) {
  return Math.round(n * 100) / 100;
}

function mostRecentDate(dateStrings) {
  const valid = dateStrings.filter(Boolean);
  if (valid.length === 0) return null;
  return valid.reduce((latest, d) => (new Date(d) > new Date(latest) ? d : latest));
}

/**
 * Structured signals, same discipline as riskService.js — each signal is
 * a reason, evidenced, and severity is a function of how many
 * independent signals fired AND how much of the season has already
 * elapsed. A student with one weak signal in week 2 is not the same
 * urgency as one signal in week 16.
 *
 * @param {string} studentId
 * @param {object} ctx
 * @param {Array} ctx.applications
 * @param {Array} ctx.interviews
 * @param {Array} ctx.offers
 * @param {object|null} [ctx.readinessSnapshot]  optional — this must work
 *   for students with no readiness calculated yet, not just ones with
 *   full assessment histories.
 * @param {number} ctx.seasonProgressFraction    0..1, from seasonCalendar.js
 * @param {number} [ctx.minApplicationsByMidSeason=3]
 * @param {number|null} [ctx.eligibleDriveCount]   how many active drives this
 *   student currently qualifies for — 0 means the blocker is structural
 *   (academics), not behavioral (hasn't applied), which is a different
 *   problem for a TPO to act on.
 * @param {number|null} [ctx.profileCompletenessPct]
 */
function assessZeroOfferRisk(
  studentId,
  {
    applications,
    interviews,
    offers,
    readinessSnapshot = null,
    seasonProgressFraction,
    minApplicationsByMidSeason = 3,
    eligibleDriveCount = null,
    profileCompletenessPct = null,
  }
) {
  if (offers.some((o) => o.accepted)) {
    return {
      studentId,
      level: 'NONE',
      signalCount: 0,
      signals: [],
      seasonProgressPct: round2(seasonProgressFraction * 100),
      note: 'Already has an accepted offer.',
    };
  }

  const signals = [];

  if (applications.length === 0 && seasonProgressFraction > 0.3) {
    signals.push({
      type: 'NO_APPLICATIONS_YET',
      evidence: `No applications submitted and the season is ${Math.round(seasonProgressFraction * 100)}% through.`,
    });
  }
  if (applications.length > 0 && applications.length < minApplicationsByMidSeason && seasonProgressFraction > 0.5) {
    signals.push({
      type: 'LOW_APPLICATION_VOLUME',
      evidence: `Only ${applications.length} application(s) past the season midpoint.`,
    });
  }

  const interviewFails = interviews.filter((iv) => iv.result === 'FAIL').length;
  if (interviewFails >= 2 && offers.length === 0) {
    signals.push({
      type: 'REPEATED_REJECTIONS_NO_OFFER',
      evidence: `${interviewFails} interview(s) did not convert, and no offer yet.`,
    });
  }

  if (readinessSnapshot && readinessSnapshot.readinessLevel === 'HIGH_RISK') {
    signals.push({ type: 'LOW_READINESS', evidence: 'Readiness is currently in the HIGH_RISK band.' });
  }

  if (eligibleDriveCount !== null && eligibleDriveCount === 0) {
    signals.push({
      type: 'NO_ELIGIBLE_DRIVES',
      evidence: 'Not currently eligible for any active drive — a structural blocker, not a behavioral one.',
    });
  }

  if (profileCompletenessPct !== null && profileCompletenessPct < 60) {
    signals.push({
      type: 'INCOMPLETE_PROFILE',
      evidence: `Profile ${profileCompletenessPct}% complete — likely blocking eligibility for multiple drives.`,
    });
  }

  const lastActivity = mostRecentDate([...applications.map((a) => a.appliedAt), ...interviews.map((i) => i.date)]);
  if (lastActivity && offers.length === 0) {
    const daysSince = (Date.now() - new Date(lastActivity).getTime()) / 86400000;
    if (daysSince > 30 && seasonProgressFraction > 0.4) {
      signals.push({
        type: 'DISENGAGED',
        evidence: `No application or interview activity in ${Math.round(daysSince)} days.`,
      });
    }
  }

  // A finer ladder than a flat "2+ = worst case" — so a student with 3-4
  // simultaneous signals reads as more severe than one with exactly 2,
  // not identical to it.
  let level;
  const urgent = seasonProgressFraction > 0.6;
  if (signals.length === 0) level = 'NONE';
  else if (signals.length === 1) level = urgent ? 'MEDIUM' : 'LOW';
  else if (signals.length === 2) level = urgent ? 'HIGH' : 'MEDIUM';
  else level = urgent ? 'CRITICAL' : 'HIGH';

  return {
    studentId,
    level,
    signalCount: signals.length,
    signals,
    seasonProgressPct: round2(seasonProgressFraction * 100),
  };
}

function findAtRiskOfZeroOffers(assessments) {
  return assessments
    .filter((a) => a.level === 'HIGH' || a.level === 'CRITICAL')
    .sort((a, b) => b.signalCount - a.signalCount);
}

module.exports = { assessZeroOfferRisk, findAtRiskOfZeroOffers };
