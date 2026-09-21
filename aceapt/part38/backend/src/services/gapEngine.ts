import {
  Capability,
  PositioningGap,
  ProfessionalStory,
  ProfileMaterialsSnapshot,
  ProjectEvidence,
  RoleRequirement,
} from "../types/domain";
import { normalize, RankedCapability } from "./relevanceEngine";
import { analyzeConsistency } from "./consistencyEngine";

export interface GapEngineInput {
  requirements: RoleRequirement[];
  capabilities: Capability[];
  rankedCapabilities: RankedCapability[];
  projects: ProjectEvidence[];
  stories: ProfessionalStory[];
  snapshot: ProfileMaterialsSnapshot;
}

export function detectAllGaps(input: GapEngineInput): PositioningGap[] {
  return [
    ...detectSkillGaps(input.capabilities, input.requirements),
    ...detectEvidenceGaps(input.capabilities),
    ...detectRelevanceGaps(input.rankedCapabilities),
    ...detectStoryGaps(input.projects, input.stories),
    ...detectCommunicationGaps(),
    ...detectConsistencyGaps(input.snapshot),
  ];
}

/** Category 1: a core requirement with no matching capability at all. */
function detectSkillGaps(capabilities: Capability[], requirements: RoleRequirement[]): PositioningGap[] {
  const have = new Set(capabilities.map((c) => normalize(c.name)));
  return requirements
    .filter((r) => r.importance === "core" && !have.has(normalize(r.name)))
    .map((r) => ({
      type: "skill" as const,
      title: `${r.name} — not yet represented`,
      explanation: `${r.name} is a core requirement for this role, but no related capability evidence was found in your profile yet.`,
    }));
}

/** Category 2: a claimed capability with no real evidence behind it (spec section 16). */
function detectEvidenceGaps(capabilities: Capability[]): PositioningGap[] {
  return capabilities
    .filter((c) => c.evidenceStrength === "insufficient" || c.evidenceStrength === "unknown")
    .map((c) => ({
      type: "evidence" as const,
      title: `${c.name} — evidence gap`,
      explanation: `${c.name} capability has not yet been sufficiently demonstrated in available evidence.`,
      relatedCapabilityId: c.id,
    }));
}

/** Category 4: real, validated evidence that isn't primary for THIS role (spec section 18). */
function detectRelevanceGaps(ranked: RankedCapability[]): PositioningGap[] {
  return ranked
    .filter(
      (r) =>
        r.score === 0 &&
        (r.capability.evidenceStrength === "validated" || r.capability.evidenceStrength === "demonstrated")
    )
    .slice(0, 3)
    .map((r) => ({
      type: "relevance" as const,
      title: `${r.capability.name} — not primary for this role`,
      explanation: `Relevant evidence exists for ${r.capability.name}, but it is not a primary requirement for this role and should not dominate positioning.`,
      relatedCapabilityId: r.capability.id,
    }));
}

/** Category 3: a validated project with no prepared explanation (spec section 17). */
function detectStoryGaps(projects: ProjectEvidence[], stories: ProfessionalStory[]): PositioningGap[] {
  const projectsWithStories = new Set(stories.map((s) => s.projectId));
  return projects
    .filter((p) => p.validated && !projectsWithStories.has(p.id))
    .map((p) => ({
      type: "story" as const,
      title: `${p.title} — no prepared story`,
      explanation: `"${p.title}" is validated project evidence, but no explanation of the problem, decisions, or result has been prepared yet.`,
    }));
}

/**
 * Category 5 (spec section 19). No interview-communication evidence source
 * is wired up yet — that would come from Feature 35. Kept as an explicit
 * stub, returning [], so the sixth category exists in the type system rather
 * than silently disappearing. Replace the body once interview evidence is
 * available.
 */
function detectCommunicationGaps(): PositioningGap[] {
  return [];
}

/** Category 6: materials that emphasize different directions (spec section 20). */
function detectConsistencyGaps(snapshot: ProfileMaterialsSnapshot): PositioningGap[] {
  const report = analyzeConsistency(snapshot);
  if (report.label === "consistent") return [];
  return [
    {
      type: "consistency" as const,
      title: "Positioning inconsistency across materials",
      explanation: report.explanation,
    },
  ];
}
