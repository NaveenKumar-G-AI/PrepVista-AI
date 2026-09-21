import type {
  CodeForgeIntelligencePorts,
  CodingPerformanceRaw,
  DebuggingEvidenceRaw,
  GrowthEventRaw,
  GrowthInsightsRaw,
  InterviewEvidenceRaw,
  NextBestActionRaw,
  OrganizationRecord,
  ProjectEvidenceRaw,
  ReasoningEvidenceRaw,
  RoleReadinessRaw,
  SkillGapRaw,
  SkillMasteryEntryRaw,
  StudentRecord,
} from "../ports";
import { MasteryLevel } from "../domain/enums";

export class StudentNotFoundError extends Error {
  constructor(studentId: string) {
    super(`Student ${studentId} not found`);
    this.name = "StudentNotFoundError";
  }
}

export class OrganizationNotFoundError extends Error {
  constructor(orgId: string) {
    super(`Organization ${orgId} not found`);
    this.name = "OrganizationNotFoundError";
  }
}

/** Raw, pre-assembly bundle of everything the assembler needs. Nothing here is recalculated — it's a straight fetch per port (brief §14-15). */
export interface CollectedReportData {
  student: StudentRecord;
  organization: OrganizationRecord;
  sourceDataVersion: number;
  overallMastery: MasteryLevel | null;
  skills: SkillMasteryEntryRaw[];
  targetRoles: { id: string; name: string }[];
  roleReadiness: RoleReadinessRaw[];
  gapsByRole: Map<string, SkillGapRaw[]>;
  growthTimeline: GrowthEventRaw[];
  growthInsights: GrowthInsightsRaw;
  nextBestActions: NextBestActionRaw[];
  coding: CodingPerformanceRaw | null;
  debugging: DebuggingEvidenceRaw | null;
  reasoning: ReasoningEvidenceRaw | null;
  projects: ProjectEvidenceRaw[];
  interviews: InterviewEvidenceRaw[];
}

export async function collectReportData(
  ports: CodeForgeIntelligencePorts,
  studentId: string,
): Promise<CollectedReportData> {
  const student = await ports.identity.getStudent(studentId);
  if (!student) throw new StudentNotFoundError(studentId);

  const organization = await ports.identity.getOrganization(student.orgId);
  if (!organization) throw new OrganizationNotFoundError(student.orgId);

  const [sourceDataVersion, overallMastery, skills, targetRoles, growthTimeline, growthInsights, nextBestActions, coding, debugging, reasoning, projects, interviews] =
    await Promise.all([
      ports.dataVersion.getCurrentSourceDataVersion(studentId),
      ports.mastery.getOverallMastery(studentId),
      ports.mastery.getSkillMasteryMap(studentId),
      ports.roleReadiness.getTargetRoles(studentId),
      ports.growth.getGrowthTimeline(studentId),
      ports.growth.getGrowthInsights(studentId),
      ports.nextBestAction.getNextBestActions(studentId),
      ports.codingEvidence.getCodingPerformance(studentId),
      ports.codingEvidence.getDebuggingEvidence(studentId),
      ports.codingEvidence.getReasoningEvidence(studentId),
      ports.projectEvidence.getProjectEvidence(studentId),
      ports.interviewEvidence.getInterviewEvidence(studentId),
    ]);

  const roleReadiness: RoleReadinessRaw[] = [];
  const gapsByRole = new Map<string, SkillGapRaw[]>();
  for (const role of targetRoles) {
    const readiness = await ports.roleReadiness.getRoleReadiness(studentId, role.id);
    if (readiness) roleReadiness.push(readiness);
    const gaps = await ports.skillGap.getRoleSkillGaps(studentId, role.id);
    if (gaps.length > 0) gapsByRole.set(role.id, gaps);
  }

  return {
    student,
    organization,
    sourceDataVersion,
    overallMastery,
    skills,
    targetRoles,
    roleReadiness,
    gapsByRole,
    growthTimeline,
    growthInsights,
    nextBestActions,
    coding,
    debugging,
    reasoning,
    projects,
    interviews,
  };
}
