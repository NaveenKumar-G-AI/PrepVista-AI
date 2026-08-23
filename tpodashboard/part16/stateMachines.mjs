// PrepVista AI — status transition guards (Part 16 §34)
// Call canTransition/assertTransition before any status write — don't let
// a service set a status field directly.

export const TRANSITIONS = {
  drive: {
    draft: ['published', 'archived'],
    published: ['closed', 'archived'],
    closed: ['archived'],
    archived: [],
  },
  application: {
    eligible: ['applied', 'expired'],
    applied: ['withdrawn', 'shortlisted', 'rejected'],
    shortlisted: ['interviewing', 'rejected'],
    interviewing: ['selected', 'rejected'],
    selected: [],
    rejected: [],
    withdrawn: [],
    expired: [],
  },
  interview: {
    scheduled: ['completed', 'cancelled', 'no_show'],
    completed: [],
    cancelled: [],
    no_show: [],
  },
  offer: {
    published: ['accepted', 'declined', 'expired', 'revoked'],
    accepted: ['revoked'],
    declined: [],
    expired: [],
    revoked: [],
  },
  joining: {
    // §27: only reachable once the linked offer is 'accepted' — enforced
    // at the event layer via EVENT_ORDER_DEPENDENCIES in events.mjs, not
    // by this table alone.
    pending: ['confirmed', 'deferred', 'dropped'],
    confirmed: ['verified', 'dropped'],
    verified: [],
    deferred: ['confirmed', 'dropped'],
    dropped: [],
  },
  // §37/§39 — an AI action is never allowed to skip the confirm step.
  ai_action: {
    prepared: ['confirmed', 'discarded'],
    confirmed: ['executing'],
    executing: ['executed', 'failed'],
    executed: [],
    failed: ['prepared'], // retry re-enters at prepared, not executing
    discarded: [],
  },
};

export function canTransition(domain, from, to) {
  const allowed = TRANSITIONS[domain]?.[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

export function assertTransition(domain, from, to) {
  if (!canTransition(domain, from, to)) {
    throw new Error(`Illegal ${domain} transition: ${from} → ${to}`);
  }
}
