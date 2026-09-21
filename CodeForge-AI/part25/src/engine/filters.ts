import { ChallengeMetadata, StudentModel, SelectionContext, ChallengeHealth } from '../types';

export interface FilterStageResult {
  stage: string;
  candidatesIn: number;
  candidatesOut: number;
  survivors: ChallengeMetadata[];
}

function prereqsSatisfied(challenge: ChallengeMetadata, student: StudentModel): boolean {
  if (challenge.prerequisites.length === 0) return true;
  return challenge.prerequisites.every((prereqId) => {
    const state = student.skills[prereqId];
    if (!state) return false;
    return state.level === 'PRACTICED' || state.level === 'PROFICIENT' || state.level === 'MASTERED';
  });
}

function alreadyCompleted(challenge: ChallengeMetadata, student: StudentModel): boolean {
  return student.completedChallenges.some((c) => c.challengeId === challenge.challengeId);
}

function curriculumAllows(challenge: ChallengeMetadata, student: StudentModel): boolean {
  const c = student.curriculumConstraints;
  if (!c) return true;

  if (c.requiredCurriculumTags && c.requiredCurriculumTags.length > 0) {
    const overlap = challenge.curriculumTags.some((t) => c.requiredCurriculumTags!.includes(t));
    if (!overlap) return false;
  }
  if (c.allowedLanguages && c.allowedLanguages.length > 0) {
    const langOk = challenge.supportedLanguages.some((l) => c.allowedLanguages!.includes(l));
    if (!langOk) return false;
  }
  if (c.difficultyCeiling) {
    for (const dim of Object.keys(c.difficultyCeiling) as (keyof ChallengeMetadata['difficulty'])[]) {
      const ceiling = c.difficultyCeiling[dim];
      if (typeof ceiling === 'number' && challenge.difficulty[dim] > ceiling) return false;
    }
  }
  if (c.assessmentWindow) {
    const now = Date.now();
    const start = new Date(c.assessmentWindow.start).getTime();
    const end = new Date(c.assessmentWindow.end).getTime();
    if (now < start || now > end) return false;
  }
  return true;
}

/** Stage 1: hard constraints that must never be violated. Applied before any soft ranking. */
export function applyHardConstraints(
  candidates: ChallengeMetadata[],
  student: StudentModel,
  ctx: SelectionContext,
  health: Record<string, ChallengeHealth>
): FilterStageResult {
  const survivors = candidates.filter((c) => {
    if (c.status !== 'ACTIVE') return false; // assessment-mode exceptions are instructor-configured upstream, not a silent bypass here
    if (ctx.language && !c.supportedLanguages.includes(ctx.language)) return false;
    if (student.targetRole && c.targetRoles.length > 0 && !c.targetRoles.includes(student.targetRole)) return false;
    if (!curriculumAllows(c, student)) return false;
    const h = health[c.challengeId];
    if (h && h.isFlaggedBroken) return false;
    return true;
  });
  return {
    stage: 'HARD_CONSTRAINTS',
    candidatesIn: candidates.length,
    candidatesOut: survivors.length,
    survivors,
  };
}

/** Stage 2: prerequisite graph. Diagnostic challenges are explicitly exempt. */
export function applyPrerequisiteFilter(
  candidates: ChallengeMetadata[],
  student: StudentModel
): FilterStageResult {
  const survivors = candidates.filter((c) => c.isDiagnostic || prereqsSatisfied(c, student));
  return {
    stage: 'PREREQUISITES',
    candidatesIn: candidates.length,
    candidatesOut: survivors.length,
    survivors,
  };
}

/** Stage 3: availability — challenges whose live health has degraded past usefulness drop out entirely rather than just scoring lower. */
export function applyAvailabilityFilter(
  candidates: ChallengeMetadata[],
  health: Record<string, ChallengeHealth>
): FilterStageResult {
  const survivors = candidates.filter((c) => {
    const h = health[c.challengeId];
    if (!h) return true;
    return h.qualityMultiplier > 0.15;
  });
  return {
    stage: 'AVAILABILITY',
    candidatesIn: candidates.length,
    candidatesOut: survivors.length,
    survivors,
  };
}

/** Stage 4: repetition policy — a completed challenge only resurfaces with an explicit, recognized reason. */
export function applyRepetitionFilter(
  candidates: ChallengeMetadata[],
  student: StudentModel,
  ctx: SelectionContext
): FilterStageResult {
  const survivors = candidates.filter((c) => {
    if (!alreadyCompleted(c, student)) return true;
    return !!ctx.requestedRepetitionReason;
  });
  return {
    stage: 'REPETITION',
    candidatesIn: candidates.length,
    candidatesOut: survivors.length,
    survivors,
  };
}
