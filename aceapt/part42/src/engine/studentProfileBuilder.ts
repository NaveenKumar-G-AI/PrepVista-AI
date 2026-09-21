import type { Blueprint, CapabilityStatus, ConfidenceCalibrationEntry, DiagnosticConfidenceState, QuestionDifficulty, StudentDiagnosticProfile } from "../types/domain.js";
import { descendantSkills } from "./blueprint.js";
import { estimateAllNodes, deriveStatus, type SkillEvidencePoint } from "./capabilityEstimator.js";
import { analyzeConsistency } from "./consistency.js";
import { assessConfidenceCalibration } from "./confidence.js";
import { computeSpeedProfile } from "./speedProfile.js";
import { computeAccuracyProfile } from "./accuracyProfile.js";
import { computeDifficultyProfile } from "./difficultyProfile.js";
import { detectBottlenecks } from "./bottleneckDetection.js";
import { buildEvidenceTrace } from "./explainability.js";
import { buildRecommendations } from "./recommendationEngine.js";

export interface ProfileResponsePoint {
  skillNodeId: string;
  isCorrect: boolean | null;
  durationMs: number;
  expectedDurationMs: number;
  difficulty: QuestionDifficulty;
  confidence?: number;
  evidenceWeight: number;
  createdAt: string;
}

export interface ProfileBuildInput {
  sessionId: string;
  studentId: string;
  blueprint: Blueprint;
  responses: ProfileResponsePoint[];
  prerequisiteGraph?: Map<string, string[]>;
}

const CONFIDENCE_RANK: Record<DiagnosticConfidenceState, number> = {
  incomplete: 0,
  low: 1,
  conflicted: 2,
  moderate: 3,
  high: 4,
};

