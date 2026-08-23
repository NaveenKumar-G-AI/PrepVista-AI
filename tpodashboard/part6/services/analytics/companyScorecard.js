'use strict';

const { OFFER_STATUSES } = require('../offers/offerStateMachine');
const { JOINING_STATUSES } = require('../joining/joiningStateMachine');
const { groupOffersByDimension } = require('./segments');
const { computeFunnel } = require('./funnel');
const { getCtcDistribution } = require('./distribution');

/**
 * "Company comparison" (spec section 46), built specifically around what
 * a TPO uses it for: deciding which companies to prioritize inviting
 * back. Offer volume alone is a vanity metric - a company that extends
 * 50 offers but has a 40% joining rate is worth less to the institution
 * than one that extends 10 offers with a 95% joining rate. This surfaces
 * both, plus CTC, per company.
 *
 * @param {object[]} offers
 * @param {object[]} joiningRecords
 * @param {{minGroupSizeForCtc?: number}} [opts]
 */
function computeCompanyScorecard(offers, joiningRecords, { minGroupSizeForCtc = 5 } = {}) {
  const byCompany = groupOffersByDimension(offers, (o) => o.companyId);
  const joiningByOfferId = new Map(joiningRecords.map((j) => [j.offerId, j]));

  const rows = [];
  for (const [companyId, companyOffers] of byCompany) {
    const funnel = computeFunnel(companyOffers);
    const accepted = companyOffers.filter((o) => o.status === OFFER_STATUSES.ACCEPTED);
    const joined = accepted.filter((o) => joiningByOfferId.get(o.id)?.status === JOINING_STATUSES.JOINED);
    const didNotJoin = accepted.filter((o) => joiningByOfferId.get(o.id)?.status === JOINING_STATUSES.DID_NOT_JOIN);

    rows.push({
      companyId,
      offersExtended: companyOffers.length,
      acceptanceRate: funnel.acceptanceRate,
      declineRate: funnel.declineRate,
      joiningRate: accepted.length > 0 ? joined.length / accepted.length : null,
      didNotJoinCount: didNotJoin.length,
      ctc: getCtcDistribution(
        companyOffers.map((o) => o.ctcTotalMinor),
        { minGroupSize: minGroupSizeForCtc }
      ),
    });
  }

  return rows.sort((a, b) => b.offersExtended - a.offersExtended);
}

module.exports = { computeCompanyScorecard };
