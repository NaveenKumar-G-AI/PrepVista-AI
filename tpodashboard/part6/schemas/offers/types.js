'use strict';

/**
 * Shared domain types for the Offers -> Joining -> Placement Outcome module.
 *
 * These are JSDoc typedefs, not runtime code, so this module has zero
 * dependencies and works whether the host project is plain JS or TS
 * (via `checkJs`/`.d.ts` generation). If the host repo is already
 * TypeScript, these map almost 1:1 onto real `type`/`interface`
 * declarations - see the note at the bottom of this file.
 *
 * IMPORTANT: this module does NOT redefine student / company / drive /
 * application records. Those are owned by other parts (see README).
 * Everything here only stores *references* (ids) to them.
 */

/** @typedef {'INR'|'USD'|'EUR'|'GBP'|string} CurrencyCode */

/**
 * Money is always stored as an integer in the currency's smallest unit
 * (e.g. paise for INR, cents for USD) to avoid floating point drift in
 * salary math. `toMajorUnits`/`fromMajorUnits` below convert for display.
 * @typedef {number} MoneyMinor
 */

const EMPLOYMENT_TYPES = Object.freeze({
  FULL_TIME: 'FULL_TIME',
  INTERNSHIP: 'INTERNSHIP',
  INTERN_TO_FULL_TIME: 'INTERN_TO_FULL_TIME',
  CONTRACT: 'CONTRACT',
  OTHER: 'OTHER',
});

const WORK_MODES = Object.freeze({
  ONSITE: 'ONSITE',
  REMOTE: 'REMOTE',
  HYBRID: 'HYBRID',
});

/** How the offer entered PrepVista. Section 11 of the spec. */
const OFFER_SOURCES = Object.freeze({
  TPO_ENTERED: 'TPO_ENTERED',
  IMPORTED: 'IMPORTED',
  ADMIN_IMPORTED: 'ADMIN_IMPORTED',
  DOCUMENT_EXTRACTED: 'DOCUMENT_EXTRACTED',
  OTHER_APPROVED_SOURCE: 'OTHER_APPROVED_SOURCE',
});

/** Fine-grained verification state, orthogonal to the main offer status. */
const VERIFICATION_STATUSES = Object.freeze({
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  CONFLICT: 'CONFLICT',
  VERIFIED: 'VERIFIED',
});

const DOCUMENT_TYPES = Object.freeze({
  OFFER_LETTER: 'OFFER_LETTER',
  APPOINTMENT_DOCUMENT: 'APPOINTMENT_DOCUMENT',
  EMPLOYMENT_CONFIRMATION: 'EMPLOYMENT_CONFIRMATION',
  JOINING_LETTER: 'JOINING_LETTER',
  OTHER: 'OTHER',
});

const DECLINE_REASONS = Object.freeze({
  ACCEPTED_ANOTHER_OFFER: 'ACCEPTED_ANOTHER_OFFER',
  HIGHER_STUDIES: 'HIGHER_STUDIES',
  PERSONAL_REASON: 'PERSONAL_REASON',
  LOCATION: 'LOCATION',
  COMPENSATION: 'COMPENSATION',
  OTHER: 'OTHER',
});

const DID_NOT_JOIN_REASONS = Object.freeze({
  ACCEPTED_ANOTHER_OFFER: 'ACCEPTED_ANOTHER_OFFER',
  OFFER_WITHDRAWN: 'OFFER_WITHDRAWN',
  STUDENT_DECISION: 'STUDENT_DECISION',
  COMPANY_ISSUE: 'COMPANY_ISSUE',
  OTHER: 'OTHER',
});

/** Final normalized outcome. Section 36. Only ever set for terminal states -
 * an offer that is still live (verified/published/pending) has no outcome
 * row yet. See services/joining/placementOutcome.js for the derivation. */
