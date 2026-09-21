// ============================================================================
// Decay detection.
//
// "Do NOT use universal forgetting rules. Learn from student-specific
// evidence." `delayDaysSinceLastSuccess` is read only relative to the
// student's own PersonalDecayProfile, and it's just one of several signals
// — never used alone to move risk state.
// ============================================================================

import { RetentionEvidence, RetentionRiskState, RISK_STATE_ORDER } from '../domain/types';

/**
 * A student's own empirically-observed forgetting behavior, distinct from
 * any universal curve. `expectedHalfLifeDays` is how long this student's
 * recall on similar concepts tends to hold up before success rate
 * meaningfully drops. It starts at a neutral cold-start prior.
 *
 * Re-estimating this from a student's growing history (e.g. regressing
 * their own delay-vs-success-rate pairs, with shrinkage toward the
 * population prior while sampleSize is low) is intentionally out of scope
 * for this prototype — see ARCHITECTURE_ASSUMPTIONS.md. What matters here
 * is that the rest of the engine depends only on this shape, so a real
 * model can replace the constant below without touching call sites.
 */
export interface PersonalDecayProfile {
  studentId: string;
  expectedHalfLifeDays: number;
  sampleSize: number;
}

export const DEFAULT_DECAY_PROFILE = (studentId: string): PersonalDecayProfile => ({
  studentId,
  expectedHalfLifeDays: 10,
  sampleSize: 0,
});

export interface DecayAssessment {
  nextRiskState: RetentionRiskState;
  weakening: boolean;
  rationale: string[];
}

const DROP = { moderate: 0.3, severe: 0.5 };

/**
 * Rules-based risk transition, driven primarily by whether the attempt
 * that just happened was itself correct — with corroborating evidence
 * (baseline gap, transfer weakness, staleness) setting the *magnitude* of
 * the move rather than independently triggering one.
 *
 * This matters: a rolling recentSuccessRate average still "remembers"
 * older misses for several attempts after a student has started
 * recovering, so gating escalation on the window average alone means risk
 * keeps climbing even through a run of correct answers. Anchoring on the
 * latest attempt fixes that, while the window still shapes how big each
 * step is. Risk is not a one-way ratchet — a strong, corroborated recent
 * run can recover it one step at a time.
 */
export function assessDecay(
  evidence: RetentionEvidence,
  currentRisk: RetentionRiskState,
  profile: PersonalDecayProfile,
  latestAttemptCorrect: boolean
): DecayAssessment {
  const rationale: string[] = [];
  const currentIdx = RISK_STATE_ORDER.indexOf(currentRisk);
  let delta = 0;

  if (!latestAttemptCorrect) {
    delta += 1;
    if (evidence.baselineSuccessRate !== null && evidence.recentSuccessRate !== null) {
      const drop = evidence.baselineSuccessRate - evidence.recentSuccessRate;
      if (drop >= DROP.severe) {
        delta += 1;
        rationale.push(`Recent success is well below this concept's mastery baseline (down ~${Math.round(drop * 100)} pts).`);
      } else if (drop >= DROP.moderate) {
        rationale.push('Recent success has dropped noticeably from baseline.');
      }
    }
    if (evidence.transferSuccessRate !== null && evidence.transferSuccessRate < 0.5) {
      delta += 1;
      rationale.push('Transfer questions on this concept are being missed.');
    }
  } else {
    const recentlyStrong = (evidence.recentSuccessRate ?? 0) >= 0.6;
    const transferOk = evidence.transferSuccessRate === null || evidence.transferSuccessRate >= 0.6;
    if (currentIdx > 0 && recentlyStrong && transferOk && evidence.attemptCount >= 3) {
      delta -= 1;
      rationale.push('Recent evidence is strong and consistent — retention risk is easing.');
    }
  }

  const staleWithoutFreshEvidence =
    evidence.delayDaysSinceLastSuccess !== null &&
    evidence.delayDaysSinceLastSuccess > profile.expectedHalfLifeDays &&
    evidence.attemptCount < 2;
  if (staleWithoutFreshEvidence) {
    delta = Math.max(delta, 1);
    rationale.push("It has been longer than this student's usual retention window with no fresh check.");
  }

  if (evidence.contextDiversityScore < 0.3 && evidence.attemptCount >= 4) {
    // Informational only — flags that mastery may be narrower than it looks,
    // without by itself moving the risk state.
    rationale.push('Success so far comes from very similar contexts — mastery may be narrower than it looks.');
  }

  const nextIdx = Math.min(RISK_STATE_ORDER.length - 1, Math.max(0, currentIdx + delta));

  return {
    nextRiskState: RISK_STATE_ORDER[nextIdx],
    weakening: nextIdx > currentIdx,
    rationale,
  };
}
