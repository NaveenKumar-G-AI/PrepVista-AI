/**
 * Technical Profile Builder
 * Builds versioned integration contracts from CodeForge authoritative data
 */
import { prisma } from '../../lib/prisma';
import { intelligenceEngine } from '../intelligence';
import { TechnicalProfile, TechnicalSkill, MasteryLevel, RoleReadiness, SkillGap, Growth, TechnicalEvidenceSummary, AssessmentSummary, InterviewEvidenceSummary, SharingScope } from '@prepvista/shared';
import { CONTRACT_VERSION, SUPPORTED_CONTRACT_VERSIONS } from '@prepvista/shared';

interface ProfileBuildOptions {
  studentId: string;
  sharingScope: SharingScope;
  externalStudentId?: string;
  organizationId: string;
  contractVersion?: string;
}

const MASTERY_LEVELS = [
  { min: 80, level: 'EXPERT' as const },
  { min: 65, level: 'ADVANCED' as const },
  { min: 50, level: 'PROFICIENT' as const },
  { min: 30, level: 'DEVELOPING' as const },
  { min: 0, level: 'EMERGING' as const },
] as const;

function calculateMasteryLevel(proficiency: number | null): MasteryLevel['level'] {
  if (proficiency === null) return 'EMERGING';
  for (const { min, level } of MASTERY_LEVELS) {
    if (proficiency >= min) return level;
  }
  return 'EMERGING';
}

function calculateSeverity(gap: number): SkillGap['severity'] {
  if (gap >= 40) return 'CRITICAL';
  if (gap >= 20) return 'MODERATE';
  return 'MILD';
}

