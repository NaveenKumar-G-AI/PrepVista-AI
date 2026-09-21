// §6 PRIORITY ENGINE
// score = severity*w1 + frequency*w2 + readiness_relevance*w3 + improvement_opportunity*w4
// Kept in its own file, out of PriorityEngine.ts, so the formula stays
// "configurable and explainable" (§6) without touching business logic.
export const PRIORITY_WEIGHTS = {
  severity: 0.3,
  frequency: 0.2,
  readinessRelevance: 0.3,
  improvementOpportunity: 0.2,
};

// Bucket boundaries for the 0-100 weighted score → CRITICAL/HIGH/MEDIUM/LOW.
export const PRIORITY_THRESHOLDS = {
  CRITICAL: 75,
  HIGH: 55,
  MEDIUM: 35,
  // anything below MEDIUM buckets to LOW
};

// §21 — how much of the category's overall exam weight feeds readiness.
// Placeholder weighting until real exam-weighting data is wired in from
// Feature 3/4 — tune freely, this is the "configurable" surface for §6.
export const CATEGORY_READINESS_WEIGHT: Record<string, number> = {
  Quantitative: 90,
  Logical: 80,
  Verbal: 60,
};
export const DEFAULT_READINESS_WEIGHT = 70;
