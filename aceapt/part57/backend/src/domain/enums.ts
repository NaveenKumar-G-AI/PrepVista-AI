/**
 * Enumerations from the Feature 57 spec (secs. 12, 13, 18, 19, 34, 53/189).
 * Kept as plain string unions rather than TS `enum` so they serialize
 * cleanly to/from SQLite TEXT columns and JSON without a mapping step.
 */

export const StrategyType = [
  'MENTAL_MATH',
  'PERCENTAGE_TRICK',
  'RATIO_METHOD',
  'AVERAGE_METHOD',
  'ESTIMATION',
  'ELIMINATION',
  'BACKSOLVING',
  'OPTION_TESTING',
  'PATTERN_RECOGNITION',
  'REPRESENTATION_CHANGE',
  'CASE_REDUCTION',
  'ALGEBRAIC_TRANSFORMATION',
  'FORMULA_REARRANGEMENT',
  'COMMON_FACTOR',
  'SYMMETRY',
  'PAIRING',
  'COMPLEMENT_METHOD',
  'APPROXIMATION',
  'COUNTING_REDUCTION',
  'LOGICAL_SHORTCUT',
  'PERSONAL_METHOD',
] as const;
export type StrategyType = (typeof StrategyType)[number];

export const StrategyClassification = ['UNIVERSAL', 'CONDITIONAL', 'PERSONAL', 'EXPERIMENTAL'] as const;
export type StrategyClassification = (typeof StrategyClassification)[number];

export const ShortcutSource = [
  'CONTENT_TEAM',
  'TRAINER',
  'STUDENT_CREATED',
  'AI_SUGGESTED',
  'SYSTEM_DISCOVERED',
  'IMPORTED',
  'DERIVED',
] as const;
export type ShortcutSource = (typeof ShortcutSource)[number];

/**
 * Content-lifecycle status of the *shortcut definition itself* (sec. 18).
 * This is deliberately separate from a student's personal TrustState below.
 * A shortcut can be VERIFIED (mathematically sound, content-team reviewed)
 * while a given student's own execution of it is still DEVELOPING, or even
 * NEEDS_REVIEW for that student only. See README "Design decisions".
 */
export const ShortcutStatus = [
  'DISCOVERED',
  'UNVERIFIED',
  'TESTING',
  'VERIFIED',
  'NEEDS_REVIEW',
  'DEPRECATED',
  'DISABLED',
] as const;
export type ShortcutStatus = (typeof ShortcutStatus)[number];

export const ApplicabilityResult = ['APPLICABLE', 'CONDITIONALLY_APPLICABLE', 'NOT_APPLICABLE', 'UNKNOWN'] as const;
export type ApplicabilityResult = (typeof ApplicabilityResult)[number];

/**
 * Per-student, per-shortcut trust progression (secs. 53, 189-190). Evidence
 * based, never granted for free by a save, an AI suggestion, or one success
 * (secs. 21, 76, 190, 290).
 */
export const TrustState = ['EXPERIMENTAL', 'DEVELOPING', 'RELIABLE', 'TRUSTED', 'NEEDS_REVIEW'] as const;
export type TrustState = (typeof TrustState)[number];

export const SessionMode = ['LEARNING', 'PRACTICE', 'TIMED_TRAINING', 'FORMAL_ASSESSMENT'] as const;
export type SessionMode = (typeof SessionMode)[number];

export const TrainingActivityType = [
  'RECALL',
  'SELECTION',
  'APPLICATION',
  'VERIFICATION',
  'TRANSFER',
  'PRESSURE',
  'RETENTION',
] as const;
export type TrainingActivityType = (typeof TrainingActivityType)[number];

export const DiscoveryStatus = ['CANDIDATE_ACCUMULATING', 'CANDIDATE_READY', 'PROMOTED', 'REJECTED', 'DISMISSED'] as const;
export type DiscoveryStatus = (typeof DiscoveryStatus)[number];

export const ValidationType = ['PROPERTY_BASED', 'COUNTEREXAMPLE', 'BOUNDARY', 'EXAMPLE_SET', 'MANUAL'] as const;
export type ValidationType = (typeof ValidationType)[number];

export const ValidationStatus = ['PASS', 'FAIL', 'INCONCLUSIVE'] as const;
export type ValidationStatus = (typeof ValidationStatus)[number];

export const Role = ['STUDENT', 'TRAINER', 'CONTENT_REVIEWER', 'ADMIN'] as const;
export type Role = (typeof Role)[number];
