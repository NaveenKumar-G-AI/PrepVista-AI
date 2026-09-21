import { PositioningError } from "../errors";
import { PositioningDataSource } from "../types/integrationPorts";
import { NarrativePort } from "../ai/narrativePort";
import { rankCapabilitiesByRelevance, pickStrongestEvidence } from "./relevanceEngine";
import { detectAllGaps } from "./gapEngine";
import { rankProjects } from "./projectRankingEngine";
import { selectBestStory } from "./storyEngine";
import { detectDifferentiators } from "./differentiatorEngine";
import {
  Capability,
  PositioningConfidence,
  PositioningProfile,
  PositioningStrength,
  RoleRequirement,
} from "../types/domain";

export interface ComputeParams {
  studentId: string;
  roleId: string;
  opportunityId?: string;
  dataSource: PositioningDataSource;
  narrativePort: NarrativePort;
  previousVersion?: number;
}

/**
 * The P0 pipeline from spec section 91:
 * target role -> role requirements -> student evidence -> best relevant
 * evidence -> positioning -> positioning gap -> best project -> best story.
 *
 * Every field on the returned profile traces back to something read from
 * dataSource — nothing is invented here (spec section 47).
 */
export async function computePositioningProfile(params: ComputeParams): Promise<PositioningProfile> {
  const { studentId, roleId, opportunityId, dataSource, narrativePort } = params;

  const role = await dataSource.getRoleById(roleId);
  if (!role) {
    throw new PositioningError("ROLE_NOT_FOUND", `Target role "${roleId}" was not found.`, 404);
  }

  let requirements: RoleRequirement[] = role.requirements;
  if (opportunityId) {
    const opportunity = await dataSource.getOpportunity(opportunityId);
    if (opportunity) requirements = mergeRequirements(role.requirements, opportunity.requirements);
  }

  const [capabilities, projects, stories, snapshot] = await Promise.all([
    dataSource.getCapabilities(studentId),
    dataSource.getProjects(studentId),
    dataSource.getStories(studentId),
    dataSource.getProfileMaterialsSnapshot(studentId),
  ]);

  const rankedCapabilities = rankCapabilitiesByRelevance(capabilities, requirements);
  const strongestEvidence = pickStrongestEvidence(rankedCapabilities);
  const gaps = detectAllGaps({ requirements, capabilities, rankedCapabilities, projects, stories, snapshot });
  const { best: bestProject, second: secondBestProject } = rankProjects(projects, requirements);
  const bestStory = bestProject ? selectBestStory(stories, bestProject.project) : null;
  const differentiators = detectDifferentiators(capabilities, projects);
  const positioningStrength = computeStrength(strongestEvidence, gaps);
  const { confidence, confidenceExplanation } = computeConfidence(strongestEvidence);

  const narrative = await narrativePort.composePositionStatement({
    role,
    strongestEvidence,
    differentiators,
    positioningStrength,
  });

  return {
    studentId,
    targetRoleId: roleId,
    targetRoleName: role.name,
    opportunityId,
    primaryPosition: narrative.text,
    narrativeSource: narrative.source,
    strongestEvidence,
    differentiators,
    gaps,
    bestProject,
    secondBestProject,
    bestStory,
    positioningStrength,
    confidence,
    confidenceExplanation,
    generatedAt: new Date().toISOString(),
    version: (params.previousVersion ?? 0) + 1,
  };
}

function mergeRequirements(roleReqs: RoleRequirement[], opportunityReqs: RoleRequirement[]): RoleRequirement[] {
  const byName = new Map(roleReqs.map((r) => [r.name.toLowerCase(), r]));
  for (const r of opportunityReqs) byName.set(r.name.toLowerCase(), r); // opportunity specifics win
  return [...byName.values()];
}

function computeStrength(strongestEvidence: Capability[], gaps: { type: string }[]): PositioningStrength {
  if (strongestEvidence.length === 0) return "insufficient-data";
  const skillGaps = gaps.filter((g) => g.type === "skill").length;
  if (strongestEvidence.length >= 3 && skillGaps === 0) return "strong";
  if (strongestEvidence.length >= 2) return "moderate";
  return "developing";
}

function computeConfidence(
  strongestEvidence: Capability[]
): { confidence: PositioningConfidence; confidenceExplanation: string } {
  const validatedCount = strongestEvidence.filter((c) => c.evidenceStrength === "validated").length;
  const distinctSources = new Set(strongestEvidence.flatMap((c) => c.evidenceSourceIds)).size;

  if (validatedCount >= 2 && distinctSources >= 2) {
    return { confidence: "high", confidenceExplanation: "Multiple independent evidence sources support this positioning." };
  }
  if (strongestEvidence.length > 0) {
    return {
      confidence: "medium",
      confidenceExplanation: "Some evidence supports this positioning, but from limited sources so far.",
    };
  }
  return { confidence: "low", confidenceExplanation: "Not enough validated evidence yet to support confident positioning." };
}
