'use strict';

const { daysUntil, daysBetween } = require('../lib/dates');

/**
 * NEW / ACTIVE / AGING / EXPIRING / EXPIRED / UNKNOWN (spec section 59).
 * Deadline-based statuses take priority over observed-at-based ones once a
 * deadline exists, since "will this still be open" matters more than "when
 * did we first see it".
 */
function computeFreshnessStatus({ deadlineIso, observedAtIso, nowIso = new Date().toISOString() }) {
  if (deadlineIso) {
    const daysRemaining = daysUntil(deadlineIso, nowIso);
    if (daysRemaining < 0) return 'EXPIRED';
    if (daysRemaining <= 2) return 'EXPIRING';
    return 'ACTIVE';
  }
  if (observedAtIso) {
    const age = daysBetween(observedAtIso, nowIso);
    if (age <= 2) return 'NEW';
    if (age <= 21) return 'AGING';
    return 'UNKNOWN';
  }
  return 'UNKNOWN';
}

module.exports = { computeFreshnessStatus };
