/**
 * spec §185–§188: keep policy configurable and out of validator code. A profile
 * says nothing about HOW to validate — only which validators must reach at
 * least PASS/PASS_WITH_WARNING for a question to be eligible for that use.
 *
 * Deliberately NOT hard-coded into the aggregator: swapping these lists is a
 * config change, not a code change to any validator.
 */
export const VALIDATOR_NAMES = {
  SCHEMA: "SCHEMA_VALIDATOR",
  ANSWER: "ANSWER_VALIDATOR",
  OPTIONS: "OPTIONS_VALIDATOR",
  SOLUTION: "SOLUTION_VALIDATOR",
  MATH: "MATH_VALIDATOR",
  UNITS: "UNITS_VALIDATOR",
  LOGIC: "LOGIC_VALIDATOR",
  SKILL: "SKILL_VALIDATOR",
  DIFFICULTY: "DIFFICULTY_VALIDATOR",
  RUNTIME: "RUNTIME_VALIDATOR",
  ASSET: "ASSET_VALIDATOR",
  SCORING_COMPATIBILITY: "SCORING_COMPATIBILITY_VALIDATOR",
  ASSESSMENT_COMPATIBILITY: "ASSESSMENT_COMPATIBILITY_VALIDATOR",
  AI_SEMANTIC: "AI_SEMANTIC_VALIDATOR"
} as const;

export interface ValidationProfile {
  name: string;
  description: string;
  /** Validators that MUST reach PASS/PASS_WITH_WARNING for this profile's eligibility to be true. */
  required: string[];
  /** Validators that still run (their evidence is retained) but never block this profile alone. */
  optional: string[];
}

export const PRACTICE_PROFILE: ValidationProfile = {
  name: "PRACTICE_PROFILE",
  description: "Practice mode — hints/retries allowed, lower stakes.",
  required: [
    VALIDATOR_NAMES.SCHEMA,
    VALIDATOR_NAMES.ANSWER,
    VALIDATOR_NAMES.OPTIONS,
    VALIDATOR_NAMES.RUNTIME,
    VALIDATOR_NAMES.SCORING_COMPATIBILITY
  ],
  optional: [
    VALIDATOR_NAMES.SOLUTION,
    VALIDATOR_NAMES.MATH,
    VALIDATOR_NAMES.UNITS,
    VALIDATOR_NAMES.LOGIC,
    VALIDATOR_NAMES.SKILL,
    VALIDATOR_NAMES.DIFFICULTY,
    VALIDATOR_NAMES.ASSET,
    VALIDATOR_NAMES.AI_SEMANTIC
  ]
};

export const DIAGNOSTIC_PROFILE: ValidationProfile = {
  name: "DIAGNOSTIC_PROFILE",
  description: "Feeds Feature 42-style capability estimation — skill/difficulty metadata must be trustworthy.",
  required: [
    VALIDATOR_NAMES.SCHEMA,
    VALIDATOR_NAMES.ANSWER,
    VALIDATOR_NAMES.OPTIONS,
    VALIDATOR_NAMES.SKILL,
    VALIDATOR_NAMES.DIFFICULTY,
    VALIDATOR_NAMES.RUNTIME,
    VALIDATOR_NAMES.SCORING_COMPATIBILITY
  ],
  optional: [VALIDATOR_NAMES.SOLUTION, VALIDATOR_NAMES.MATH, VALIDATOR_NAMES.UNITS, VALIDATOR_NAMES.LOGIC, VALIDATOR_NAMES.ASSET, VALIDATOR_NAMES.AI_SEMANTIC]
};

export const TRANSFER_PROFILE: ValidationProfile = {
  name: "TRANSFER_PROFILE",
  description: "Feature 49 anti-memorization variants — reused across contexts, so answer/solution correctness must be solid.",
  required: [
    VALIDATOR_NAMES.SCHEMA,
    VALIDATOR_NAMES.ANSWER,
    VALIDATOR_NAMES.OPTIONS,
    VALIDATOR_NAMES.SOLUTION,
    VALIDATOR_NAMES.MATH,
    VALIDATOR_NAMES.UNITS,
    VALIDATOR_NAMES.LOGIC,
    VALIDATOR_NAMES.RUNTIME,
    VALIDATOR_NAMES.SCORING_COMPATIBILITY
  ],
  optional: [VALIDATOR_NAMES.SKILL, VALIDATOR_NAMES.DIFFICULTY, VALIDATOR_NAMES.ASSET, VALIDATOR_NAMES.AI_SEMANTIC]
};

export const TIMED_PROFILE: ValidationProfile = {
  name: "TIMED_PROFILE",
  description: "Feature 52 timed challenge — question itself must be runtime/answer solid; pacing rules are Feature 52's job, not ours.",
  required: [
    VALIDATOR_NAMES.SCHEMA,
    VALIDATOR_NAMES.ANSWER,
    VALIDATOR_NAMES.OPTIONS,
    VALIDATOR_NAMES.SOLUTION,
    VALIDATOR_NAMES.RUNTIME,
    VALIDATOR_NAMES.SCORING_COMPATIBILITY
  ],
  optional: [
    VALIDATOR_NAMES.MATH,
    VALIDATOR_NAMES.UNITS,
    VALIDATOR_NAMES.LOGIC,
    VALIDATOR_NAMES.SKILL,
    VALIDATOR_NAMES.DIFFICULTY,
    VALIDATOR_NAMES.ASSET,
    VALIDATOR_NAMES.AI_SEMANTIC
  ]
};

export const ASSESSMENT_PROFILE: ValidationProfile = {
  name: "ASSESSMENT_PROFILE",
  description: "Formal, high-stakes assessment (spec §78, §185) — the strictest gate; every deterministic validator must clear.",
  required: [
    VALIDATOR_NAMES.SCHEMA,
    VALIDATOR_NAMES.ANSWER,
    VALIDATOR_NAMES.OPTIONS,
    VALIDATOR_NAMES.SOLUTION,
    VALIDATOR_NAMES.MATH,
    VALIDATOR_NAMES.UNITS,
    VALIDATOR_NAMES.LOGIC,
    VALIDATOR_NAMES.SKILL,
    VALIDATOR_NAMES.DIFFICULTY,
    VALIDATOR_NAMES.RUNTIME,
    VALIDATOR_NAMES.SCORING_COMPATIBILITY,
    VALIDATOR_NAMES.ASSESSMENT_COMPATIBILITY
  ],
  // AI is deliberately never "required" — spec §103/§170: AI must never be the thing
  // standing between a question and eligibility, in either direction.
  optional: [VALIDATOR_NAMES.ASSET, VALIDATOR_NAMES.AI_SEMANTIC]
};

export const ALL_PROFILES: Record<string, ValidationProfile> = {
  PRACTICE_PROFILE,
  DIAGNOSTIC_PROFILE,
  TRANSFER_PROFILE,
  TIMED_PROFILE,
  ASSESSMENT_PROFILE
};

/** The three modes surfaced in the eligibility matrix (spec §184). */
export const ELIGIBILITY_PROFILE_MAP = {
  practice: PRACTICE_PROFILE,
  timed: TIMED_PROFILE,
  assessment: ASSESSMENT_PROFILE
} as const;
