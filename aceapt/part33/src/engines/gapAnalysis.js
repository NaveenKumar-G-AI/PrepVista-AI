'use strict';

const { PROFICIENCY_SCORE, EVIDENCE_SCORE } = require('./matchingEngine');

const EVIDENCE_GAP_THRESHOLD_SCORE = 70;

/**
 * null = no capability gap. Otherwise 'low' | 'moderate' | 'high'.
 * Critical requirements get bumped up a level, since the same proficiency
 * shortfall matters more on a capability the opportunity treats as core.
 */
function proficiencyGapSeverity(proficiencyLevel, importance) {
  const score = PROFICIENCY_SCORE[proficiencyLevel || 'unknown'];
  if (score >= 90) return null;
  let severity = score >= 60 ? 'low' : score >= 30 ? 'moderate' : 'high';
  if (importance === 'critical' && severity === 'low') severity = 'moderate';
  return severity;
}

/**
 * Produces the required/preferred + capability/evidence gap breakdown for
 * one opportunity, and separates TARGET GAP (part of the student's general
 * preparation for their target) from OPPORTUNITY GAP (specific to this
 * posting) using real core-capability-list membership - spec section 22.
 */
function analyzeGaps({ requirements, studentCapabilities, coreCapabilityIds }) {
  const required = requirements.filter((r) => r.requirementType === 'required');
  const preferred = requirements.filter((r) => r.requirementType === 'preferred');

  const requiredRows = required.map((r) => {
    const sc = r.capabilityId ? studentCapabilities.find((s) => s.capabilityId === r.capabilityId) : null;
    const proficiencyLevel = sc ? sc.proficiencyLevel : 'unknown';
    const evidenceLevel = sc ? sc.evidenceLevel : 'unknown';
    const evidenceScore = EVIDENCE_SCORE[evidenceLevel];
    const capabilityGap = r.capabilityId ? proficiencyGapSeverity(proficiencyLevel, r.importance) : 'unmapped';
    const evidenceGap = r.capabilityId ? evidenceScore < EVIDENCE_GAP_THRESHOLD_SCORE : null;
    const isOpportunityGap = r.capabilityId ? !coreCapabilityIds.includes(r.capabilityId) : true;

    return {
      requirementId: r.id,
      capabilityId: r.capabilityId,
      label: r.sourceText,
      importance: r.importance,
      proficiencyLevel,
      capabilityGap,
      evidenceGap,
      gapType: isOpportunityGap ? 'opportunity' : 'target',
    };
  });

  const preferredRows = preferred.map((r) => {
    const sc = r.capabilityId ? studentCapabilities.find((s) => s.capabilityId === r.capabilityId) : null;
    return {
      requirementId: r.id,
      capabilityId: r.capabilityId,
      label: r.sourceText,
      proficiencyLevel: sc ? sc.proficiencyLevel : 'unknown',
      note: sc ? 'Already on your profile - a nice-to-have advantage.' : 'Not required - only helps if you already have it.',
    };
  });

  const hasGap = (r) => r.capabilityGap || r.evidenceGap;
  return {
    required: requiredRows,
    preferred: preferredRows,
    targetGaps: requiredRows.filter((r) => r.gapType === 'target' && hasGap(r)),
    opportunityGaps: requiredRows.filter((r) => r.gapType === 'opportunity' && hasGap(r)),
  };
}

module.exports = { analyzeGaps, proficiencyGapSeverity };
