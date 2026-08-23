/**
 * Flags students holding one or more UNCONFIRMED offers (extended, not
 * yet accepted) past a grace period. Under most institutional
 * one-or-two-offer policies, these students are quietly occupying slots
 * other students are waiting on — a real, recurring TPO headache that
 * doesn't show up in readiness or risk scoring at all.
 *
 * @param {{studentId: string, offers: Array}[]} studentsWithOffers
 * @param {number} [graceDays=7]  how long an offer can sit unconfirmed
 *   before it's worth flagging — a student deciding overnight isn't a
 *   problem, one still undecided after three weeks is.
 */
function findUnconfirmedOfferHolders(studentsWithOffers, { graceDays = 7 } = {}) {
  const results = [];

  for (const { studentId, offers } of studentsWithOffers) {
    const unconfirmed = offers.filter((o) => !o.accepted);
    if (unconfirmed.length === 0) continue;

    const oldest = unconfirmed.reduce((acc, o) => (new Date(o.offeredAt) < new Date(acc.offeredAt) ? o : acc));
    const daysSinceOldest = (Date.now() - new Date(oldest.offeredAt).getTime()) / 86400000;

    if (daysSinceOldest >= graceDays) {
      results.push({
        studentId,
        unconfirmedCount: unconfirmed.length,
        totalOffersHeld: offers.length,
        oldestOfferDriveId: oldest.driveId,
        daysSinceOldestOffer: Math.round(daysSinceOldest),
      });
    }
  }

  return results.sort((a, b) => b.daysSinceOldestOffer - a.daysSinceOldestOffer);
}

module.exports = { findUnconfirmedOfferHolders };
