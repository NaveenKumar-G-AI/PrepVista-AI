const { computeDriveFunnel } = require('./funnelService');

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * @param {object} drive
 * @param {Array} applicantsForDrive  shape expected by computeDriveFunnel
 * @param {number|null} eligiblePoolSize
 */
function driveConversionSummary(drive, applicantsForDrive, eligiblePoolSize = null) {
  const funnel = computeDriveFunnel(applicantsForDrive, eligiblePoolSize);
  const appliedCount = funnel.stages.find((s) => s.stage === 'applied')?.count ?? 0;
  const offeredCount = funnel.stages.find((s) => s.stage === 'offered')?.count ?? 0;
  return {
    driveId: drive.driveId,
    company: drive.company,
    tier: drive.tier,
    ctcLPA: drive.ctcLPA,
    appliedCount,
    offeredCount,
    conversionPct: appliedCount > 0 ? round2((offeredCount / appliedCount) * 100) : null,
    funnel,
  };
}

/**
 * Ranks drives by applied→offered conversion, but refuses to rank ones
 * with too few applicants — a 100% conversion rate on 1 applicant isn't
 * a signal, and burying it in a ranked list would misrepresent it as
 * one. Same sample-size discipline as the cohort/outcome services.
 */
function rankDrivesByConversion(driveSummaries, { minApplied = 5 } = {}) {
  const withEnough = driveSummaries.filter((d) => d.appliedCount >= minApplied);
  const insufficient = driveSummaries.filter((d) => d.appliedCount < minApplied);
  return {
    ranked: [...withEnough].sort((a, b) => (b.conversionPct ?? -1) - (a.conversionPct ?? -1)),
    insufficientData: insufficient.map((d) => ({
      driveId: d.driveId,
      company: d.company,
      appliedCount: d.appliedCount,
      note: `Fewer than ${minApplied} applicants — conversion rate not reliable yet.`,
    })),
  };
}

module.exports = { driveConversionSummary, rankDrivesByConversion };
