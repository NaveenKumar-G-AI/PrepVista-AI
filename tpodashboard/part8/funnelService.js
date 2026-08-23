/**
 * Funnel stages are cumulative/nested — reaching "offered" means you
 * also reached every stage before it. Counts are computed from each
 * student/applicant's SINGLE furthest stage reached, not summed across
 * every event (summing raw events is the classic double-counting bug —
 * section 75 explicitly calls this out as something to attack).
 */

function computeFunnelCounts(furthestStages, stages) {
  const stageIndex = Object.fromEntries(stages.map((s, i) => [s, i]));
  const counts = stages.map(() => 0);
  for (const stage of furthestStages) {
    const idx = stageIndex[stage];
    if (idx === undefined) continue;
    for (let i = 0; i <= idx; i++) counts[i] += 1;
  }
  return stages.map((s, i) => ({
    stage: s,
    count: counts[i],
    dropOffFromPrevPct:
      i === 0 || counts[i - 1] === 0 ? null : Math.round((1 - counts[i] / counts[i - 1]) * 10000) / 100,
  }));
}

// --- Season-level funnel (registered through joined) -------------------

const SEASON_STAGES = ['registered', 'eligible', 'applied', 'shortlisted', 'interviewed', 'offered', 'accepted', 'joined'];

function deriveSeasonFurthestStage({ isEligibleForAny, applications, interviews, offers }) {
  if (offers.some((o) => o.joined)) return 'joined';
  if (offers.some((o) => o.accepted)) return 'accepted';
  if (offers.length > 0) return 'offered';
  if (interviews.length > 0) return 'interviewed';
  if (applications.some((a) => a.status === 'SHORTLISTED' || a.status === 'INTERVIEW_SCHEDULED')) return 'shortlisted';
  if (applications.length > 0) return 'applied';
  if (isEligibleForAny) return 'eligible';
  return 'registered';
}

/** @param {{studentId, isEligibleForAny, applications, interviews, offers}[]} studentFunnelInputs */
function computeSeasonFunnel(studentFunnelInputs) {
  const furthest = studentFunnelInputs.map(deriveSeasonFurthestStage);
  return { totalStudents: furthest.length, stages: computeFunnelCounts(furthest, SEASON_STAGES) };
}

function computeSeasonFunnelByGroup(studentFunnelInputsWithGroup, groupKey) {
  const groups = {};
  for (const item of studentFunnelInputsWithGroup) {
    const key = item[groupKey];
    (groups[key] = groups[key] || []).push(item);
  }
  const result = {};
  for (const [key, items] of Object.entries(groups)) result[key] = computeSeasonFunnel(items);
  return result;
}

// --- Per-drive funnel (applied through joined, for one company) --------

const DRIVE_STAGES = ['applied', 'shortlisted', 'interviewed', 'offered', 'accepted', 'joined'];

function deriveDriveFurthestStage({ status, interviewed, offered, accepted, joined }) {
  if (joined) return 'joined';
  if (accepted) return 'accepted';
  if (offered) return 'offered';
  if (interviewed) return 'interviewed';
  if (status === 'SHORTLISTED' || status === 'INTERVIEW_SCHEDULED') return 'shortlisted';
  return 'applied';
}

/**
 * @param {Array} applicantsForDrive  [{studentId, status, interviewed, offered, accepted, joined}]
 * @param {number|null} eligiblePoolSize  how many students meet this drive's criteria at all —
 *   context for "applied % of eligible", not part of the cumulative stage count itself.
 */
function computeDriveFunnel(applicantsForDrive, eligiblePoolSize = null) {
  const furthest = applicantsForDrive.map(deriveDriveFurthestStage);
  return {
    eligiblePoolSize,
    appliedOfEligiblePct:
      eligiblePoolSize && eligiblePoolSize > 0 ? Math.round((furthest.length / eligiblePoolSize) * 10000) / 100 : null,
    stages: computeFunnelCounts(furthest, DRIVE_STAGES),
  };
}

module.exports = {
  SEASON_STAGES,
  DRIVE_STAGES,
  computeFunnelCounts,
  deriveSeasonFurthestStage,
  computeSeasonFunnel,
  computeSeasonFunnelByGroup,
  deriveDriveFurthestStage,
  computeDriveFunnel,
};
