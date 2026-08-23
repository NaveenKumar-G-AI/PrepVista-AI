'use strict';

const { computeFunnel, computeOfferToJoiningFunnel } = require('./funnel');
const { getCtcDistribution } = require('./distribution');

/**
 * Part 6 doesn't own student/department/batch data (spec section 6), so
 * "department comparison" can't hardcode a department field - the caller
 * supplies a resolver, e.g. `(offer) => departmentByStudentId[offer.studentId]`.
 * This one function is what backs department, batch, AND role comparison
 * (role comparison just passes `(offer) => offer.roleTitle`, which Part 6
 * DOES own) - spec sections 44-46 describe these as separate features,
 * but they're the same computation over a different key.
 *
 * @param {(offer: object) => string} dimensionResolver
 */
function groupOffersByDimension(offers, dimensionResolver) {
  const groups = new Map();
  for (const offer of offers) {
    const key = dimensionResolver(offer) ?? 'UNKNOWN';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(offer);
  }
  return groups;
}

/**
 * @param {object[]} offers
 * @param {(offer: object) => string} dimensionResolver
 * @param {{joiningRecords?: object[], ctcField?: string, minGroupSizeForCtc?: number}} [opts]
 * @returns sorted largest-group-first, so the TPO sees the segments with
 *   the most students first rather than alphabetically
 */
function compareSegments(
  offers,
  dimensionResolver,
  { joiningRecords = [], ctcField = 'ctcTotalMinor', minGroupSizeForCtc = 5 } = {}
) {
  const groups = groupOffersByDimension(offers, dimensionResolver);
  const rows = [];
  for (const [dimensionValue, groupOffers] of groups) {
    rows.push({
      dimensionValue,
      offerCount: groupOffers.length,
      funnel: computeFunnel(groupOffers),
      offerToJoining: computeOfferToJoiningFunnel(groupOffers, joiningRecords),
      ctc: getCtcDistribution(
        groupOffers.map((o) => o[ctcField]),
        { minGroupSize: minGroupSizeForCtc }
      ),
    });
  }
  return rows.sort((a, b) => b.offerCount - a.offerCount);
}

module.exports = { groupOffersByDimension, compareSegments };
