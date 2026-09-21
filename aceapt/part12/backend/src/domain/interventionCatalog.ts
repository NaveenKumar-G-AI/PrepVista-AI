import { InterventionType, ExecutionContract } from './types';

export interface InterventionMeta {
  type: InterventionType;
  displayName: string;
  typicalDurationMin: number;
  cognitiveLoad: 'low' | 'medium' | 'high';
  description: string;
}

// Only IMPLEMENTED_INTERVENTION_TYPES (see domain/types.ts) have entries here.
// Adding a new type to the taxonomy does nothing until it also gets a catalog
// entry, a candidate-generation rule, and a PROBLEM_INTERVENTION_FIT weight.
export const INTERVENTION_CATALOG: Partial<Record<InterventionType, InterventionMeta>> = {
  TIMED_DRILL: {
    type: 'TIMED_DRILL',
    displayName: 'Timed Sprint',
    typicalDurationMin: 12,
    cognitiveLoad: 'medium',
    description: 'A short, timed set of questions focused on speed and decision-making under pressure.'
  },
  CONCEPT_RETEACH: {
    type: 'CONCEPT_RETEACH',
    displayName: 'Concept Refresher',
    typicalDurationMin: 15,
    cognitiveLoad: 'medium',
    description: 'A focused re-explanation of the underlying concept, with a worked example and guided practice.'
  },
  WORKED_EXAMPLE: {
    type: 'WORKED_EXAMPLE',
    displayName: 'Worked Example',
    typicalDurationMin: 6,
    cognitiveLoad: 'low',
    description: 'A fully solved example showing the reasoning step by step.'
  },
  GUIDED_PRACTICE: {
    type: 'GUIDED_PRACTICE',
    displayName: 'Guided Practice',
    typicalDurationMin: 10,
    cognitiveLoad: 'medium',
    description: 'Practice questions with scaffolded hints available on request.'
  },
  TARGETED_PRACTICE: {
    type: 'TARGETED_PRACTICE',
    displayName: 'Targeted Calculation Drill',
    typicalDurationMin: 10,
    cognitiveLoad: 'medium',
    description: 'A focused set of calculation-heavy questions to isolate and correct execution mistakes.'
  },
  SPACED_REVIEW: {
    type: 'SPACED_REVIEW',
    displayName: 'Spaced Recall',
    typicalDurationMin: 8,
    cognitiveLoad: 'low',
    description: 'A short recall session on previously learned material, timed to strengthen retention.'
  },
  TRANSFER_PRACTICE: {
    type: 'TRANSFER_PRACTICE',
    displayName: 'Transfer Practice',
    typicalDurationMin: 12,
    cognitiveLoad: 'high',
    description: 'Questions in varied, unfamiliar formats to test whether the skill generalises.'
  },
  MICRO_ASSESSMENT: {
    type: 'MICRO_ASSESSMENT',
    displayName: 'Micro Assessment',
    typicalDurationMin: 5,
    cognitiveLoad: 'low',
    description: 'A brief independent check with no scaffolding, to verify the skill sticks unaided.'
  }
};

export function buildExecutionContract(
  type: InterventionType,
  topic: string,
  opts: { skill?: string; difficulty?: ExecutionContract['difficulty']; questionCount?: number } = {}
): ExecutionContract {
  const meta = INTERVENTION_CATALOG[type];
  if (!meta) {
    throw new Error(
      `No catalog entry for intervention type "${type}". Add one to INTERVENTION_CATALOG or keep it ` +
        `out of IMPLEMENTED_INTERVENTION_TYPES until it has a real execution contract.`
    );
  }

  const base: ExecutionContract = {
    type,
    topic,
    skill: opts.skill,
    difficulty: opts.difficulty ?? 'standard',
    focusAreas: []
  };

  switch (type) {
    case 'TIMED_DRILL':
      return {
        ...base,
        questionCount: opts.questionCount ?? 10,
        timeLimitSec: meta.typicalDurationMin * 60,
        focusAreas: ['Speed', 'Decision making', 'Accuracy under pressure']
      };
    case 'SPACED_REVIEW':
      return {
        ...base,
        questionCount: opts.questionCount ?? 8,
        timeLimitSec: meta.typicalDurationMin * 60,
        focusAreas: ['Recall strength', 'Long-term retention']
      };
    case 'TRANSFER_PRACTICE':
      return {
        ...base,
        questionCount: opts.questionCount ?? 8,
        timeLimitSec: meta.typicalDurationMin * 60,
        focusAreas: ['Unfamiliar formats', 'Generalising the skill']
      };
    case 'CONCEPT_RETEACH':
      return {
        ...base,
        steps: ['MICRO_LESSON', 'WORKED_EXAMPLE', 'GUIDED_PRACTICE', 'MICRO_ASSESSMENT'],
        focusAreas: ['Rebuilding the concept', 'Guided application']
      };
    case 'WORKED_EXAMPLE':
      return { ...base, focusAreas: ['Step-by-step reasoning'] };
    case 'GUIDED_PRACTICE':
      return { ...base, questionCount: opts.questionCount ?? 6, focusAreas: ['Applying the concept with support'] };
    case 'TARGETED_PRACTICE':
      return {
        ...base,
        questionCount: opts.questionCount ?? 10,
        focusAreas: ['Calculation accuracy', 'Execution mistakes']
      };
    case 'MICRO_ASSESSMENT':
      return { ...base, questionCount: opts.questionCount ?? 5, focusAreas: ['Independent verification'] };
    default:
      return base;
  }
}
