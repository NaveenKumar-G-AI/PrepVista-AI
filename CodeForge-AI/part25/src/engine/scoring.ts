import {
  ChallengeMetadata,
  StudentModel,
  SelectionObjectiveWeights,
  DifficultyDimensions,
  CandidateScoreBreakdown,
  ChallengeHealth,
  SelectionContext,
} from '../types';
import { difficultyDistance } from './difficultyAdaptation';

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function skillGapFit(challenge: ChallengeMetadata, student: StudentModel): number {
  const state = student.skills[challenge.primarySkillId];
  // A skill entirely absent from the student model likely hasn't been
  // introduced to this student's curriculum path yet (see the same
  // reasoning applied to level === 'UNKNOWN' in engine/pathIntent.ts) —
  // score it low rather than moderate, so an off-topic challenge can't
  // casually outrank a genuinely identified gap just because the system
  // has no opinion on it yet.
  if (!state) return 0.15;
  if (state.confidence < 0.4) return 0.3; // that's uncertaintyReduction's job, not this one's
  const gap = 100 - state.score;
  return clamp01(gap / 100) * clamp01(state.confidence + 0.2);
}

function uncertaintyReduction(challenge: ChallengeMetadata, student: StudentModel): number {
  const state = student.skills[challenge.primarySkillId];
  const confidence = state ? state.confidence : 0.1; // a truly unmodeled skill is maximally uncertain
  const base = clamp01(1 - confidence);
  return challenge.isDiagnostic ? clamp01(base * 1.3) : base;
}

function difficultyFit(challenge: ChallengeMetadata, target: DifficultyDimensions): number {
  const dist = difficultyDistance(challenge.difficulty, target);
  return clamp01(1 - dist / 140); // generous normalization across 8 dimensions
}

function transferValue(
  challenge: ChallengeMetadata,
  student: StudentModel,
  recentTransferGroups: Set<string>
): number {
  const state = student.skills[challenge.primarySkillId];
  if (challenge.familyTier !== 'TRANSFER') return 0.1;
  if (!state || state.level !== 'MASTERED') return 0.2;
  return recentTransferGroups.has(challenge.transferGroup) ? 0.4 : 1.0;
}

function retentionValue(challenge: ChallengeMetadata, student: StudentModel, now: number): number {
  const state = student.skills[challenge.primarySkillId];
  if (!state || !state.lastDemonstratedAt) return 0.1;
  if (state.level !== 'MASTERED' && state.level !== 'PROFICIENT') return 0.1;
  const days = (now - new Date(state.lastDemonstratedAt).getTime()) / 86_400_000;
  return clamp01(days / 90);
}

function noveltyScore(challenge: ChallengeMetadata, recentFamilies: string[]): number {
  const repeats = recentFamilies.filter((f) => f === challenge.challengeFamily).length;
  return clamp01(1 - repeats / 3);
}

function roleRelevance(challenge: ChallengeMetadata, student: StudentModel): number {
  if (!student.targetRole) return 0.6;
  if (challenge.targetRoles.length === 0) return 0.5;
  return challenge.targetRoles.includes(student.targetRole) ? 1.0 : 0.25;
}

function curriculumFit(challenge: ChallengeMetadata, student: StudentModel): number {
  const tags = student.curriculumConstraints?.requiredCurriculumTags;
  if (!tags || tags.length === 0) return 0.7;
  const overlap = challenge.curriculumTags.filter((t) => tags.includes(t)).length;
  return clamp01(overlap / tags.length);
}

function prerequisiteFit(challenge: ChallengeMetadata, student: StudentModel): number {
  if (challenge.prerequisites.length === 0) return 0.5;
  const freshlyUnlocked = challenge.prerequisites.some((p) => student.skills[p]?.level === 'PRACTICED');
  return freshlyUnlocked ? 0.9 : 0.5;
}

function estimatedTimeFit(challenge: ChallengeMetadata, ctx: SelectionContext): number {
  if (!ctx.availableTimeMinutes) return 0.7;
  const diff = Math.abs(challenge.estimatedTimeMinutes - ctx.availableTimeMinutes);
  return clamp01(1 - diff / 45);
}

function challengeQuality(health?: ChallengeHealth): number {
  return health ? clamp01(health.qualityMultiplier) : 0.8;
}

function engagementFit(challenge: ChallengeMetadata, recentFamilies: string[]): number {
  if (recentFamilies.length === 0) return 0.7;
  return recentFamilies[recentFamilies.length - 1] === challenge.challengeFamily ? 0.4 : 0.8;
}

function learningValue(challenge: ChallengeMetadata, student: StudentModel): number {
  const isCoreForRole = !!student.targetRole && challenge.targetRoles.includes(student.targetRole);
  const gap = skillGapFit(challenge, student);
  return clamp01(gap * (isCoreForRole ? 1.2 : 1.0));
}

export function scoreCandidate(
  challenge: ChallengeMetadata,
  student: StudentModel,
  weights: SelectionObjectiveWeights,
  target: DifficultyDimensions,
  ctx: SelectionContext,
  health: Record<string, ChallengeHealth>,
  recentFamilies: string[],
  recentTransferGroups: Set<string>,
  now: number = Date.now()
): CandidateScoreBreakdown {
  const components = {
    skillGapFit: skillGapFit(challenge, student),
    uncertaintyReduction: uncertaintyReduction(challenge, student),
    learningValue: learningValue(challenge, student),
    difficultyFit: difficultyFit(challenge, target),
    roleRelevance: roleRelevance(challenge, student),
    curriculumFit: curriculumFit(challenge, student),
    prerequisiteFit: prerequisiteFit(challenge, student),
    transferValue: transferValue(challenge, student, recentTransferGroups),
    retentionValue: retentionValue(challenge, student, now),
    novelty: noveltyScore(challenge, recentFamilies),
    estimatedTimeFit: estimatedTimeFit(challenge, ctx),
    challengeQuality: challengeQuality(health[challenge.challengeId]),
    engagementFit: engagementFit(challenge, recentFamilies),
  };

  let total = 0;
  for (const key of Object.keys(components) as (keyof typeof components)[]) {
    total += components[key] * weights[key];
  }

  return { challengeId: challenge.challengeId, totalScore: total, components };
}
