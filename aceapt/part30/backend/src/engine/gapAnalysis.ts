import type { StudentCapabilityState, TargetRequirement } from "../domain/types.js";

export interface CapabilityGap {
  capabilityCode: string;
  requiredLevel: number;
  currentLevel: number;
  gap: number; // requiredLevel - currentLevel, floor 0
  weight: number;
  minEvidence: number;
  evidenceCount: number;
  evidenceSufficient: boolean;
  severity: number; // gap * weight, the priority-analysis score (Section 10 "priority")
}

/**
 * Section 10: PERSONALIZED PATH GENERATION.
 * Pure function -- takes the target's requirements and the student's
 * current rolled-up capability state and returns every gap, ranked by
 * severity (gap size weighted by how much the target cares about it).
 * A capability the student has never touched (no state row) is treated as
 * a full gap starting at 0, which is the honest reading of "no evidence yet".
 */
export function computeGaps(
  requirements: TargetRequirement[],
  states: StudentCapabilityState[]
): CapabilityGap[] {
  const byCapability = new Map(states.map((s) => [s.capabilityCode, s]));

  const gaps = requirements.map((req): CapabilityGap => {
    const state = byCapability.get(req.capabilityCode);
    const currentLevel = state?.level ?? 0;
    const evidenceCount = state?.evidenceCount ?? 0;
    const gap = Math.max(0, req.requiredLevel - currentLevel);
    return {
      capabilityCode: req.capabilityCode,
      requiredLevel: req.requiredLevel,
      currentLevel,
      gap,
      weight: req.weight,
      minEvidence: req.minEvidence,
      evidenceCount,
      evidenceSufficient: evidenceCount >= req.minEvidence,
      severity: gap * req.weight,
    };
  });

  return gaps.sort((a, b) => b.severity - a.severity);
}

/** The single highest-severity gap that still has room to close (Section 10 "priority"). */
export function topGap(gaps: CapabilityGap[]): CapabilityGap | null {
  const open = gaps.filter((g) => g.gap > 0.5);
  return open[0] ?? null;
}
