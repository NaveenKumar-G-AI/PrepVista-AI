import { ANTI_GAMING } from './config.js';
import type { SkillEvidence } from './types.js';

export interface SuspiciousPatternResult {
  suspicious: boolean;
  reason?: string;
}

/**
 * PHASE 16: flag (never silently reject) evidence that looks like farming —
 * a burst of resubmissions on the same problem in a short window. Flagged
 * evidence is still stored (PHASE 47: immutable history); masteryCalculation's
 * repetition discount already reduces its weight. This flag exists for
 * trainer/TPO visibility and for gap-diagnosis context, not for accusing
 * or punishing the student (PHASE 16 explicitly warns against that).
 */
export function detectSuspiciousPattern(
  candidate: Pick<SkillEvidence, 'problemId' | 'createdAt'>,
  recentEvidenceSameStudent: Pick<SkillEvidence, 'problemId' | 'createdAt'>[]
): SuspiciousPatternResult {
  if (!candidate.problemId) return { suspicious: false };

  const windowMs = ANTI_GAMING.rapidRepeatWindowMinutes * 60 * 1000;
  const candidateTime = new Date(candidate.createdAt).getTime();

  const burst = recentEvidenceSameStudent.filter(
    (e) => e.problemId === candidate.problemId && Math.abs(candidateTime - new Date(e.createdAt).getTime()) <= windowMs
  );

  if (burst.length >= ANTI_GAMING.rapidRepeatFlagThreshold) {
    return {
      suspicious: true,
      reason: `${burst.length} submissions for the same problem within ${ANTI_GAMING.rapidRepeatWindowMinutes} minutes.`,
    };
  }
  return { suspicious: false };
}
