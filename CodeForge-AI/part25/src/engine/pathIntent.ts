import { StudentModel, PathIntent, SkillState } from '../types';

const LOW_CONFIDENCE_THRESHOLD = 0.4;
const STALE_DAYS_THRESHOLD = 45;
const SKILL_GAP_SCORE_THRESHOLD = 60;

export interface SkillPriority {
  skillId: string;
  state: SkillState;
  priorityScore: number; // higher = more urgent to target next
  suggestedIntent: PathIntent;
}

function daysSince(iso: string | null, now: number): number {
  if (!iso) return Infinity;
  return (now - new Date(iso).getTime()) / 86_400_000;
}

/**
 * Ranks the student's skills by how urgently each should drive the next
 * selection, and assigns a PathIntent to each. This makes the spec's
 * "skill-gap targeting", "uncertainty reduction", and "spaced retention"
 * rules explicit and independently testable, rather than folded invisibly
 * into the scoring function.
 *
 * Priority order (highest first):
 *   1. Some evidence exists but is too thin/noisy to trust -> DIAGNOSTIC
 *   2. Regressing / at-risk                                -> RETENTION_CHECK
 *   3. Confidently weak                                    -> REMEDIATION
 *   4. Mastered but stale                                  -> REINFORCEMENT
 *   5. Mastered and fresh                                  -> TRANSFER
 *   6. Proficient/practiced                                -> PROGRESSION
 *   7. Zero evidence at all (not yet reached)               -> low-priority DIAGNOSTIC
 *
 * A skill with literally zero evidence (level UNKNOWN) is deliberately
 * treated as LOW priority, not high: it hasn't been introduced to this
 * student's path yet (that's what prerequisite gating is for), so it
 * should not jump the queue ahead of a skill with real, observed
 * weakness just because "confidence 0" looks more urgent on paper. Only
 * skills the student has actually attempted, but too sparsely/noisily to
 * classify confidently (level UNCERTAIN), get the strong diagnostic pull.
 */
export function prioritizeSkills(student: StudentModel, now: number = Date.now()): SkillPriority[] {
  const priorities: SkillPriority[] = [];

  for (const [skillId, state] of Object.entries(student.skills)) {
    const stale = daysSince(state.lastDemonstratedAt, now) > STALE_DAYS_THRESHOLD;

    let intent: PathIntent;
    let priorityScore: number;

    if (state.level === 'UNKNOWN') {
      intent = 'DIAGNOSTIC';
      priorityScore = 20; // eligible for diagnosis, but not urgent — nothing negative has been observed
    } else if (state.confidence < LOW_CONFIDENCE_THRESHOLD) {
      intent = 'DIAGNOSTIC';
      priorityScore = 90 - state.confidence * 50; // lower confidence -> more urgent
    } else if (state.level === 'REGRESSING' || state.level === 'AT_RISK') {
      intent = 'RETENTION_CHECK';
      priorityScore = 80;
    } else if (state.score < SKILL_GAP_SCORE_THRESHOLD) {
      intent = 'REMEDIATION';
      priorityScore = 75 - state.score * 0.3;
    } else if (state.level === 'MASTERED' && stale) {
      intent = 'REINFORCEMENT';
      priorityScore = 55;
    } else if (state.level === 'MASTERED') {
      intent = 'TRANSFER';
      priorityScore = 50;
    } else if (state.level === 'PROFICIENT' || state.level === 'PRACTICED') {
      intent = 'PROGRESSION';
      priorityScore = 45;
    } else {
      intent = 'PROGRESSION';
      priorityScore = 30;
    }

    priorities.push({ skillId, state, priorityScore, suggestedIntent: intent });
  }

  priorities.sort((a, b) => b.priorityScore - a.priorityScore);
  return priorities;
}
