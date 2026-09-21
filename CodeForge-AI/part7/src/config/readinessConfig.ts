import { PerformanceLevel, ReadinessGates } from '../types';

// Numeric weight given to each performance level when computing a role's
// weighted readiness score. insufficient_evidence deliberately has NO score
// entry — it is excluded from the weighted average entirely rather than
// silently scored as 0, which is what keeps "unknown" from being punished
// the same as "weak" (sections 30, 89).
export const PERFORMANCE_LEVEL_SCORE: Partial<Record<PerformanceLevel, number>> = {
  weak: 0.25,
  developing: 0.5,
  competent: 0.75,
  strong: 1.0,
};

// Default gates for a ROLE_READINESS assessment. Callers may override per
// blueprint version (stored in role_blueprint_versions.readiness_gates), so
// nothing below is a hidden magic number baked into the engine itself.
export const DEFAULT_READINESS_GATES: ReadinessGates = {
  min_performance_level: 'competent',
  min_weighted_score_for_ready: 0.85,
  min_weighted_score_for_approaching: 0.65,
  min_weighted_score_for_developing: 0.4,
  max_insufficient_evidence_skills_for_ready: 0,
};

export const PERFORMANCE_LEVEL_RANK: Record<PerformanceLevel, number> = {
  insufficient_evidence: -1,
  weak: 0,
  developing: 1,
  competent: 2,
  strong: 3,
};

// Execution engine limits — deliberately conservative for a shared sandbox.
export const EXECUTION_LIMITS = {
  timeoutMs: 5000,
  compileTimeoutMs: 15000,
  maxOutputBytes: 100_000,
};

// Assessment defaults used when a blueprint doesn't specify its own.
export const ASSESSMENT_DEFAULTS = {
  role_readiness: { durationMinutes: 90, challengeCount: 5 },
  diagnostic: { durationMinutes: 45, challengeCount: 3 },
  skill_verification: { durationMinutes: 30, challengeCount: 1 },
};
