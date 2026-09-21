import { RootCause } from './rootCause';

/**
 * Intervention taxonomy. Deliberately a flat, extensible registry (enum + two
 * lookup maps below) rather than logic baked into the selector, so a new
 * intervention type can be added without touching engine control flow.
 */
export enum InterventionType {
  CONCEPT_REBUILD = 'CONCEPT_REBUILD',
  PREREQUISITE_REPAIR = 'PREREQUISITE_REPAIR',
  WORKED_EXAMPLE = 'WORKED_EXAMPLE',
  STEP_BY_STEP_GUIDANCE = 'STEP_BY_STEP_GUIDANCE',
  ERROR_DECONSTRUCTION = 'ERROR_DECONSTRUCTION',
  STRATEGY_SELECTION = 'STRATEGY_SELECTION',
  CONTRAST_TRAINING = 'CONTRAST_TRAINING',
  MICRO_PRACTICE = 'MICRO_PRACTICE',
  GUIDED_PRACTICE = 'GUIDED_PRACTICE',
  INDEPENDENT_PRACTICE = 'INDEPENDENT_PRACTICE',
  TIMED_PRACTICE = 'TIMED_PRACTICE',
  TRANSFER_CHALLENGE = 'TRANSFER_CHALLENGE',
  RETRIEVAL_PRACTICE = 'RETRIEVAL_PRACTICE',
  SPACED_REVIEW = 'SPACED_REVIEW',
  MIXED_PRACTICE = 'MIXED_PRACTICE',
  DIFFICULTY_RESET = 'DIFFICULTY_RESET',
  DIFFICULTY_PROGRESSION = 'DIFFICULTY_PROGRESSION',
  EXAM_SIMULATION = 'EXAM_SIMULATION',
  TARGETED_REMEDIATION = 'TARGETED_REMEDIATION',
  MASTERY_REVERIFICATION = 'MASTERY_REVERIFICATION',
}

export interface InterventionMeta {
  label: string;
  description: string;
  estimatedMinutes: number;
}

export const INTERVENTION_META: Record<InterventionType, InterventionMeta> = {
  [InterventionType.CONCEPT_REBUILD]: { label: 'Concept rebuild', description: 'Reconstructs the underlying concept from first principles.', estimatedMinutes: 4 },
  [InterventionType.PREREQUISITE_REPAIR]: { label: 'Prerequisite repair', description: 'Repairs a weak prerequisite skill before returning to the target skill.', estimatedMinutes: 5 },
  [InterventionType.WORKED_EXAMPLE]: { label: 'Worked example', description: 'Fully worked example with reasoning made explicit.', estimatedMinutes: 2 },
  [InterventionType.STEP_BY_STEP_GUIDANCE]: { label: 'Step-by-step guidance', description: 'Breaks the procedure into explicit, checkable steps.', estimatedMinutes: 3 },
  [InterventionType.ERROR_DECONSTRUCTION]: { label: 'Error deconstruction', description: "Walks the student's own attempt to the exact point it diverged.", estimatedMinutes: 2 },
  [InterventionType.STRATEGY_SELECTION]: { label: 'Strategy selection training', description: 'Practises choosing the right method before requiring a full solve.', estimatedMinutes: 3 },
  [InterventionType.CONTRAST_TRAINING]: { label: 'Contrast training', description: 'Contrasts two related concepts the student is confusing.', estimatedMinutes: 3 },
  [InterventionType.MICRO_PRACTICE]: { label: 'Micro practice', description: 'A very small, targeted burst of practice (1-2 questions).', estimatedMinutes: 2 },
  [InterventionType.GUIDED_PRACTICE]: { label: 'Guided practice', description: 'Practice with scaffolding available on request.', estimatedMinutes: 3 },
  [InterventionType.INDEPENDENT_PRACTICE]: { label: 'Independent practice', description: 'Practice with no scaffolding, to verify independence.', estimatedMinutes: 3 },
  [InterventionType.TIMED_PRACTICE]: { label: 'Timed practice', description: 'Practice under a time constraint to build fluency/speed.', estimatedMinutes: 4 },
  [InterventionType.TRANSFER_CHALLENGE]: { label: 'Transfer challenge', description: 'An unfamiliar framing of the same underlying skill.', estimatedMinutes: 3 },
  [InterventionType.RETRIEVAL_PRACTICE]: { label: 'Retrieval practice', description: 'Low-stakes recall of a previously mastered skill.', estimatedMinutes: 2 },
  [InterventionType.SPACED_REVIEW]: { label: 'Spaced review', description: 'A short review scheduled to combat forgetting.', estimatedMinutes: 2 },
  [InterventionType.MIXED_PRACTICE]: { label: 'Mixed practice', description: 'Interleaved practice across related skills to build consistency.', estimatedMinutes: 4 },
  [InterventionType.DIFFICULTY_RESET]: { label: 'Difficulty reset', description: 'Steps back to an easier layer before re-climbing.', estimatedMinutes: 3 },
  [InterventionType.DIFFICULTY_PROGRESSION]: { label: 'Difficulty progression', description: 'Steps up through difficulty once a layer is solid.', estimatedMinutes: 3 },
  [InterventionType.EXAM_SIMULATION]: { label: 'Exam simulation', description: 'Realistic timed, mixed-question conditions (routes to Feature 13).', estimatedMinutes: 8 },
  [InterventionType.TARGETED_REMEDIATION]: { label: 'Targeted remediation', description: 'A focused remediation bundle for a specific error pattern.', estimatedMinutes: 5 },
  [InterventionType.MASTERY_REVERIFICATION]: { label: 'Mastery reverification', description: 'Confirms whether mastery genuinely holds (owned by Feature 14).', estimatedMinutes: 3 },
};

