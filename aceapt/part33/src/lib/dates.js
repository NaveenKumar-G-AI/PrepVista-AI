'use strict';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function daysBetween(fromIso, toIso) {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  return (to.getTime() - from.getTime()) / MS_PER_DAY;
}

/**
 * Days remaining until deadlineIso, measured from nowIso (defaults to now).
 * Returns null when there's no deadline to measure against - callers must
 * treat "unknown" differently from "zero days left" (spec section 58/79).
 */
function daysUntil(deadlineIso, nowIso = new Date().toISOString()) {
  if (!deadlineIso) return null;
  return daysBetween(nowIso, deadlineIso);
}

module.exports = { daysBetween, daysUntil, MS_PER_DAY };
