'use strict';

const KNOWN_OPPORTUNITY_TYPES = new Set([
  'job', 'internship', 'campus_placement', 'competition', 'hackathon',
  'apprenticeship', 'graduate_program', 'assessment', 'project', 'other',
]);

/**
 * Normalizes raw opportunity input - however it arrived (manual entry today;
 * a partner feed or future API tomorrow) - into ACEAPT's structured shape.
 * Every ingestion source should funnel through this before storage, so the
 * rest of the pipeline never has to care where the opportunity came from
 * (spec sections 6-8).
 */
function normalizeOpportunityInput(raw) {
  const rawType = (raw.opportunityType || 'other').toLowerCase().trim().replace(/\s+/g, '_');
  return {
    title: (raw.title || '').trim(),
    organization: (raw.organization || '').trim(),
    location: raw.location ? raw.location.trim() : null,
    workMode: raw.workMode ? raw.workMode.trim().toLowerCase() : null,
    opportunityType: KNOWN_OPPORTUNITY_TYPES.has(rawType) ? rawType : 'other',
    description: raw.description ? raw.description.trim() : null,
    requirementsText: raw.requirements ? raw.requirements.trim() : null,
    preferredRequirementsText: raw.preferredRequirements ? raw.preferredRequirements.trim() : null,
    eligibilityText: raw.eligibility ? raw.eligibility.trim() : null,
    deadline: raw.deadline || null,
    applicationMethod: raw.applicationMethod ? raw.applicationMethod.trim() : null,
    source: raw.source || 'manual_entry',
    sourceUrl: raw.sourceUrl || null,
    observedAt: raw.observedAt || new Date().toISOString(),
  };
}

module.exports = { normalizeOpportunityInput, KNOWN_OPPORTUNITY_TYPES };