export async function buildTechnicalProfile(options: ProfileBuildOptions): Promise<TechnicalProfile> {
  const { studentId, sharingScope, externalStudentId, organizationId, contractVersion = CONTRACT_VERSION } = options;

  if (!SUPPORTED_CONTRACT_VERSIONS.includes(contractVersion)) {
    throw new Error(`Unsupported contract version: ${contractVersion}`);
  }

  // Get student with college
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { college: true },
  });

  if (!student) {
    throw new Error(`Student ${studentId} not found`);
  }

  // Get roles
  const roles = student.targetRole ? [student.targetRole] : [];

  // Get skill graph from intelligence engine
  const skillGraph = await intelligenceEngine.getSkillGraph(studentId);

  // Build skills array (filtered by sharing scope)
  const skills: TechnicalSkill[] = skillGraph
    .filter(s => s.proficiency !== null || sharingScope !== 'MINIMAL')
    .map(s => ({
      skillId: s.id,
      name: s.name,
      category: s.category,
      proficiency: s.proficiency,
      confidence: s.confidence,
      evidenceCount: s.evidenceCount,
      lastUpdated: new Date().toISOString(), // Would use actual last evidence date
    }));

  // Build mastery array
  const mastery: MasteryLevel[] = skillGraph
    .filter(s => s.proficiency !== null)
    .map(s => ({
      skillId: s.id,
      skillName: s.name,
      level: calculateMasteryLevel(s.proficiency),
      confidence: s.confidence,
      evidenceSummary: `${s.evidenceCount} evidence points`,
      trend: s.proficiency !== null && s.proficiency > 70 ? 'IMPROVING' : 'STABLE',
    }));

  // Get weaknesses for gaps
  const weaknesses = await intelligenceEngine.getWeaknesses(studentId);

  // Build gaps array
  const gaps: SkillGap[] = weaknesses.map(w => ({
    skillId: w.skillId,
    skillName: w.skillName,
    category: w.category,
    currentProficiency: 0, // Would calculate from evidence
    targetProficiency: 70, // Target for proficiency
    gap: 70,
    severity: w.severity,
    recommendedActions: [`Improve ${w.skillName} through targeted practice`],
    confidence: w.confidence,
  }));

  // Get readiness from intelligence engine
  const readinessSnapshot = await intelligenceEngine.getReadinessSnapshot(studentId);

  // Build readiness array
  const readiness: RoleReadiness[] = readinessSnapshot.dimensionScores
    .filter(d => d.score > 0 || sharingScope !== 'MINIMAL')
    .map(d => ({
      role: roles[0] || 'Software Engineer',
      overallReadiness: readinessSnapshot.overallReadiness,
      dimensionScores: readinessSnapshot.dimensionScores.map(ds => ({
        dimension: ds.dimension,
        score: ds.score,
        weight: 1, // Simplified
      })),
      topGaps: gaps.slice(0, 3).map(g => ({
        skillId: g.skillId,
        skillName: g.skillName,
        currentLevel: g.currentProficiency,
        targetLevel: g.targetProficiency,
        gap: g.gap,
        priority: g.severity === 'CRITICAL' ? 10 : g.severity === 'MODERATE' ? 5 : 2,
      })),
      confidence: readinessSnapshot.evidenceConfidence,
      lastCalculated: readinessSnapshot.lastAssessmentDate || new Date().toISOString(),
    }));

  // Build growth array
  const growth: Growth[] = [];

  // Get evidence summary
  const evidence = await prisma.skillEvidence.findMany({ where: { studentId } });
  const assessments = await prisma.assessment.findMany({
    where: { studentId, status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
  });

  const evidenceSummary: TechnicalEvidenceSummary = {
    assessmentCount: assessments.length,
    interviewCount: 0, // Would come from interview system
    projectCount: 0,   // Would come from project system
    totalEvidencePoints: evidence.length,
    highConfidenceEvidence: evidence.filter(e => e.confidence === 'HIGH' || e.confidence === 'MEDIUM').length,
    skillCoverage: skills.length > 0 ? Math.round((skills.filter(s => s.evidenceCount > 0).length / skills.length) * 100) : 0,
    lastEvidenceDate: evidence.length > 0 ? evidence[0].createdAt.toISOString() : null,
  };

  // Build assessment summary
  const byType: Record<string, { count: number; avgScore: number | null }> = {};
  for (const a of assessments) {
    if (!byType[a.type]) byType[a.type] = { count: 0, avgScore: null };
    byType[a.type].count++;
    if (a.overallScore !== null) {
      byType[a.type].avgScore = byType[a.type].avgScore === null
        ? a.overallScore
        : (byType[a.type].avgScore + a.overallScore) / 2;
    }
  }

  const assessmentSummary: AssessmentSummary = {
    totalAssessments: assessments.length,
    completedAssessments: assessments.filter(a => a.status === 'COMPLETED').length,
    averageScore: assessments.length > 0
      ? Math.round(assessments.reduce((sum, a) => sum + (a.overallScore || 0), 0) / assessments.length)
      : null,
    byType,
    recentTrend: readinessSnapshot.trendDirection,
    lastAssessmentDate: assessments[0]?.completedAt?.toISOString() || null,
  };

  // Build interview evidence summary (placeholder - would come from interview system)
  const interviewEvidenceSummary: InterviewEvidenceSummary = {
    totalInterviews: 0,
    technicalInterviews: 0,
    behavioralInterviews: 0,
    avgTechnicalScore: null,
    avgBehavioralScore: null,
    keyStrengths: [],
    keyWeaknesses: [],
    lastInterviewDate: null,
  };

  return {
    version: contractVersion,
    studentId,
    externalStudentId,
    organizationId,
    roles,
    skills,
    mastery,
    gaps,
    readiness,
    growth,
    evidenceSummary,
    assessmentSummary,
    interviewEvidenceSummary,
    metadata: {
      generatedAt: new Date().toISOString(),
      dataVersion: '1.0',
      contractVersion,
      sharingScope,
    },
  };
}

/**
 * Filters technical profile by sharing scope
 */
export function filterProfileByScope(profile: TechnicalProfile, scope: SharingScope): TechnicalProfile {
  const filtered = { ...profile };

  switch (scope) {
    case 'MINIMAL':
      filtered.skills = [];
      filtered.mastery = [];
      filtered.gaps = [];
      filtered.growth = [];
      filtered.evidenceSummary = { ...profile.evidenceSummary, skillCoverage: 0 };
      filtered.assessmentSummary = { ...profile.assessmentSummary, byType: {} };
      filtered.interviewEvidenceSummary = undefined;
      break;
    case 'STANDARD':
      filtered.growth = [];
      filtered.interviewEvidenceSummary = undefined;
      break;
    case 'DETAILED':
      // Include all
      break;
    case 'FULL':
      // Include all
      break;
  }

  filtered.metadata.sharingScope = scope;
  return filtered;
}