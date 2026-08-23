'use strict';

const CONFLICT_TYPES = Object.freeze({
  STUDENT_MISMATCH: 'STUDENT_MISMATCH',
  COMPANY_MISMATCH: 'COMPANY_MISMATCH',
  DUPLICATE_OFFER: 'DUPLICATE_OFFER',
  CTC_INCONSISTENT: 'CTC_INCONSISTENT',
  JOINING_BEFORE_OFFER_DATE: 'JOINING_BEFORE_OFFER_DATE',
  DEADLINE_BEFORE_OFFER_DATE: 'DEADLINE_BEFORE_OFFER_DATE',
  DEADLINE_AFTER_JOINING_DATE: 'DEADLINE_AFTER_JOINING_DATE',
  STUDENT_NOT_SELECTED: 'STUDENT_NOT_SELECTED',
  DUPLICATE_IMPORT_ROW: 'DUPLICATE_IMPORT_ROW',
});

const SEVERITY = Object.freeze({ BLOCKING: 'BLOCKING', WARNING: 'WARNING' });

function conflict(type, severity, message, extra) {
  return { type, severity, message, ...extra };
}

/**
 * Non-terminal offers for the same student+company+drive count as a
 * duplicate. Terminal ones (declined/expired/withdrawn/cancelled) don't -
 * a student can legitimately get re-offered after declining, for example.
 */
function isActiveDuplicateOf(candidate, existing) {
  const TERMINAL = new Set(['DECLINED', 'EXPIRED', 'WITHDRAWN', 'CANCELLED']);
  return (
    existing.id !== candidate.id &&
    existing.studentId === candidate.studentId &&
    existing.companyId === candidate.companyId &&
    existing.driveId === candidate.driveId &&
    !TERMINAL.has(existing.status)
  );
}

/**
 * Pure function: given a candidate offer plus the context needed to check
 * it, return every conflict found. Never mutates, never picks a value on
 * the caller's behalf - that decision belongs to a human reviewer
 * (spec section 13: "Do not silently choose one value").
 *
 * @param {object} candidate - offer fields being created/updated
 * @param {{
 *   existingOffers: object[],
 *   hasFinalSelection: boolean,
 *   knownStudentId: string | null,
 *   knownCompanyId: string | null,
 *   allowUnselectedOverride?: boolean
 * }} context
 * @returns {Array<{type: string, severity: string, message: string}>}
 */
function detectOfferConflicts(candidate, context) {
  const issues = [];
  const {
    existingOffers = [],
    hasFinalSelection,
    knownStudentId = null,
    knownCompanyId = null,
    allowUnselectedOverride = false,
  } = context;

  if (knownStudentId && candidate.studentId && knownStudentId !== candidate.studentId) {
    issues.push(
      conflict(
        CONFLICT_TYPES.STUDENT_MISMATCH,
        SEVERITY.BLOCKING,
        `Offer references student ${candidate.studentId}, but resolved record is ${knownStudentId}.`
      )
    );
  }

  if (knownCompanyId && candidate.companyId && knownCompanyId !== candidate.companyId) {
    issues.push(
      conflict(
        CONFLICT_TYPES.COMPANY_MISMATCH,
        SEVERITY.BLOCKING,
        `Offer references company ${candidate.companyId}, but resolved record is ${knownCompanyId}.`
      )
    );
  }

  for (const existing of existingOffers) {
    if (isActiveDuplicateOf(candidate, existing)) {
      issues.push(
        conflict(
          CONFLICT_TYPES.DUPLICATE_OFFER,
          SEVERITY.BLOCKING,
          `An active offer (${existing.id}) already exists for this student/company/drive.`,
          { existingOfferId: existing.id }
        )
      );
    }
  }

  // Not every source provides a fixed/variable breakdown - the spec's own
  // bulk-import example (section 19) only has a single "CTC" column - so
  // the consistency check only applies once a breakdown was actually
  // supplied. Negative-value checks always apply to whatever was given.
  const hasBreakdown = candidate.ctcFixedMinor !== undefined || candidate.ctcVariableMinor !== undefined;
  const fixed = candidate.ctcFixedMinor ?? 0;
  const variable = candidate.ctcVariableMinor ?? 0;
  const total = candidate.ctcTotalMinor ?? 0;
  if (fixed < 0 || variable < 0 || total < 0) {
    issues.push(
      conflict(CONFLICT_TYPES.CTC_INCONSISTENT, SEVERITY.BLOCKING, 'CTC values cannot be negative.')
    );
  } else if (hasBreakdown && total !== 0 && fixed + variable !== total) {
    issues.push(
      conflict(
        CONFLICT_TYPES.CTC_INCONSISTENT,
        SEVERITY.WARNING,
        `Fixed (${fixed}) + variable (${variable}) does not equal total (${total}).`
      )
    );
  }

  if (candidate.offerDate && candidate.joiningDate && candidate.joiningDate < candidate.offerDate) {
    issues.push(
      conflict(
        CONFLICT_TYPES.JOINING_BEFORE_OFFER_DATE,
        SEVERITY.BLOCKING,
        'Joining date is before the offer date.'
      )
    );
  }

  if (
    candidate.offerDate &&
    candidate.acceptanceDeadline &&
    candidate.acceptanceDeadline < candidate.offerDate
  ) {
    issues.push(
      conflict(
        CONFLICT_TYPES.DEADLINE_BEFORE_OFFER_DATE,
        SEVERITY.BLOCKING,
        'Acceptance deadline is before the offer date.'
      )
    );
  }

  if (
    candidate.acceptanceDeadline &&
    candidate.joiningDate &&
    candidate.acceptanceDeadline > candidate.joiningDate
  ) {
    issues.push(
      conflict(
        CONFLICT_TYPES.DEADLINE_AFTER_JOINING_DATE,
        SEVERITY.WARNING,
        'Acceptance deadline falls after the joining date.'
      )
    );
  }

  if (!hasFinalSelection && !allowUnselectedOverride) {
    issues.push(
      conflict(
        CONFLICT_TYPES.STUDENT_NOT_SELECTED,
        SEVERITY.BLOCKING,
        'No verified final selection (Part 5) exists for this student/drive. Requires an audited TPO override.'
      )
    );
  }

  return issues;
}

function hasBlockingConflicts(issues) {
  return issues.some((i) => i.severity === SEVERITY.BLOCKING);
}

module.exports = {
  CONFLICT_TYPES,
  SEVERITY,
  detectOfferConflicts,
  hasBlockingConflicts,
};