/**
 * Escalation ladder (Section 8). Selection starts low and only climbs when the
 * current level's intervention has been tried and did not resolve the gap.
 */
export enum EscalationLevel {
  L0_NORMAL_PRACTICE = 0,
  L1_HINT = 1,
  L2_MICRO_EXPLANATION = 2,
  L3_WORKED_EXAMPLE = 3,
  L4_GUIDED_PRACTICE = 4,
  L5_PREREQUISITE_REPAIR = 5,
  L6_ALTERNATIVE_STRATEGY = 6,
  L7_DEEP_REMEDIATION = 7,
}

export const ESCALATION_LABELS: Record<EscalationLevel, string> = {
  [EscalationLevel.L0_NORMAL_PRACTICE]: 'Normal practice',
  [EscalationLevel.L1_HINT]: 'Hint',
  [EscalationLevel.L2_MICRO_EXPLANATION]: 'Micro explanation',
  [EscalationLevel.L3_WORKED_EXAMPLE]: 'Worked example',
  [EscalationLevel.L4_GUIDED_PRACTICE]: 'Guided practice',
  [EscalationLevel.L5_PREREQUISITE_REPAIR]: 'Prerequisite repair',
  [EscalationLevel.L6_ALTERNATIVE_STRATEGY]: 'Alternative instructional strategy',
  [EscalationLevel.L7_DEEP_REMEDIATION]: 'Deep remediation / instructor escalation',
};

/**
 * Default root-cause -> ordered intervention chain. This is the policy the
 * selector walks through, skipping any type already tried-and-failed in the
 * current recovery cycle ("failed intervention memory", Section 18).
 *
 * Extend by adding/reordering entries here — no engine code changes required.
 */
export const INTERVENTION_CHAINS: Record<RootCause, InterventionType[]> = {
  [RootCause.CONCEPT_GAP]: [
    InterventionType.CONCEPT_REBUILD,
    InterventionType.WORKED_EXAMPLE,
    InterventionType.GUIDED_PRACTICE,
    InterventionType.INDEPENDENT_PRACTICE,
  ],
  [RootCause.PREREQUISITE_GAP]: [
    InterventionType.PREREQUISITE_REPAIR,
    InterventionType.WORKED_EXAMPLE,
    InterventionType.GUIDED_PRACTICE,
  ],
  [RootCause.PROCEDURAL_GAP]: [
    InterventionType.STEP_BY_STEP_GUIDANCE,
    InterventionType.GUIDED_PRACTICE,
    InterventionType.TIMED_PRACTICE,
  ],
  [RootCause.STRATEGY_GAP]: [
    InterventionType.STRATEGY_SELECTION,
    InterventionType.CONTRAST_TRAINING,
    InterventionType.GUIDED_PRACTICE,
    InterventionType.INDEPENDENT_PRACTICE,
    InterventionType.TRANSFER_CHALLENGE,
  ],
  [RootCause.APPLICATION_GAP]: [
    InterventionType.CONTRAST_TRAINING,
    InterventionType.WORKED_EXAMPLE,
    InterventionType.GUIDED_PRACTICE,
    InterventionType.TRANSFER_CHALLENGE,
  ],
  [RootCause.TRANSFER_GAP]: [
    InterventionType.STRATEGY_SELECTION,
    InterventionType.TRANSFER_CHALLENGE,
    InterventionType.MIXED_PRACTICE,
  ],
  [RootCause.CALCULATION_ERROR]: [
    InterventionType.ERROR_DECONSTRUCTION,
    InterventionType.MICRO_PRACTICE,
  ],
  [RootCause.INTERPRETATION_ERROR]: [
    InterventionType.ERROR_DECONSTRUCTION,
    InterventionType.MICRO_PRACTICE,
  ],
  [RootCause.SPEED_GAP]: [
    InterventionType.STEP_BY_STEP_GUIDANCE,
    InterventionType.TIMED_PRACTICE,
  ],
  [RootCause.RETENTION_GAP]: [
    InterventionType.RETRIEVAL_PRACTICE,
    InterventionType.SPACED_REVIEW,
    InterventionType.MASTERY_REVERIFICATION,
  ],
  [RootCause.CONSISTENCY_GAP]: [
    InterventionType.MIXED_PRACTICE,
    InterventionType.MASTERY_REVERIFICATION,
  ],
  [RootCause.ASSESSMENT_CONDITION_GAP]: [
    InterventionType.EXAM_SIMULATION,
  ],
  [RootCause.MULTI_FACTOR]: [
    // Resolved dynamically by the selector from the primary cause's chain;
    // this entry exists only so the map is total.
    InterventionType.TARGETED_REMEDIATION,
  ],
};
