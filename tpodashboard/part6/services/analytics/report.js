'use strict';

const { computeFunnel, computeOfferToJoiningFunnel } = require('./funnel');
const { getCtcDistribution } = require('./distribution');
const { compareSegments } = require('./segments');
const { computeCompanyScorecard } = require('./companyScorecard');
const {
  computeUpgradeAnalysis,
  computeDeclineReasonBreakdown,
  computeCompetitionEdges,
  computePackageDifferential,
} = require('./multipleOffers');

/**
 * One call that assembles the modules above into the shape a TPO would
 * actually hand to management or an accreditation body (spec section
 * 47: "Selected / Offers / Accepted / Joined / Verified Placed / Did Not
 * Join... do not collapse all into one number"). `departmentByStudentId`
 * / `batchByStudentId` are optional - Part 6 doesn't own that data, so
 * those breakdowns only appear when the caller supplies a resolver map.
 */
function buildSeasonReport({
  offers,
  joiningRecords = [],
  departmentByStudentId = null,
  batchByStudentId = null,
  minGroupSizeForCtc = 5,
}) {
  const report = {
    generatedAt: new Date().toISOString(),
    totalOffers: offers.length,
    funnel: computeFunnel(offers),
    offerToJoining: computeOfferToJoiningFunnel(offers, joiningRecords),
    ctc: getCtcDistribution(
      offers.map((o) => o.ctcTotalMinor),
      { minGroupSize: minGroupSizeForCtc }
    ),
    byCompany: computeCompanyScorecard(offers, joiningRecords, { minGroupSizeForCtc }),
    byRole: compareSegments(offers, (o) => o.roleTitle, { joiningRecords, minGroupSizeForCtc }),
    multipleOffers: {
      upgrade: computeUpgradeAnalysis(offers),
      declineReasons: computeDeclineReasonBreakdown(offers),
      competition: computeCompetitionEdges(offers),
      packageDifferential: computePackageDifferential(offers),
    },
  };

  if (departmentByStudentId) {
    report.byDepartment = compareSegments(offers, (o) => departmentByStudentId[o.studentId], {
      joiningRecords,
      minGroupSizeForCtc,
    });
  }
  if (batchByStudentId) {
    report.byBatch = compareSegments(offers, (o) => batchByStudentId[o.studentId], {
      joiningRecords,
      minGroupSizeForCtc,
    });
  }

  return report;
}

/**
 * Flattens the company scorecard into CSV rows - the single most common
 * "export this for management" ask (spec section 63). Money exports in
 * major units (rupees, not paise) since that's what a spreadsheet reader
 * expects. A suppressed (too-small) group exports as a blank cell, never
 * a fabricated number - silently backfilling a suppressed CTC into a
 * spreadsheet would defeat the whole point of suppressing it.
 */
function companyScorecardToCsvRows(seasonReport) {
  const header = ['companyId', 'offersExtended', 'acceptanceRate', 'joiningRate', 'medianCtc'];
  const rows = seasonReport.byCompany.map((c) => [
    c.companyId,
    c.offersExtended,
    c.acceptanceRate ?? '',
    c.joiningRate ?? '',
    c.ctc.suppressed ? '' : c.ctc.median / 100,
  ]);
  return [header, ...rows];
}

function csvEscape(value) {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function toCsvString(rows) {
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
}

module.exports = { buildSeasonReport, companyScorecardToCsvRows, toCsvString };
