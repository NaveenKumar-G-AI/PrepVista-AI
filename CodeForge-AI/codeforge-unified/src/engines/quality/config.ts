import { QualityDimension, Severity, Confidence } from './types';

// Bump these when rule logic or scoring changes. Every report is stamped with both, so historical
// results stay reproducible even as the rules evolve (see "VERSIONING" in the product spec).
export const ANALYSIS_VERSION = '1.0.0';
export const RULE_SET_VERSION = '1.0.0';

// ---- Overall score = sum(dimensionScore * weight). Must sum to 1.0. ----
export const DIMENSION_WEIGHTS: Record<QualityDimension, number> = {
  READABILITY: 0.12,
  MAINTAINABILITY: 0.16,
  STRUCTURAL_QUALITY: 0.14,
  SIMPLICITY: 0.08,
  CONSISTENCY: 0.06,
  DUPLICATION: 0.14,
  NAMING: 0.1,
  ROBUSTNESS: 0.08,
  ERROR_HANDLING: 0.08,
  ENGINEERING_PRACTICES: 0.04,
};

// ---- Which dimension(s) each rule's deduction is charged against. Each map should sum to ~1.0. ----
export const RULE_DIMENSIONS: Record<string, Partial<Record<QualityDimension, number>>> = {
  LONG_FUNCTION: { STRUCTURAL_QUALITY: 0.6, READABILITY: 0.4 },
  DEEP_NESTING: { STRUCTURAL_QUALITY: 0.4, SIMPLICITY: 0.4, READABILITY: 0.2 },
  EXCESSIVE_PARAMETERS: { STRUCTURAL_QUALITY: 0.5, SIMPLICITY: 0.2, MAINTAINABILITY: 0.3 },
  MAGIC_NUMBER: { MAINTAINABILITY: 0.6, CONSISTENCY: 0.4 },
  MAGIC_STRING: { MAINTAINABILITY: 0.6, CONSISTENCY: 0.4 },
  DUPLICATED_LOGIC: { DUPLICATION: 0.7, MAINTAINABILITY: 0.3 },
  DEAD_CODE: { MAINTAINABILITY: 0.5, STRUCTURAL_QUALITY: 0.5 },
  UNUSED_VARIABLE: { MAINTAINABILITY: 1.0 },
  UNUSED_IMPORT: { MAINTAINABILITY: 1.0 },
  SWALLOWED_EXCEPTION: { ERROR_HANDLING: 0.7, ROBUSTNESS: 0.3 },
  GOD_FUNCTION: { STRUCTURAL_QUALITY: 0.4, ENGINEERING_PRACTICES: 0.3, SIMPLICITY: 0.3 },
  COMMENTED_OUT_CODE: { MAINTAINABILITY: 0.7, CONSISTENCY: 0.3 },
  POOR_NAMING: { NAMING: 0.8, READABILITY: 0.2 },
  RESOURCE_LEAK: { ROBUSTNESS: 0.4, ERROR_HANDLING: 0.3, ENGINEERING_PRACTICES: 0.3 },
  INEFFICIENT_COMPLEXITY_WITH_DUPLICATION: { MAINTAINABILITY: 0.6, STRUCTURAL_QUALITY: 0.4 },
};

export const SEVERITY_BASE_DEDUCTION: Record<Severity, number> = {
  INFO: 0,
  LOW: 3,
  MEDIUM: 8,
  HIGH: 15,
  CRITICAL: 25,
};

export const CONFIDENCE_MULTIPLIER: Record<Confidence, number> = {
  HIGH: 1.0,
  MEDIUM: 0.7,
  LOW: 0.4,
  UNKNOWN: 0.15,
};

// Highest threshold that is <= the score wins the label.
export const SCORE_LABELS: Array<[number, string]> = [
  [90, 'EXCELLENT'],
  [75, 'GOOD'],
  [60, 'FAIR'],
  [40, 'NEEDS_IMPROVEMENT'],
  [0, 'POOR'],
];

export const THRESHOLDS = {
  LONG_FUNCTION_LINES: 40,
  LONG_FUNCTION_STATEMENTS: 25,
  DEEP_NESTING_DEPTH: 4,
  EXCESSIVE_PARAMS: 5,
  MAGIC_NUMBER_REPEAT_FOR_MEDIUM: 3,
  MAX_FUNCTION_LENGTH_FOR_POSITIVE: 25,
  DUPLICATION_MIN_STATEMENTS: 4,
  NEAR_DUP_SIMILARITY: 0.8,
  GOD_FUNCTION_MIN_CATEGORIES: 3,
  TRIVIAL_NUMBERS: [-1, 0, 1, 2, 100] as number[],
  TRIVIAL_STRINGS: ['', ' ', '\n', 'utf-8', 'utf8'] as string[],
  MAGIC_STRING_MAX_WORDS: 2,
};
