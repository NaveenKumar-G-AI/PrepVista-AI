import { config } from '../config/index.js';
import { filterAlgorithmicEvidence } from '../mastery/estimators.js';
import type { Evidence, GapAssessment, GapType, StudentSkillState } from '../types.js';

/**
 * Classifies the TYPE of weakness for one skill from real evidence, not just
 * "score is low". Different gap types call for different interventions
 * (Phase 11), so getting the type right matters as much as detecting that a
 * gap exists at all.
 */
export function detectGap(state: StudentSkillState | null, evidenceIn: Evidence[]): GapAssessment | null {
  const skillId = state?.skillId ?? (evidenceIn[0]?.skillId as string);
  const evidence = filterAlgorithmicEvidence(evidenceIn); // Phase 34: syntax/load noise never drives a gap classification

  // No meaningful evidence -> UNKNOWN is not WEAK (Phase 21). Not a gap to remediate, a candidate to explore.
  if (!state || state.evidenceCount < config.gaps.insufficientEvidenceMinCount) {
    return {
      skillId, gapType: 'INSUFFICIENT_EVIDENCE', severity: 0.2,
      explanation: `Only ${state?.evidenceCount ?? 0} piece(s) of evidence exist for this skill — not enough to assess mastery either way.`,
    };
  }

  // Transfer gap: does fine on STANDARD-context evidence, struggles on NOVEL-context evidence for the same skill.
  const standardEvidence = evidence.filter((e) => e.contextType === 'STANDARD');
  const novelEvidence = evidence.filter((e) => e.contextType === 'NOVEL');
  if (standardEvidence.length > 0 && novelEvidence.length > 0) {
    const standardAvg = standardEvidence.reduce((a, e) => a + e.rawScore, 0) / standardEvidence.length;
    const novelAvg = novelEvidence.reduce((a, e) => a + e.rawScore, 0) / novelEvidence.length;
    if (standardAvg >= config.gaps.transferGapMinStandardScore && novelAvg <= config.gaps.transferGapMaxNovelScore) {
      return {
        skillId, gapType: 'TRANSFER_GAP', severity: 0.7,
        explanation: `Strong on standard-context problems (${Math.round(standardAvg * 100)}%) but weak once the context changes (${Math.round(novelAvg * 100)}%) — the concept isn't yet transferring to unfamiliar framing.`,
      };
    }
  }

  // Retention gap: mastery was previously higher and a meaningful gap has passed since strong evidence.
  const sorted = [...evidence].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const last = sorted[sorted.length - 1];
  const daysSinceLast = (Date.now() - new Date(last.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  const priorStrong = sorted.slice(0, -1).some((e) => e.rawScore >= 0.8 && e.independent);
  if (priorStrong && last.rawScore < 0.5 && daysSinceLast <= 1 /* i.e. we are assessing right after a fresh weak attempt */) {
    // Only call this RETENTION if there's an actual time gap earlier in the evidence stream, not just noise.
    const gapDays = sorted.length >= 2
      ? (new Date(sorted[sorted.length - 1].createdAt).getTime() - new Date(sorted[sorted.length - 2].createdAt).getTime()) / (1000 * 60 * 60 * 24)
      : 0;
    if (gapDays >= config.gaps.retentionGapMinGapDays) {
      return {
        skillId, gapType: 'RETENTION_GAP', severity: 0.5,
        explanation: `Previously showed strong independent performance, but the most recent attempt (after a ${Math.round(gapDays)}-day gap) was weak — likely decay rather than never having learned it.`,
      };
    }
  }

  // Complexity gap: recent failures cluster on COMPLEXITY_ISSUE (timeouts).
  const recent = evidence.slice(-config.mastery.repeatedMistakeWindow);
  const complexityCount = recent.filter((e) => e.mistakeCategory === 'COMPLEXITY_ISSUE').length;
  if (complexityCount >= 2) {
    return {
      skillId, gapType: 'COMPLEXITY_GAP', severity: 0.6,
      explanation: `${complexityCount} of the last ${recent.length} attempts timed out — the approach works but isn't efficient enough (wrong complexity class), not a correctness problem.`,
    };
  }

  // Debugging gap: state-management / runtime errors on otherwise-passing logic.
  const debugCount = recent.filter((e) => e.mistakeCategory === 'STATE_MANAGEMENT_ERROR' || e.mistakeCategory === 'RUNTIME_ERROR').length;
  if (debugCount >= 1 && state.masteryScore < config.mastery.stateScoreThresholds.COMPETENT) {
    return {
      skillId, gapType: 'DEBUGGING_GAP', severity: 0.6,
      explanation: `Recent attempts show ${debugCount} state-management/runtime failure(s) on otherwise-reasonable approaches — the gap is in verifying and debugging behavior across a full sequence of operations, not the core idea.`,
    };
  }

  // Boundary/application gap: mostly failing on BOUNDARY_CONDITION.
  const boundaryCount = recent.filter((e) => e.mistakeCategory === 'BOUNDARY_CONDITION').length;
  if (boundaryCount >= 1 && state.masteryScore < config.mastery.stateScoreThresholds.STRONG) {
    return {
      skillId, gapType: 'APPLICATION_GAP', severity: 0.5,
      explanation: `Core approach is right but edge/boundary cases are mishandled in ${boundaryCount} recent attempt(s) — an application-of-the-concept gap, not a conceptual one.`,
    };
  }

  // Prerequisite gap is detected by prerequisiteAnalyzer.ts (needs the skill graph); this module flags a generic knowledge gap as the default when mastery is genuinely low without a more specific pattern.
  if (state.masteryScore < config.mastery.stateScoreThresholds.DEVELOPING) {
    return {
      skillId, gapType: 'KNOWLEDGE_GAP', severity: 0.65,
      explanation: `Mastery score (${state.masteryScore}) reflects fundamentally inconsistent or incorrect results across attempts — the core concept itself needs work.`,
    };
  }

  return null; // no meaningful gap — skill is developing acceptably
}

export function rankGapsBySeverity(gaps: GapAssessment[]): GapAssessment[] {
  return [...gaps].sort((a, b) => b.severity - a.severity);
}

export type { GapType };
