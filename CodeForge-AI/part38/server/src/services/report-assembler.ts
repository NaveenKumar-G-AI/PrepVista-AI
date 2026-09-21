import crypto from "node:crypto";
import {
  EvidenceStrength,
  GapStatus,
  MASTERY_LEVEL_ORDER,
  MasteryLevel,
  ReportFreshnessStatus,
  ReportLifecycleStatus,
  ReportType,
} from "../domain/enums";
import type {
  Growth,
  SkillGapEntry,
  SkillMasteryEntry,
  Strength,
  TechnicalMasteryReportDto,
  Weakness,
} from "../domain/dto";
import type { CollectedReportData } from "./report-data-collector";

/**
 * Turns collected port data into the validated DTO shape (minus narrative,
 * attached separately by the narrative service — see
 * report-generation-service.ts).
 *
 * IMPORTANT — what this file is and is NOT allowed to do (brief §2, §34-35):
 * it may only select, label, and cross-reference values that already came
 * from a port. The only synthesis here is presentational: "strengths" are
 * skills the Mastery System already rated PROFICIENT+ with decent evidence;
 * "weaknesses" are skills the Role Skill Gap Analysis already flagged. No
 * mastery level, readiness value, or gap is invented, upgraded, or
 * downgraded anywhere in this file.
 */
export function assembleReportDto(
  data: CollectedReportData,
  meta: { reportId: string; reportType: ReportType; schemaVersion: string; generatedById: string },
): Omit<TechnicalMasteryReportDto, "narrative"> {
  const skills: SkillMasteryEntry[] = data.skills.map((s) => ({
    skillId: s.skillId,
    skillName: s.skillName,
    masteryLevel: s.masteryLevel,
    trend: s.trend,
    evidenceStrength: s.evidenceStrength,
    evidenceCount: s.evidenceCount,
    lastEvaluatedAt: s.lastEvaluatedAt,
    roleRelevance: s.roleRelevance,
    gapStatus: computeGapStatus(s.skillName, data),
  }));

  const roles = data.roleReadiness.map((r) => ({
    roleId: r.roleId,
    roleName: r.roleName,
    readiness: r.readiness,
    readyAreas: r.readyAreas,
    developingAreas: r.developingAreas,
    blockingGaps: r.blockingGaps,
  }));

  const gaps: SkillGapEntry[] = [...data.gapsByRole.values()].flat().map((g) => ({
    skillId: g.skillId,
    skillName: g.skillName,
    roleId: g.roleId,
    roleName: g.roleName,
    currentState: g.currentState,
    expectedState: g.expectedState,
    gap: g.gap,
    evidenceRefs: g.evidenceRefs,
    roleImpact: g.roleImpact,
    recommendedAction: g.recommendedAction,
  }));

  const growth: Growth = {
    timeline: data.growthTimeline,
    fastestImproving: data.growthInsights.fastestImproving,
    stable: data.growthInsights.stable,
    persistentGaps: data.growthInsights.persistentGaps,
    recentlyImproved: data.growthInsights.recentlyImproved,
    insufficientData: data.growthInsights.insufficientData,
  };

  const strengths = deriveStrengths(skills, data);
  const weaknesses = deriveWeaknesses(gaps);

  const primaryRole = roles[0] ?? null;

  return {
    metadata: {
      reportId: meta.reportId,
      reportType: meta.reportType,
      schemaVersion: meta.schemaVersion,
      sourceDataVersion: data.sourceDataVersion,
      generatedAt: new Date().toISOString(),
      generatedById: meta.generatedById,
      status: ReportLifecycleStatus.COMPLETED,
    },
    identity: {
      studentId: data.student.id,
      studentName: data.student.name,
    },
    organization: {
      orgId: data.organization.id,
      orgName: data.organization.name,
    },
    summary: {
      overallMastery: data.overallMastery,
      targetRole: primaryRole?.roleName ?? null,
      roleReadiness: primaryRole?.readiness ?? null,
      strongestAreas: strengths.slice(0, 3).map((s) => s.skill),
      criticalGaps: gaps.filter((g) => g.roleImpact.toLowerCase().includes("blocking")).map((g) => g.skillName),
      recentGrowthHighlight: describeRecentGrowth(growth),
      nextBestAction: data.nextBestActions[0]?.action ?? null,
    },
    mastery: {
      overallLevel: data.overallMastery,
    },
    skills,
    roles,
    gaps,
    evidence: {
      coding: data.coding,
      debugging: data.debugging,
      reasoning: data.reasoning,
      projects: data.projects,
      interviews: data.interviews,
    },
    growth,
    strengths,
    weaknesses,
    recommendations: data.nextBestActions,
    freshness: ReportFreshnessStatus.UP_TO_DATE, // true at generation time by definition; recomputed live on read (see report-cache.ts)
  };
}

function computeGapStatus(skillName: string, data: CollectedReportData): GapStatus {
  const allGaps = [...data.gapsByRole.values()].flat();
  const matching = allGaps.filter((g) => g.skillName === skillName);
  if (matching.length === 0) return GapStatus.NOT_APPLICABLE;
  const blocking = matching.some((g) => g.roleImpact.toLowerCase().includes("blocking"));
  return blocking ? GapStatus.BLOCKING_GAP : GapStatus.GAP;
}

function deriveStrengths(skills: SkillMasteryEntry[], data: CollectedReportData): Strength[] {
  const strongEnough = new Set([MasteryLevel.PROFICIENT, MasteryLevel.ADVANCED, MasteryLevel.EXPERT]);
  const strongEvidence = new Set([EvidenceStrength.MODERATE, EvidenceStrength.STRONG]);

  return skills
    .filter((s) => strongEnough.has(s.masteryLevel) && strongEvidence.has(s.evidenceStrength))
    .sort((a, b) => MASTERY_LEVEL_ORDER.indexOf(b.masteryLevel) - MASTERY_LEVEL_ORDER.indexOf(a.masteryLevel))
    .map((s) => ({
      title: `${s.skillName} — ${titleCase(s.masteryLevel)}`,
      evidenceRefs: buildEvidenceRefs(s.skillName, data),
      skill: s.skillName,
      roleRelevance: s.roleRelevance,
    }));
}

function deriveWeaknesses(gaps: SkillGapEntry[]): Weakness[] {
  return gaps.map((g) => ({
    title: `${g.skillName} — ${titleCase(g.currentState)}`,
    evidenceRefs: g.evidenceRefs,
    impact: g.roleImpact,
    recommendedAction: g.recommendedAction,
  }));
}

function buildEvidenceRefs(skillName: string, data: CollectedReportData): string[] {
  const refs: string[] = [];
  if (data.coding) refs.push("Coding evidence");
  const project = data.projects.find((p) => p.skillsDemonstrated.includes(skillName));
  if (project) refs.push(`Project: ${project.projectName}`);
  const interview = data.interviews.find((i) => i.evaluatedSkills.includes(skillName));
  if (interview) refs.push(`Interview: ${interview.interviewName}`);
  return refs.length > 0 ? refs : ["Skill assessment history"];
}

function describeRecentGrowth(growth: Growth): string | null {
  if (growth.insufficientData || growth.timeline.length === 0) return null;
  const latest = growth.timeline[growth.timeline.length - 1];
  if (!latest) return null;
  return `${latest.skillName} moved from ${titleCase(latest.fromLevel)} to ${titleCase(latest.toLevel)}`;
}

function titleCase(level: string): string {
  return level.charAt(0) + level.slice(1).toLowerCase();
}

export function newReportId(): string {
  return crypto.randomUUID();
}