const PLACEMENT_OUTCOMES = Object.freeze({
  PLACED_JOINED: 'PLACED_JOINED',
  PLACED_OFFER_ACCEPTED_JOINING_PENDING: 'PLACED_OFFER_ACCEPTED_JOINING_PENDING',
  SELECTED_NOT_OFFERED: 'SELECTED_NOT_OFFERED',
  OFFER_DECLINED: 'OFFER_DECLINED',
  OFFER_EXPIRED: 'OFFER_EXPIRED',
  DID_NOT_JOIN: 'DID_NOT_JOIN',
  UNPLACED: 'UNPLACED',
  HIGHER_STUDIES: 'HIGHER_STUDIES',
  ENTREPRENEURSHIP: 'ENTREPRENEURSHIP',
  NOT_SEEKING: 'NOT_SEEKING',
});

/**
 * @typedef {Object} Offer
 * @property {string} id
 * @property {string} institutionId
 * @property {string} seasonId
 * @property {string} studentId
 * @property {string=} applicationId
 * @property {string} driveId
 * @property {string} companyId
 * @property {string=} roleId          - FK into Part 3's role entity, if it maps 1:1
 * @property {string} roleTitle        - denormalized snapshot, always populated
 * @property {keyof typeof EMPLOYMENT_TYPES} employmentType
 * @property {keyof typeof WORK_MODES} workMode
 * @property {string} location
 * @property {string} offerDate        - ISO date
 * @property {string} acceptanceDeadline - ISO datetime, UTC
 * @property {string} joiningDate      - ISO date
 * @property {CurrencyCode} currency
 * @property {MoneyMinor} ctcTotalMinor
 * @property {MoneyMinor} ctcFixedMinor
 * @property {MoneyMinor=} ctcVariableMinor
 * @property {MoneyMinor=} stipendMinor
 * @property {string=} probationInfo
 * @property {string} status           - one of OFFER_STATUSES (see offerStateMachine.js)
 * @property {keyof typeof OFFER_SOURCES} source
 * @property {keyof typeof VERIFICATION_STATUSES} verificationStatus
 * @property {number} currentVersion
 * @property {boolean} hasFinalSelection - whether Part 5 recorded a matching final selection
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} JoiningRecord
 * @property {string} id
 * @property {string} offerId
 * @property {string} studentId
 * @property {string} expectedJoiningDate
 * @property {string=} confirmedJoiningDate
 * @property {string} status          - one of JOINING_STATUSES (see joiningStateMachine.js)
 * @property {string=} evidenceDocumentId
 * @property {string=} verifiedBy
 * @property {string=} verifiedAt
 * @property {string=} remarks
 * @property {string=} reason         - one of DID_NOT_JOIN_REASONS when status is DID_NOT_JOIN
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} PlacementOutcomeRecord
 * @property {string} id
 * @property {string} studentId
 * @property {string} seasonId
 * @property {string=} offerId
 * @property {keyof typeof PLACEMENT_OUTCOMES} outcome
 * @property {boolean} verified
 * @property {string=} verifiedBy
 * @property {string=} verifiedAt
 * @property {string} source          - 'DERIVED' | 'TPO_OVERRIDE'
 * @property {string} createdAt
 * @property {string} updatedAt
 */

function toMajorUnits(minor) {
  if (typeof minor !== 'number' || !Number.isFinite(minor)) return null;
  return minor / 100;
}

function fromMajorUnits(major) {
  return Math.round(major * 100);
}

module.exports = {
  EMPLOYMENT_TYPES,
  WORK_MODES,
  OFFER_SOURCES,
  VERIFICATION_STATUSES,
  DOCUMENT_TYPES,
  DECLINE_REASONS,
  DID_NOT_JOIN_REASONS,
  PLACEMENT_OUTCOMES,
  toMajorUnits,
  fromMajorUnits,
};

// --- TypeScript note -------------------------------------------------
// If your repo is TS, convert each `Object.freeze({...})` block above
// into a `const X = {...} as const` + `type X = typeof X[keyof typeof X]`
// pair, and lift the @typedef blocks into real `interface` declarations.
// The shapes are unchanged either way.
