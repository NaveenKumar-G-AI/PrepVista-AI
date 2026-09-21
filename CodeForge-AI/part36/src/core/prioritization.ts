import { GapPriority, InterventionCategory, MasteryLevel } from '../domain/enums';
import type { MasteryDistribution } from './distribution';

// ── Training priority (sections 19-20, 60) ───────────────────────────

export interface TrainingPriorityInput {
  skillId?: string;
  roleId?: string;
  label: string;
  gapPriority: GapPriority;
  affectedStudents: number;
  roleImportance: number; // 0-1
  trainingImpactPotential: number; // 0-1, how responsive this gap is to focused training
}

export interface TrainingPriorityResult extends TrainingPriorityInput {
  /** Internal ranking score only — never surface this as a fake "%
   * health" figure (section 60). It exists purely to sort; the
   * rationale bullets are what the user actually reads. */
  score: number;
  rationale: string[];
}

const GAP_WEIGHT: Record<GapPriority, number> = {
  [GapPriority.HIGH]: 1,
  [GapPriority.MODERATE]: 0.6,
  [GapPriority.EMERGING]: 0.3,
  [GapPriority.INSUFFICIENT_EVIDENCE]: 0,
};

/** Section 20: Cohort Gap + Role Importance + Student Coverage +
 * Training Impact Potential -> Training Priority. */
export function scoreTrainingPriority(input: TrainingPriorityInput): TrainingPriorityResult {
  if (input.gapPriority === GapPriority.INSUFFICIENT_EVIDENCE) {
    return {
      ...input,
      score: 0,
      rationale: ['Evidence coverage is currently insufficient to prioritize training for this area.'],
    };
  }

  const score =
    GAP_WEIGHT[input.gapPriority] * 0.5 + input.roleImportance * 0.25 + input.trainingImpactPotential * 0.25;

  const rationale: string[] = [];
  if (input.gapPriority === GapPriority.HIGH) rationale.push('High-priority skill gap observed across the cohort.');
  if (input.gapPriority === GapPriority.MODERATE) rationale.push('Moderate skill gap observed across the cohort.');
  if (input.roleImportance >= 0.6) rationale.push('Central to one or more target roles for this cohort.');
  if (input.affectedStudents > 0) {
    rationale.push(`Affects ${input.affectedStudents} student${input.affectedStudents === 1 ? '' : 's'} with sufficient evidence.`);
  }
  if (input.trainingImpactPotential >= 0.6) rationale.push('Historically responsive to focused training.');

  return { ...input, score, rationale };
}

export function rankTrainingPriorities(inputs: TrainingPriorityInput[]): TrainingPriorityResult[] {
  return inputs.map(scoreTrainingPriority).sort((a, b) => b.score - a.score);
}

// ── Intervention intelligence (section 21) ───────────────────────────

export interface InterventionInput {
  distribution: MasteryDistribution;
  interviewVerificationRate: number; // 0-1, share with a verified technical-interview signal
  roleSpecificGap: boolean;
}

/** A simple, explainable heuristic classifier over distribution shape.
 * This is a reasonable default — real institutions will want to
 * calibrate thresholds against their own outcomes data over time; see
 * docs/ARCHITECTURE.md. */
export function classifyInterventions(input: InterventionInput): InterventionCategory[] {
  const { distribution, interviewVerificationRate, roleSpecificGap } = input;
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  if (total === 0) return [];

  const share = (level: MasteryLevel) => distribution[level] / total;
  const categories: InterventionCategory[] = [];

  if (share(MasteryLevel.NOT_ASSESSED) + share(MasteryLevel.EMERGING) >= 0.4) {
    categories.push(InterventionCategory.NEEDS_FOUNDATION_SUPPORT);
  }
  if (share(MasteryLevel.DEVELOPING) >= 0.35) {
    categories.push(InterventionCategory.NEEDS_PRACTICE);
  }
  if (share(MasteryLevel.PROFICIENT) + share(MasteryLevel.STRONG) >= 0.3 && interviewVerificationRate < 0.4) {
    categories.push(InterventionCategory.NEEDS_INTERVIEW_VERIFICATION);
  }
  if (share(MasteryLevel.STRONG) >= 0.2) {
    categories.push(InterventionCategory.NEEDS_ADVANCED_CHALLENGES);
  }
  if (roleSpecificGap) {
    categories.push(InterventionCategory.NEEDS_ROLE_SPECIFIC_PREPARATION);
  }

  return categories;
}
