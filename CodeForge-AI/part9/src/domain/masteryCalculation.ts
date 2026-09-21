import {
  DECAY_WINDOW_DAYS,
  EVIDENCE_BASE_QUALITY,
  RECENCY_HALF_LIFE_DAYS,
  REPETITION_DISCOUNT,
  STATE_THRESHOLDS,
  CONFIDENCE_WEIGHTS,
  type MasteryState,
} from './config.js';
import type { MasteryResult, SkillEvidence } from './types.js';

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, (a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function recencyWeight(createdAt: string, now: Date): number {
  const age = daysBetween(now, new Date(createdAt));
  return Math.pow(0.5, age / RECENCY_HALF_LIFE_DAYS);
}

function baseQuality(e: SkillEvidence): number {
  if (!e.passed) return EVIDENCE_BASE_QUALITY.independentFail;
  if (e.solutionViewed) return EVIDENCE_BASE_QUALITY.solutionViewedThenPassed;
  if (e.isTransfer) return EVIDENCE_BASE_QUALITY.transferPass;
  if (e.source === 'TIMED_ASSESSMENT') return EVIDENCE_BASE_QUALITY.timedAssessmentPass;
  if (e.source === 'TECHNICAL_INTERVIEW') return EVIDENCE_BASE_QUALITY.technicalInterviewPass;
  if (e.source === 'RETENTION_TEST') return EVIDENCE_BASE_QUALITY.retentionCheckPass;
  if (!e.independent) {
    if (e.hintsUsed >= 3) return EVIDENCE_BASE_QUALITY.hintAssistedPass_heavy;
    if (e.hintsUsed >= 1) return EVIDENCE_BASE_QUALITY.hintAssistedPass_light;
    return EVIDENCE_BASE_QUALITY.guidedPass;
  }
  if (e.difficulty === 'hard') return EVIDENCE_BASE_QUALITY.independentPass_hard;
  if (e.difficulty === 'medium') return EVIDENCE_BASE_QUALITY.independentPass_medium;
  return EVIDENCE_BASE_QUALITY.independentPass_easy;
}

/**
 * PHASE 6 / 7 / 76: pure, deterministic mastery calculation.
 *  - No evidence -> UNKNOWN. Never WEAK-by-default ("unknown must remain unknown").
 *  - Zero dependency on any AI call or database, so this keeps working even
 *    if every AI provider AND the network are down (PHASE 38, 52, 73).
 */
export function calculateMastery(evidenceIn: SkillEvidence[], now: Date = new Date()): MasteryResult {
  const evidence = evidenceIn
    .filter((e) => !e.supersededByCorrection)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (evidence.length === 0) {
    return {
      state: 'UNKNOWN',
      confidence: 0,
      rawScore: 0,
      evidenceCount: 0,
      independentPassCount: 0,
      transferPassCount: 0,
      highStakesPassCount: 0,
      lastQualifyingEvidenceAt: null,
      isStale: false,
      reasons: ['No evidence has been recorded for this skill yet.'],
    };
  }

  const seenPerProblem = new Map<string, number>();
  let rawScore = 0;
  let independentPassCount = 0;
  let transferPassCount = 0;
  let highStakesPassCount = 0;
  let guidedPassCount = 0;
  let anyPass = false;
  let lastQualifyingEvidenceAt: string | null = null;
  const recentIndependentOutcomes: boolean[] = [];
  const difficultiesPassedIndependently = new Set<string>();

  for (const e of evidence) {
    const priorCount = e.problemId ? seenPerProblem.get(e.problemId) ?? 0 : 0;
    if (e.problemId) seenPerProblem.set(e.problemId, priorCount + 1);

    if (e.independent && (e.source === 'PRACTICE' || e.source === 'DEBUGGING')) {
      recentIndependentOutcomes.push(e.passed);
    }

    if (!e.passed) continue;
    anyPass = true;

    const q = baseQuality(e);
    const rec = recencyWeight(e.createdAt, now);
    const rep = e.problemId ? REPETITION_DISCOUNT.curve(priorCount) : 1;
    rawScore += q * rec * rep;

    const isHighStakes = e.source === 'TIMED_ASSESSMENT' || e.source === 'TECHNICAL_INTERVIEW' || e.source === 'RETENTION_TEST';
    if (isHighStakes) {
      highStakesPassCount += 1;
      lastQualifyingEvidenceAt = e.createdAt;
    }
    if (e.isTransfer) {
      transferPassCount += 1;
      lastQualifyingEvidenceAt = e.createdAt;
    }
    if (e.independent && !e.solutionViewed) {
      independentPassCount += 1;
      difficultiesPassedIndependently.add(e.difficulty);
      lastQualifyingEvidenceAt = e.createdAt;
    } else if (!e.independent) {
      guidedPassCount += 1;
    }
  }

  const reasons: string[] = [];
  const recentFails = recentIndependentOutcomes
    .slice(-STATE_THRESHOLDS.recentFailWindow)
    .filter((passed) => !passed).length;

  let state: MasteryState;

  if (!anyPass) {
    state = 'EXPOSED';
    reasons.push('There is attempt evidence but no recorded passing attempt yet.');
  } else if (independentPassCount === 0 && guidedPassCount > 0) {
    state = 'LEARNING';
    reasons.push('The student has passed with guidance but has not yet passed independently.');
  } else if (
    independentPassCount < STATE_THRESHOLDS.minIndependentPassesForFunctional ||
    difficultiesPassedIndependently.size < 1 ||
    recentFails >= STATE_THRESHOLDS.recentFailStreakForDevelopingCap
  ) {
    state = 'DEVELOPING';
    reasons.push(`${independentPassCount} independent pass(es) recorded so far.`);
    if (recentFails >= STATE_THRESHOLDS.recentFailStreakForDevelopingCap) {
      reasons.push(
        `${recentFails} of the last ${STATE_THRESHOLDS.recentFailWindow} independent attempts did not pass, so the state is capped until performance stabilizes.`
      );
    }
  } else if (
    independentPassCount >= STATE_THRESHOLDS.minIndependentPassesForFunctional &&
    difficultiesPassedIndependently.size < STATE_THRESHOLDS.minDistinctDifficultiesForFunctional &&
    transferPassCount === 0
  ) {
    state = 'FUNCTIONAL';
    reasons.push(
      `${independentPassCount} independent passes across ${difficultiesPassedIndependently.size} difficulty level(s).`
    );
  } else if (
    (transferPassCount > 0 || difficultiesPassedIndependently.has('hard')) &&
    !(
      independentPassCount >= STATE_THRESHOLDS.minIndependentPassesForMastered &&
      transferPassCount > 0 &&
      highStakesPassCount > 0
    )
  ) {
    state = 'STRONG';
    reasons.push('Independent success now spans multiple difficulty levels.');
    if (transferPassCount > 0) {
      reasons.push(`${transferPassCount} unfamiliar transfer problem(s) solved without being told which pattern to use.`);
    }
  } else if (
    independentPassCount >= STATE_THRESHOLDS.minIndependentPassesForMastered &&
    (!STATE_THRESHOLDS.requireTransferForMastered || transferPassCount > 0) &&
    (!STATE_THRESHOLDS.requireHighStakesForMastered || highStakesPassCount > 0)
  ) {
    state = 'MASTERED';
    reasons.push(
      `${independentPassCount} independent passes, ${transferPassCount} transfer pass(es), and ${highStakesPassCount} high-stakes pass(es) (timed assessment, interview, or retention check).`
    );
  } else {
    state = 'FUNCTIONAL';
    reasons.push('Independent success recorded; more varied evidence is needed to move further.');
  }

  // Staleness overrides STRONG/MASTERED specifically (PHASE 12 / 83).
  let isStale = false;
  if ((state === 'STRONG' || state === 'MASTERED') && lastQualifyingEvidenceAt) {
    const windowDays = DECAY_WINDOW_DAYS[state];
    const age = daysBetween(now, new Date(lastQualifyingEvidenceAt));
    if (age > windowDays) {
      isStale = true;
      reasons.push(
        `No qualifying evidence in the last ${Math.round(age)} days (decay window is ${windowDays} days for ${state}), so this is now due for reverification.`
      );
      state = 'STALE';
    }
  }

  // Confidence is calculated separately from state (PHASE 60) — it answers
  // "how much do we trust this state?", not "what is the state?".
  const passedEvidence = evidence.filter((e) => e.passed);
  const volumeScore = 1 - Math.exp(-passedEvidence.length / 5);
  const distinctSources = new Set(passedEvidence.map((e) => e.source)).size;
  const diversityScore = Math.min(1, distinctSources / 4);
  const avgRecency =
    passedEvidence.length === 0
      ? 0
      : passedEvidence.reduce((sum, e) => sum + recencyWeight(e.createdAt, now), 0) / passedEvidence.length;
  const independentAttempts = recentIndependentOutcomes.length;
  const independentFailures = recentIndependentOutcomes.filter((p) => !p).length;
  const consistencyScore = independentAttempts === 0 ? 0.5 : 1 - independentFailures / independentAttempts;

  const confidence = Math.max(
    0,
    Math.min(
      1,
      CONFIDENCE_WEIGHTS.volume * volumeScore +
        CONFIDENCE_WEIGHTS.diversity * diversityScore +
        CONFIDENCE_WEIGHTS.recency * avgRecency +
        CONFIDENCE_WEIGHTS.consistency * consistencyScore
    )
  );

  return {
    state,
    confidence: Math.round(confidence * 100) / 100,
    rawScore: Math.round(rawScore * 100) / 100,
    evidenceCount: evidence.length,
    independentPassCount,
    transferPassCount,
    highStakesPassCount,
    lastQualifyingEvidenceAt,
    isStale,
    reasons,
  };
}
