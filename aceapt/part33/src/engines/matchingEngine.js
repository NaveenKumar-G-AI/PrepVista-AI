'use strict';

const PROFICIENCY_SCORE = { limited: 15, developing: 55, strong: 95, unknown: 0 };
const EVIDENCE_SCORE = { none: 0, weak: 35, moderate: 70, strong: 100, unknown: 0 };
const IMPORTANCE_WEIGHT = { critical: 3, important: 2, nice_to_have: 1 };

const FIT_BANDS = [
  { min: 80, label: 'Strong' },
  { min: 60, label: 'Good' },
  { min: 40, label: 'Developing' },
  { min: 0, label: 'Weak' },
];

const GAP_BANDS = [
  { min: 90, label: 'None' },
  { min: 75, label: 'Small' },
  { min: 50, label: 'Moderate' },
  { min: 0, label: 'Large' },
];

function bandFromScore(score, bands) {
  for (const b of bands) {
    if (score >= b.min) return b.label;
  }
  return bands[bands.length - 1].label;
}

function weightedAverage(items, scoreFn) {
  if (items.length === 0) return null; // insufficient data - not the same as zero
  let total = 0;
  let totalWeight = 0;
  for (const item of items) {
    const weight = IMPORTANCE_WEIGHT[item.importance] || 1;
    total += scoreFn(item) * weight;
    totalWeight += weight;
  }
  return totalWeight === 0 ? null : total / totalWeight;
}

function computeCapabilityMatch(requirements, studentCapabilities) {
  const required = requirements.filter((r) => r.requirementType === 'required' && r.capabilityId);
  return weightedAverage(required, (r) => {
    const sc = studentCapabilities.find((s) => s.capabilityId === r.capabilityId);
    return PROFICIENCY_SCORE[sc ? sc.proficiencyLevel : 'unknown'];
  });
}

function computeEvidenceMatch(requirements, studentCapabilities) {
  const required = requirements.filter((r) => r.requirementType === 'required' && r.capabilityId);
  return weightedAverage(required, (r) => {
    const sc = studentCapabilities.find((s) => s.capabilityId === r.capabilityId);
    return EVIDENCE_SCORE[sc ? sc.evidenceLevel : 'unknown'];
  });
}

function computeTargetAlignment({ requirements, coreCapabilityIds }) {
  if (!coreCapabilityIds || coreCapabilityIds.length === 0) return null;
  const requiredCapIds = requirements.filter((r) => r.requirementType === 'required' && r.capabilityId).map((r) => r.capabilityId);
  if (requiredCapIds.length === 0) return null;
  const uniqueIds = new Set(requiredCapIds);
  const overlap = [...uniqueIds].filter((id) => coreCapabilityIds.includes(id));
  return Math.round((overlap.length / uniqueIds.size) * 100);
}

function computeTimelineFit(daysRemaining) {
  if (daysRemaining === null || daysRemaining === undefined) return { score: null, band: 'Unknown' };
  if (daysRemaining < 0) return { score: 0, band: 'Expired' };
  if (daysRemaining <= 3) return { score: 40, band: 'Tight' };
  if (daysRemaining <= 14) return { score: 75, band: 'Moderate' };
  return { score: 95, band: 'Comfortable' };
}

/**
 * Computes the multi-dimensional Opportunity Fit. Always returns the full
 * breakdown by dimension - never collapses straight to an unexplained
 * single percentage (spec sections 14-15, 67 - Explainable Matching).
 */
function computeMatch({ requirements, studentCapabilities, coreCapabilityIds, daysRemaining }) {
  const capabilityMatch = computeCapabilityMatch(requirements, studentCapabilities);
  const evidenceMatch = computeEvidenceMatch(requirements, studentCapabilities);
  const targetAlignment = computeTargetAlignment({ requirements, coreCapabilityIds });
  const timeline = computeTimelineFit(daysRemaining);

  const readinessScore = (capabilityMatch === null && evidenceMatch === null)
    ? null
    : 0.6 * (capabilityMatch ?? 0) + 0.4 * (evidenceMatch ?? 0);

  const components = [
    { score: targetAlignment, weight: 0.30 },
    { score: capabilityMatch, weight: 0.35 },
    { score: evidenceMatch, weight: 0.20 },
    { score: timeline.score, weight: 0.15 },
  ].filter((c) => c.score !== null && c.score !== undefined);

  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const fitScore = totalWeight > 0
    ? Math.round(components.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight)
    : null;

  const dim = (score) => (score === null || score === undefined
    ? { score: null, band: 'Unknown' }
    : { score: Math.round(score), band: bandFromScore(score, FIT_BANDS) });

  return {
    dimensions: {
      targetAlignment: dim(targetAlignment),
      capabilityMatch: dim(capabilityMatch),
      evidenceMatch: dim(evidenceMatch),
      readiness: dim(readinessScore),
      timelineFit: { score: timeline.score, band: timeline.band },
    },
    overallFit: fitScore === null ? { score: null, band: 'Unknown' } : { score: fitScore, band: bandFromScore(fitScore, FIT_BANDS) },
    readinessGapBand: readinessScore === null ? 'Unknown' : bandFromScore(readinessScore, GAP_BANDS),
  };
}

module.exports = {
  computeMatch, bandFromScore, FIT_BANDS, GAP_BANDS, PROFICIENCY_SCORE, EVIDENCE_SCORE,
};
