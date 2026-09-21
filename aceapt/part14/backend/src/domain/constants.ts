/**
 * Every number the mastery engine uses to make a decision lives here.
 *
 * Section 14/29 require every mastery decision to be explainable — that only
 * works if there is one canonical place a reviewer (or a future engineer)
 * can point to and say "this is why the system called it a gap." Nothing in
 * engine/*.ts should contain a bare numeric threshold; it should reference
 * a constant from this file.
 *
 * These are prototype defaults tuned against the seed dataset in
 * data/seedData.ts + seed.ts. Treat them as a starting point for real
 * calibration against production data, not as pedagogically-validated
 * constants.
 */

export const THRESHOLDS = {
  // Section 15: evidence sufficiency
  MIN_ATTEMPTS_FOR_ANY_EVIDENCE: 3,

  // Section 5: independence engine
  MIN_INDEPENDENT_DISTINCT_QUESTIONS: 4,
  INDEPENDENT_MASTERY_ACCURACY: 0.75,
  INDEPENDENCE_GAP_PP: 0.15, // guided accuracy - independent accuracy
  // "Independent accuracy" for state-gating is computed over the most
  // recent RECENT_WINDOW_SIZE independent attempts, not lifetime average.
  // This is a deliberate choice: section 48's whole demo narrative is
  // diagnose -> intervene -> improve -> re-verify. If early struggles
  // permanently dragged down an all-time average, a student could never
  // climb back out no matter how much they improved, which would make
  // the intervention loop pointless. Lifetime accuracy is still tracked
  // (see SkillEvidence.lifetimeIndependentAccuracy) and shown to students
  // for transparency — it just isn't what gates state transitions.
  RECENT_WINDOW_SIZE: 8,

  // Section 6: difficulty robustness
  MIN_ATTEMPTS_PER_DIFFICULTY: 3,
  DIFFICULTY_GAP_PP: 0.2, // easy accuracy - hard accuracy

  // Section 7: format robustness
  MIN_ATTEMPTS_PER_FORMAT: 2,
  FORMAT_GAP_PP: 0.25, // best format accuracy - worst format accuracy

  // Section 8: context transfer
  MIN_ATTEMPTS_PER_CONTEXT: 2,
  CONTEXT_GAP_PP: 0.25,

  // Section 10: transfer engine (familiar vs novel)
  MIN_NOVEL_INDEPENDENT_ATTEMPTS: 3,
  TRANSFER_GAP_PP: 0.2,

  // Section 11: retention engine
  RETENTION_GAP_PP: 0.15,
  MIN_DELAYED_ATTEMPTS: 2,

  // Section 13: stability / mastery confidence
  STABILITY_WINDOW: 4, // attempts per rolling window
  STABILITY_MIN_WINDOWS: 2, // need at least this many rolling windows
  STABILITY_STDDEV_MAX: 0.16,
  STABILITY_FLOOR: 0.55, // no rolling window may dip below this and still count as stable

  // Section 19: bottleneck detection — a prerequisite is a candidate root
  // cause if its own independent accuracy is below this
  ROOT_CAUSE_ACCURACY_FLOOR: 0.65,
} as const;

export const REVIEW_PERIOD_DAYS = {
  // Section 11 — an attempt only counts as a genuine "delayed" retention
  // check if there's been a real gap since the skill was last practiced.
  MIN_GAP_FOR_RETENTION_CHECK: 2,
};
