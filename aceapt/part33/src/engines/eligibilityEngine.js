'use strict';

const ELIGIBILITY_STATES = Object.freeze({
  ELIGIBLE: 'ELIGIBLE',
  LIKELY_ELIGIBLE: 'LIKELY_ELIGIBLE',
  UNCERTAIN: 'UNCERTAIN',
  NOT_ELIGIBLE: 'NOT_ELIGIBLE',
});

// Coarse ordering so "final year or beyond" checks can be evaluated as >=.
const GRAD_ORDER = ['not_graduated', 'final_year', 'graduated'];

/**
 * Parses free-text eligibility statements into discrete, checkable rules.
 * Deliberately conservative: only recognizes explicit, common patterns, and
 * anything else is left as an unstructured note rather than guessed at
 * (spec section 13: "Trust is more important than aggressive matching").
 */
function extractEligibilityChecks(eligibilityText) {
  const checks = [];
  const unstructuredNotes = [];
  if (!eligibilityText || !eligibilityText.trim()) {
    return { checks, unstructuredNotes };
  }
  const text = eligibilityText.toLowerCase();

  // Graduation / degree status
  if (/final[- ]year/.test(text)) {
    checks.push({ type: 'graduation_status', operator: 'at_least', value: 'final_year', sourceText: eligibilityText });
  } else if (/(bachelor|degree|graduate\b|graduation)/.test(text)) {
    checks.push({ type: 'graduation_status', operator: 'at_least', value: 'graduated', sourceText: eligibilityText });
  }

  // Experience
  const noExpMatch = /(no prior|no professional|fresher|entry[- ]level|0\s*years?)/.test(text);
  const yearsMatch = text.match(/(\d+)\s*\+?\s*years?/);
  if (yearsMatch) {
    checks.push({ type: 'experience_years', operator: 'min', value: parseInt(yearsMatch[1], 10), sourceText: eligibilityText });
  } else if (noExpMatch) {
    checks.push({ type: 'experience_years', operator: 'max', value: 0, sourceText: eligibilityText });
  }

  // Location - only fires on explicit residency/authorization phrasing.
  // A generic "in <Capitalized words>" pattern is too easily confused with
  // a field of study ("degree in Computer Science") or org name, so this
  // stays narrow on purpose.
  const remoteMatch = /remote/.test(text);
  const locationPhraseMatch = eligibilityText.match(
    /\b(?:based in|residing in|resident of|located in|authorized to work in|citizens? of|work authorization in)\s+([A-Z][a-zA-Z.]+(?:\s+[A-Z][a-zA-Z.]+)*)/i,
  );
  if (!remoteMatch && locationPhraseMatch) {
    checks.push({ type: 'location', operator: 'equals_region', value: locationPhraseMatch[1], sourceText: eligibilityText });
  }

  if (checks.length === 0) {
    unstructuredNotes.push(eligibilityText);
  }
  return { checks, unstructuredNotes };
}

function evaluateCheck(check, student) {
  switch (check.type) {
    case 'graduation_status': {
      if (!student.graduationStatus) {
        return { status: 'NEEDS_CONFIRMATION', reason: `Requires ${check.value.replace('_', ' ')} status or beyond - your graduation status isn't set.` };
      }
      const requiredIdx = GRAD_ORDER.indexOf(check.value);
      const studentIdx = GRAD_ORDER.indexOf(student.graduationStatus);
      if (studentIdx === -1) {
        return { status: 'NEEDS_CONFIRMATION', reason: 'Your graduation status could not be interpreted.' };
      }
      if (studentIdx >= requiredIdx) {
        return { status: 'PASS', reason: `Your graduation status (${student.graduationStatus.replace('_', ' ')}) meets this requirement.` };
      }
      return { status: 'FAIL', reason: `This opportunity requires ${check.value.replace('_', ' ')} status or beyond; your profile shows ${student.graduationStatus.replace('_', ' ')}.` };
    }
    case 'experience_years': {
      if (student.experienceYears === null || student.experienceYears === undefined) {
        return { status: 'NEEDS_CONFIRMATION', reason: 'The experience requirement needs confirmation - your profile has no experience value set.' };
      }
      if (check.operator === 'max') {
        if (student.experienceYears <= check.value) return { status: 'PASS', reason: 'You meet the experience requirement (entry-level).' };
        return { status: 'FAIL', reason: `This opportunity is entry-level (max ${check.value} years); your profile shows ${student.experienceYears} years.` };
      }
      if (student.experienceYears >= check.value) return { status: 'PASS', reason: `You meet the ${check.value}+ year experience requirement.` };
      return { status: 'FAIL', reason: `This opportunity requires ${check.value}+ years of experience; your profile shows ${student.experienceYears}.` };
    }
    case 'location': {
      if (!student.locationPref) {
        return { status: 'NEEDS_CONFIRMATION', reason: `This opportunity references ${check.value} - confirm this fits your location plans.` };
      }
      if (student.locationPref.toLowerCase().includes(check.value.toLowerCase())) {
        return { status: 'PASS', reason: 'Your location preference matches this opportunity.' };
      }
      return { status: 'NEEDS_CONFIRMATION', reason: `This opportunity references ${check.value} - confirm this fits your location plans.` };
    }
    default:
      return { status: 'NEEDS_CONFIRMATION', reason: 'An eligibility condition needs manual review.' };
  }
}

/**
 * Determines this opportunity's eligibility state for a given student.
 * Never guesses on hard requirements (spec sections 11-13): a missing
 * profile field produces UNCERTAIN, never a silent pass.
 */
function analyzeEligibility({ eligibilityText, student }) {
  const { checks, unstructuredNotes } = extractEligibilityChecks(eligibilityText);

  if (checks.length === 0) {
    return {
      state: ELIGIBILITY_STATES.UNCERTAIN,
      reasons: unstructuredNotes.length
        ? [`Eligibility text couldn't be structured automatically ("${unstructuredNotes[0]}"). Needs manual review.`]
        : ['No eligibility information was provided by the source.'],
      checks: [],
    };
  }

  const evaluated = checks.map((c) => ({ ...c, ...evaluateCheck(c, student) }));
  const anyFail = evaluated.find((c) => c.status === 'FAIL');
  if (anyFail) {
    return { state: ELIGIBILITY_STATES.NOT_ELIGIBLE, reasons: [anyFail.reason], checks: evaluated };
  }

  const unconfirmed = evaluated.filter((c) => c.status === 'NEEDS_CONFIRMATION');
  if (unconfirmed.length > 0) {
    const hardTypes = new Set(['graduation_status', 'experience_years']);
    const hasHardUnconfirmed = unconfirmed.some((c) => hardTypes.has(c.type));
    return {
      state: hasHardUnconfirmed ? ELIGIBILITY_STATES.UNCERTAIN : ELIGIBILITY_STATES.LIKELY_ELIGIBLE,
      reasons: unconfirmed.map((c) => c.reason),
      checks: evaluated,
    };
  }

  return { state: ELIGIBILITY_STATES.ELIGIBLE, reasons: evaluated.map((c) => c.reason), checks: evaluated };
}

module.exports = { ELIGIBILITY_STATES, analyzeEligibility, extractEligibilityChecks, evaluateCheck };
