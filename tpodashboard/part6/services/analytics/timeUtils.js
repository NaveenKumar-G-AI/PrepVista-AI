'use strict';

/**
 * Both offers and joining records now carry a `statusHistory:
 * [{status, at}]` array (see offerService.js / joiningService.js). These
 * helpers work on either, since both share that shape - that's the whole
 * point of standardizing it.
 */

/**
 * @param {{statusHistory?: Array<{status:string, at:string}>, status?: string}} record
 * @param {string} status
 * @param {{last?: boolean}} [opts] - `last: true` finds the most recent
 *   time the record was in `status` (useful when a status can recur, e.g.
 *   UNDER_VERIFICATION after being sent back); default is the first time.
 */
function findStatusAt(record, status, { last = false } = {}) {
  const history = record.statusHistory ?? (record.status ? [{ status: record.status }] : []);
  const matches = history.filter((h) => h.status === status && h.at);
  if (matches.length === 0) return null;
  return last ? matches[matches.length - 1].at : matches[0].at;
}

/** Did the record ever pass through `status`, regardless of where it is now? */
function everReached(record, status) {
  const history = record.statusHistory ?? (record.status ? [{ status: record.status }] : []);
  return history.some((h) => h.status === status);
}

function diffHours(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const diff = (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 3600000;
  return Number.isFinite(diff) ? diff : null;
}

module.exports = { findStatusAt, everReached, diffHours };
