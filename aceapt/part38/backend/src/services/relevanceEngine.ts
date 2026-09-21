import { Capability, RoleRequirement } from "../types/domain";

export interface RankedCapability {
  capability: Capability;
  score: number;
}

const IMPORTANCE_WEIGHT: Record<RoleRequirement["importance"], number> = {
  core: 3,
  supporting: 2,
  "nice-to-have": 1,
};

const STRENGTH_WEIGHT: Record<Capability["evidenceStrength"], number> = {
  validated: 4,
  demonstrated: 3,
  developing: 1,
  insufficient: 0.5,
  unknown: 0,
  conflicted: 0,
};

export function normalize(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Scores each capability against the role/opportunity requirements. A
 * capability that isn't mentioned in the requirements at all scores 0 — it
 * may still be real, validated evidence, but it isn't relevant to THIS
 * positioning (spec section 13: emphasis changes per role, underlying data
 * never does).
 */
export function rankCapabilitiesByRelevance(
  capabilities: Capability[],
  requirements: RoleRequirement[]
): RankedCapability[] {
  return capabilities
    .map((capability) => {
      const requirement = requirements.find((r) => normalize(r.name) === normalize(capability.name));
      const score = requirement
        ? IMPORTANCE_WEIGHT[requirement.importance] * STRENGTH_WEIGHT[capability.evidenceStrength]
        : 0;
      return { capability, score };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * "Strongest evidence" means relevant AND validated/demonstrated — never a
 * bare claim (spec section 3: claim, activity, and demonstration are not
 * equivalent).
 */
export function pickStrongestEvidence(ranked: RankedCapability[], limit = 5): Capability[] {
  return ranked
    .filter(
      (r) =>
        r.score > 0 &&
        (r.capability.evidenceStrength === "validated" || r.capability.evidenceStrength === "demonstrated")
    )
    .slice(0, limit)
    .map((r) => r.capability);
}