function groupBySkill(responses: ProfileResponsePoint[]): Map<string, ProfileResponsePoint[]> {
  const map = new Map<string, ProfileResponsePoint[]>();
  for (const r of responses) {
    const arr = map.get(r.skillNodeId) ?? [];
    arr.push(r);
    map.set(r.skillNodeId, arr);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return map;
}

function pooledForNode(blueprint: Blueprint, nodeId: string, bySkill: Map<string, ProfileResponsePoint[]>): ProfileResponsePoint[] {
  return descendantSkills(blueprint, nodeId).flatMap((leaf) => bySkill.get(leaf.id) ?? []);
}

export function buildStudentProfile(input: ProfileBuildInput): StudentDiagnosticProfile {
  const { blueprint, responses } = input;
  const bySkill = groupBySkill(responses);

  const evidenceBySkill = new Map<string, SkillEvidencePoint[]>();
  const consistencyFlagBySkill = new Map<string, boolean>();
  const consistencyResults = [];

  for (const [skillId, rs] of bySkill.entries()) {
    evidenceBySkill.set(
      skillId,
      rs.map((r) => ({ isCorrect: r.isCorrect, evidenceWeight: r.evidenceWeight })),
    );
    const chronologicalCorrectness = rs.filter((r) => r.isCorrect !== null).map((r) => r.isCorrect as boolean);
    const consistency = analyzeConsistency(skillId, chronologicalCorrectness);
    consistencyResults.push(consistency);
    consistencyFlagBySkill.set(skillId, !consistency.isConsistent);
  }

  const allEstimates = estimateAllNodes(blueprint, evidenceBySkill, consistencyFlagBySkill);
  const estimatesBySkillId = new Map(allEstimates.filter((e) => e.nodeLevel === "skill").map((e) => [e.skillNodeId, e]));

  const domainProfiles = allEstimates.filter((e) => e.nodeLevel === "domain");
  const topicProfiles = allEstimates.filter((e) => e.nodeLevel === "topic");
  const subtopicProfiles = allEstimates.filter((e) => e.nodeLevel === "subtopic");
  const skillProfiles = allEstimates.filter((e) => e.nodeLevel === "skill");

  const withEvidence = skillProfiles.filter((e) => e.confidenceState !== "incomplete");
  const strengths = [...withEvidence]
    .filter((e) => e.status === "strong" || e.status === "solid")
    .sort((a, b) => b.pointEstimate - a.pointEstimate)
    .slice(0, 5);
  const weaknesses = [...withEvidence]
    .filter((e) => e.status === "needs_focus" || e.status === "developing")
    .sort((a, b) => a.pointEstimate - b.pointEstimate)
    .slice(0, 5);

  const speedProfile = domainProfiles.map((d) =>
    computeSpeedProfile(
      d.skillNodeId,
      pooledForNode(blueprint, d.skillNodeId, bySkill).map((r) => ({ durationMs: r.durationMs, expectedDurationMs: r.expectedDurationMs })),
    ),
  );

  const accuracyProfile = domainProfiles.map((d) =>
    computeAccuracyProfile(
      d.skillNodeId,
      pooledForNode(blueprint, d.skillNodeId, bySkill)
        .filter((r) => r.isCorrect !== null)
        .map((r) => ({ isCorrect: r.isCorrect as boolean, durationMs: r.durationMs, expectedDurationMs: r.expectedDurationMs })),
    ),
  );

  const difficultyBoundaries = domainProfiles.map((d) =>
    computeDifficultyProfile(
      d.skillNodeId,
      pooledForNode(blueprint, d.skillNodeId, bySkill)
        .filter((r) => r.isCorrect !== null)
        .map((r) => ({ difficulty: r.difficulty, isCorrect: r.isCorrect as boolean })),
    ),
  );

  const confidenceCalibration: ConfidenceCalibrationEntry[] = domainProfiles.map((d) => {
    const observations = pooledForNode(blueprint, d.skillNodeId, bySkill)
      .filter((r) => r.isCorrect !== null && r.confidence !== undefined)
      .map((r) => ({ confidence: r.confidence as 1 | 2 | 3 | 4 | 5, isCorrect: r.isCorrect as boolean }));
    const result = assessConfidenceCalibration(observations);
    return {
      scopeNodeId: d.skillNodeId,
      pattern: result.pattern,
      highConfidenceWrongRate: result.highConfidenceWrongRate,
      lowConfidenceCorrectRate: result.lowConfidenceCorrectRate,
    };
  });

  const bottlenecks = detectBottlenecks(blueprint, estimatesBySkillId, input.prerequisiteGraph);

  const evidenceTraces = skillProfiles
    .filter((e) => e.confidenceState !== "incomplete")
    .map((e) =>
      buildEvidenceTrace(
        e,
        (bySkill.get(e.skillNodeId) ?? []).map((r) => ({
          isCorrect: r.isCorrect,
          durationMs: r.durationMs,
          expectedDurationMs: r.expectedDurationMs,
          confidence: r.confidence,
        })),
      ),
    );

  const recommendedNextStep = buildRecommendations(skillProfiles, bottlenecks);

  const overallConfidence = domainProfiles.reduce<DiagnosticConfidenceState>(
    (worst, d) => (CONFIDENCE_RANK[d.confidenceState] < CONFIDENCE_RANK[worst] ? d.confidenceState : worst),
    domainProfiles.length > 0 ? domainProfiles[0]!.confidenceState : "incomplete",
  );

  const evidencedDomains = domainProfiles.filter((d) => d.confidenceState !== "incomplete");
  const overallStatus: CapabilityStatus | "incomplete" =
    evidencedDomains.length > 0
      ? deriveStatus(evidencedDomains.reduce((s, d) => s + d.pointEstimate, 0) / evidencedDomains.length, overallConfidence)
      : "incomplete";

  return {
    sessionId: input.sessionId,
    studentId: input.studentId,
    overallStatus,
    overallConfidence,
    domainProfiles,
    topicProfiles,
    subtopicProfiles,
    skillProfiles,
    strengths,
    weaknesses,
    speedProfile,
    accuracyProfile,
    difficultyBoundaries,
    consistency: consistencyResults,
    confidenceCalibration,
    bottlenecks,
    evidenceTraces,
    recommendedNextStep,
    generatedAt: new Date().toISOString(),
  };
}
