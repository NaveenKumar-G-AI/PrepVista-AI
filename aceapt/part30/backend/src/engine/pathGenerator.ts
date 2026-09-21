import type { Capability, EvidenceRequirement, TargetRequirement } from "../domain/types.js";

export interface StageTemplateEntry {
  key: string;
  name: string;
  sequence: number;
  categories: string[] | "ALL";
  dimension: "accuracy" | "speed" | "transfer" | "level";
  barMultiplier: number; // fraction of the target's required level this stage checks against
}

export interface TargetPathTemplate {
  targetCode: string;
  stages: StageTemplateEntry[];
}

/**
 * Section 9: "Do not hardcode this exact sequence... make stages
 * configurable. Different targets may require different pathways." Two
 * targets get curated stage sequences below; anything else falls back to
 * DEFAULT_TEMPLATE. This is the seam a real integration would replace with
 * a config table, without touching the generation logic that consumes it.
 */
export const STAGE_TEMPLATES: TargetPathTemplate[] = [
  {
    targetCode: "data-analyst",
    stages: [
      { key: "foundation", name: "Foundation", sequence: 1, categories: ["quantitative", "logical"], dimension: "accuracy", barMultiplier: 0.8 },
      { key: "capability", name: "Data Capability", sequence: 2, categories: ["data"], dimension: "accuracy", barMultiplier: 0.85 },
      { key: "application", name: "Technical Application", sequence: 3, categories: ["technical"], dimension: "accuracy", barMultiplier: 0.85 },
      { key: "timed_performance", name: "Timed Performance", sequence: 4, categories: "ALL", dimension: "speed", barMultiplier: 0.85 },
      { key: "transfer", name: "Transfer", sequence: 5, categories: "ALL", dimension: "transfer", barMultiplier: 0.85 },
      { key: "proof", name: "Proof", sequence: 6, categories: "ALL", dimension: "level", barMultiplier: 1.0 },
    ],
  },
  {
    targetCode: "software-developer",
    stages: [
      { key: "foundation", name: "Foundation", sequence: 1, categories: ["quantitative", "logical"], dimension: "accuracy", barMultiplier: 0.8 },
      { key: "capability", name: "Programming Capability", sequence: 2, categories: ["programming"], dimension: "accuracy", barMultiplier: 0.85 },
      { key: "application", name: "DSA Application", sequence: 3, categories: ["dsa"], dimension: "accuracy", barMultiplier: 0.85 },
      { key: "timed_performance", name: "Timed Problem Solving", sequence: 4, categories: "ALL", dimension: "speed", barMultiplier: 0.85 },
      { key: "transfer", name: "Transfer", sequence: 5, categories: "ALL", dimension: "transfer", barMultiplier: 0.85 },
      { key: "proof", name: "Proof", sequence: 6, categories: "ALL", dimension: "level", barMultiplier: 1.0 },
    ],
  },
];

export const DEFAULT_TEMPLATE: TargetPathTemplate = {
  targetCode: "default",
  stages: [
    { key: "foundation", name: "Foundation", sequence: 1, categories: "ALL", dimension: "accuracy", barMultiplier: 0.75 },
    { key: "application", name: "Application", sequence: 2, categories: "ALL", dimension: "speed", barMultiplier: 0.85 },
    { key: "transfer", name: "Transfer", sequence: 3, categories: "ALL", dimension: "transfer", barMultiplier: 0.85 },
    { key: "proof", name: "Proof", sequence: 4, categories: "ALL", dimension: "level", barMultiplier: 1.0 },
  ],
};

export function resolveTemplate(targetCode: string): TargetPathTemplate {
  return STAGE_TEMPLATES.find((t) => t.targetCode === targetCode) ?? DEFAULT_TEMPLATE;
}

export interface GeneratedMilestone {
  stageKey: string;
  name: string;
  requiredCapabilities: string[];
  evidenceRequirements: EvidenceRequirement[];
  priority: number;
  critical: boolean;
}

/** A capability's weight is what decides whether skipping its milestone is even offered (Section 34). */
const CRITICAL_WEIGHT_THRESHOLD = 0.15;
/** The Proof stage only re-gates the capabilities the target actually cares most about -- not every capability again. */
const PROOF_STAGE_TOP_N = 2;

export function generateMilestones(
  template: TargetPathTemplate,
  requirements: TargetRequirement[],
  capabilities: Capability[]
): GeneratedMilestone[] {
  const capByCode = new Map(capabilities.map((c) => [c.code, c]));
  const sortedByWeight = [...requirements].sort((a, b) => b.weight - a.weight);
  const milestones: GeneratedMilestone[] = [];

  for (const stage of template.stages) {
    const inStage =
      stage.categories === "ALL"
        ? sortedByWeight
        : sortedByWeight.filter((r) => stage.categories.includes(capByCode.get(r.capabilityCode)?.category ?? ""));

    const stageRequirements = stage.key === "proof" ? inStage.slice(0, PROOF_STAGE_TOP_N) : inStage;

    for (const req of stageRequirements) {
      const cap = capByCode.get(req.capabilityCode);
      if (!cap) continue;
      milestones.push({
        stageKey: stage.key,
        name: `${cap.name} -- ${stage.name}`,
        requiredCapabilities: [cap.code],
        evidenceRequirements: [
          {
            capabilityCode: cap.code,
            dimension: stage.dimension,
            minValue: Math.round(req.requiredLevel * stage.barMultiplier),
            minEvidenceCount: req.minEvidence,
          },
        ],
        priority: Math.round((1 - req.weight) * 100), // higher weight -> lower number -> higher priority
        critical: stage.key === "proof" || req.weight >= CRITICAL_WEIGHT_THRESHOLD,
      });
    }
  }

  return milestones;
}
