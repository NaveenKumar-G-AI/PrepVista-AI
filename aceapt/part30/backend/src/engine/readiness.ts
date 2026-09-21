import type { PathMilestone, ReadinessDimension, StudentCapabilityState, TargetRequirement } from "../domain/types.js";

/**
 * Section 20: READINESS DISTANCE. Each capability's contribution is capped
 * at 100% of its own requirement before averaging -- overshooting one
 * requirement must never mask falling short on another. That would let a
 * strong capability quietly buy down a real, unrelated gap, which is
 * exactly the kind of fabricated-confidence number Section 21 rules out.
 */
export function calculateReadiness(requirements: TargetRequirement[], states: StudentCapabilityState[]): number {
  if (requirements.length === 0) return 0;
  const byCapability = new Map(states.map((s) => [s.capabilityCode, s]));
  let weightedSum = 0;
  let weightTotal = 0;
  for (const req of requirements) {
    const level = byCapability.get(req.capabilityCode)?.level ?? 0;
    const ratio = req.requiredLevel > 0 ? Math.min(1, level / req.requiredLevel) : 1;
    weightedSum += ratio * req.weight;
    weightTotal += req.weight;
  }
  if (weightTotal === 0) return 0;
  return round1((weightedSum / weightTotal) * 100);
}

/** Section 21: capability / application / transfer / proof, each with its share of the remaining gap. */
export function calculateReadinessDimensions(
  requirements: TargetRequirement[],
  states: StudentCapabilityState[],
  milestones: PathMilestone[],
  targetReadiness: number
): ReadinessDimension[] {
  const byCapability = new Map(states.map((s) => [s.capabilityCode, s]));
  const weighted = (pick: (s: StudentCapabilityState) => number) => {
    let sum = 0;
    let wt = 0;
    for (const req of requirements) {
      const s = byCapability.get(req.capabilityCode);
      sum += (s ? pick(s) : 0) * req.weight;
      wt += req.weight;
    }
    return wt > 0 ? sum / wt : 0;
  };

  const criticalMilestones = milestones.filter((m) => m.critical);
  const proofCurrent =
    criticalMilestones.length > 0
      ? (100 * criticalMilestones.filter((m) => m.status === "VERIFIED" || m.status === "MASTERED").length) /
        criticalMilestones.length
      : 0;

  const raw: Array<{ key: ReadinessDimension["key"]; label: string; current: number }> = [
    { key: "capability", label: "Capability", current: round1(weighted((s) => s.accuracy)) },
    { key: "application", label: "Application", current: round1(weighted((s) => s.speed)) },
    { key: "transfer", label: "Transfer", current: round1(weighted((s) => s.transfer)) },
    { key: "proof", label: "Proof", current: round1(proofCurrent) },
  ];

  const deficits = raw.map((d) => Math.max(0, targetReadiness - d.current));
  const totalDeficit = deficits.reduce((a, b) => a + b, 0);

  return raw.map((d, i) => ({
    key: d.key,
    label: d.label,
    current: d.current,
    target: targetReadiness,
    gapContribution: totalDeficit > 0 ? round2(deficits[i] / totalDeficit) : 0,
  }));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
