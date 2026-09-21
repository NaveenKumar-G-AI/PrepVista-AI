import { NextProofRecommendation, ReadinessGap, ValidationCatalogEntry } from '../types/domain';

function labelText(label: ReadinessGap['currentLabel']): string {
  switch (label) {
    case 'UNKNOWN':
      return 'not yet validated';
    case 'LIMITED':
      return 'limited';
    case 'DEVELOPING':
      return 'developing';
    case 'STRONG':
      return 'strong';
  }
}

/**
 * Recommends the single next-best proof for a student to go get, based on
 * the highest-ranked open gap (already sorted by importance then distance
 * by the readiness engine). Prefers a real catalog entry — a specific,
 * launchable validation activity supplied by the host platform (its
 * simulation/assessment/project catalog) — and only falls back to a
 * generic, still-honest description when no catalog entry exists yet for
 * that capability. It never invents a course, simulation, or score.
 */
export function recommendNextProof(gaps: ReadinessGap[], catalog: ValidationCatalogEntry[] = []): NextProofRecommendation | null {
  if (gaps.length === 0) return null;

  const top = gaps[0];
  const entry = catalog.find((c) => c.capabilityId === top.capabilityId);

  if (entry) {
    return {
      capabilityId: top.capabilityId,
      capabilityName: top.capabilityName,
      headline: entry.title,
      description: entry.description,
      ctaLabel: entry.ctaLabel,
      actionRef: entry.actionRef,
    };
  }

  return {
    capabilityId: top.capabilityId,
    capabilityName: top.capabilityName,
    headline: `Validate ${top.capabilityName}`,
    description: `Current evidence for ${top.capabilityName} is ${labelText(
      top.currentLabel
    )}, below the ${top.requiredLevel.toLowerCase()} level this role requires. A realistic, scored validation is the fastest way to close this gap.`,
    ctaLabel: `Prove ${top.capabilityName}`,
  };
}
