import {
  RetentionEvidence,
  RetentionAssessment,
  RecoverySession,
  MemoryStateName,
  ConfidenceLevel,
  Trend,
  FailureType,
  DELAYED_SOURCES,
  EvidenceSource,
} from '../types';
import { RETENTION_CONFIG as CFG } from '../config';
import { average, variance, clamp01, daysBetweenIso } from '../utils/math';

/**
 * This module is the deterministic core the spec insists on: no LLM ever
 * decides retention state, evidence weighting, or confidence. AI is only
 * used downstream (explanationEngine) to describe what this module already
 * computed — never to compute it.
 */

export interface AssessRetentionInput {
  studentId: string;
  skillId: string;
  evidence: RetentionEvidence[];
  recoverySessions: RecoverySession[];
  now?: Date;
  targetImportance?: number; // 0..1, from StudentTarget.skillImportance
}

function isDelayed(e: RetentionEvidence) {
  return DELAYED_SOURCES.has(e.source);
}

/**
 * Sources fair to use as the "peak" baseline that decline is measured
 * against. Deliberately excludes recovery_immediate_verification /
 * recovery_step: a score taken seconds after a targeted re-explanation is
 * expected to be temporarily inflated, and using it as the bar the next
 * delayed check must clear produces false decay alarms (a 79% delayed
 * check right after a 100% immediate check is a GOOD outcome per spec
 * section 36, not evidence of new decline).
 */
const PEAK_ELIGIBLE_SOURCES: ReadonlySet<EvidenceSource> = new Set(['initial_assessment', 'practice']);

function classifyConfidence(delayedCount: number, recentVariance: number): ConfidenceLevel {
  if (delayedCount === 0) return 'LOW';
  if (delayedCount === 1) return 'LOW';
  if (delayedCount === 2) return recentVariance < CFG.MAX_VARIANCE_FOR_MEDIUM ? 'MEDIUM' : 'LOW';
  // 3+ checks
  return recentVariance < CFG.MAX_VARIANCE_FOR_HIGH ? 'HIGH' : 'MEDIUM';
}

function classifyTrend(delayed: RetentionEvidence[]): Trend {
  if (delayed.length < 2) return 'INSUFFICIENT_DATA';
  const last = delayed[delayed.length - 1].performance;
  const prev = delayed[delayed.length - 2].performance;
  const diff = last - prev;
  if (diff > 0.05) return 'IMPROVING';
  if (diff < -0.05) return 'DECLINING';
  return 'STABLE';
}

function classifyState(params: {
  hasDelayedEvidence: boolean;
  retentionScore: number;
  decline: number;
  daysSinceLast: number;
}): MemoryStateName {
  if (!params.hasDelayedEvidence) return 'RECENTLY_LEARNED';
  const { retentionScore, decline, daysSinceLast } = params;

  if (retentionScore <= CFG.FORGOTTEN_MIN_PERFORMANCE && daysSinceLast > CFG.FORGOTTEN_MIN_DAYS_ELAPSED) {
    return 'FORGOTTEN';
  }
  if (retentionScore <= CFG.AT_RISK_MIN_PERFORMANCE || decline > CFG.DECAYING_DECLINE_THRESHOLD) {
    return 'AT_RISK';
  }
  if (decline > CFG.STABLE_DECLINE_THRESHOLD) {
    return 'DECAYING';
  }
  return 'STABLE';
}

/**
 * Counts how many times a skill has apparently "come back" after looking
 * verified-stable — i.e. genuine recurring forgetting (spec section 23),
 * not just a single dip. This is computed from immutable history
 * (RecoverySession + RetentionEvidence records), never from a mutable
 * incremented counter, so it stays reproducible.
 */
function countRelapses(sessions: RecoverySession[], evidence: RetentionEvidence[]): number {
  const verifiedStable = sessions.filter((s) => s.status === 'VERIFIED_STABLE' && s.delayedVerificationAt);
  let relapses = 0;
  for (const s of verifiedStable) {
    const laterDelayed = evidence.filter(
      (e) => isDelayed(e) && new Date(e.timestamp).getTime() > new Date(s.delayedVerificationAt as string).getTime(),
    );
    if (laterDelayed.length === 0) continue;
    const laterAvg = average(laterDelayed.map((e) => e.performance));
    if (laterAvg < CFG.AT_RISK_MIN_PERFORMANCE + 0.1) relapses += 1;
  }
  return relapses;
}

function computeRetentionRisk(params: {
  decline: number;
  daysSinceLast: number;
  recurringWeakness: boolean;
  targetImportance: number;
}): number {
  let risk = clamp01(params.decline * CFG.RISK_DECLINE_WEIGHT);
  risk += Math.min(params.daysSinceLast / CFG.RISK_TIME_DIVISOR_DAYS, CFG.RISK_TIME_CAP);
  if (params.recurringWeakness) risk += CFG.RISK_RECURRING_BONUS;
  risk *= CFG.RISK_TARGET_IMPORTANCE_FLOOR + CFG.RISK_TARGET_IMPORTANCE_WEIGHT * params.targetImportance;
  return clamp01(risk);
}

export function assessRetention(input: AssessRetentionInput): RetentionAssessment {
  const now = input.now ?? new Date();
  const targetImportance = input.targetImportance ?? 0.5;
  const evidence = [...input.evidence].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const base = {
    studentId: input.studentId,
    skillId: input.skillId,
  };

  // An open recovery session takes precedence over whatever the raw
  // evidence would otherwise suggest: if we're mid-recovery, the honest
  // thing to show the student is "recovering", not a stale AT_RISK label
  // computed from evidence that predates the intervention.
  const openSession = [...input.recoverySessions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .find((s) => s.status === 'IN_PROGRESS' || s.status === 'AWAITING_DELAYED_VERIFICATION');

  if (evidence.length === 0) {
    return {
      ...base,
      masteryScore: null,
      retentionScore: null,
      memoryState: 'NOT_LEARNED',
      confidence: 'LOW',
      retentionRisk: null,
      trend: 'INSUFFICIENT_DATA',
      recurringWeakness: false,
      escalationLevel: 0,
      lastEvidenceAt: null,
      evidenceCount: 0,
      delayedEvidenceCount: 0,
      currentRecoveryStatus: openSession?.status ?? null,
      explanationKey: 'NO_EVIDENCE',
    };
  }

  const delayedEvidence = evidence.filter(isDelayed);
  const learningPhaseEvidence = evidence.filter((e) => !isDelayed(e));
  const lastEvidenceAt = evidence[evidence.length - 1].timestamp;
  const daysSinceLast = daysBetweenIso(lastEvidenceAt, now.toISOString());

  const masteryScore = learningPhaseEvidence.length > 0 ? average(learningPhaseEvidence.map((e) => e.performance)) : null;

  const relapses = countRelapses(input.recoverySessions, evidence);
  const priorAttempts = input.recoverySessions.length;
  const recurringWeakness = relapses >= 1 || priorAttempts >= CFG.RECOVERY_CYCLES_BEFORE_ESCALATION;
  const escalationLevel = relapses + (priorAttempts >= CFG.RECOVERY_CYCLES_BEFORE_ESCALATION ? 1 : 0);

  // If the most recent recovery cycle has already resolved, treat it as a
  // fresh chapter (spec section 37: LEARNED -> DECAYED -> RECOVERED ->
  // VERIFIED -> STABLE): current mastery/retention/peak/decline/confidence
  // are computed from evidence AT OR AFTER that cycle started, not blended
  // with the pre-recovery decayed history that the recovery was meant to
  // fix. Relapse/recurring-weakness detection above still uses the FULL
  // history — that's the one place old cycles must stay visible.
  // evidenceCount/delayedEvidenceCount below intentionally still report
  // the full lifetime count.
  const lastResolvedSession = [...input.recoverySessions]
    .filter((s) => s.status === 'VERIFIED_STABLE' || s.status === 'VERIFICATION_FAILED')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const windowStart = lastResolvedSession ? new Date(lastResolvedSession.createdAt).getTime() : null;
  const windowedEvidence = windowStart != null ? evidence.filter((e) => new Date(e.timestamp).getTime() >= windowStart) : evidence;

  const windowedDelayed = windowedEvidence.filter(isDelayed);
  const windowedLearningPhase = windowedEvidence.filter((e) => !isDelayed(e));

  if (delayedEvidence.length === 0) {
    return {
      ...base,
      masteryScore,
      retentionScore: null,
      memoryState: openSession ? 'RECOVERING' : 'RECENTLY_LEARNED',
      confidence: 'LOW',
      retentionRisk: null,
      trend: 'INSUFFICIENT_DATA',
      recurringWeakness,
      escalationLevel,
      lastEvidenceAt,
      evidenceCount: evidence.length,
      delayedEvidenceCount: 0,
      currentRecoveryStatus: openSession?.status ?? null,
      explanationKey: openSession ? 'RECOVERING' : 'RECENTLY_LEARNED_NO_DELAYED_CHECK',
    };
  }

  const recentWindow = windowedDelayed.slice(-CFG.RECENT_DELAYED_WINDOW);
  const retentionScore = recentWindow.length > 0 ? average(recentWindow.map((e) => e.performance)) : null;
  const peakCandidates = [
    ...windowedLearningPhase.filter((e) => PEAK_ELIGIBLE_SOURCES.has(e.source)).map((e) => e.performance),
    ...(windowedDelayed[0] ? [windowedDelayed[0].performance] : []),
  ];
  const peak = peakCandidates.length > 0 ? Math.max(...peakCandidates) : null;
  const decline = peak != null && retentionScore != null ? clamp01(peak - retentionScore) : 0;

  const recentVariance = variance(windowedDelayed.slice(-3).map((e) => e.performance));
  const confidence = classifyConfidence(windowedDelayed.length, recentVariance);
  const trend = classifyTrend(windowedDelayed);

  const rawState =
    retentionScore == null
      ? openSession
        ? 'RECOVERING'
        : 'RECENTLY_LEARNED'
      : classifyState({ hasDelayedEvidence: true, retentionScore, decline, daysSinceLast });
  const memoryState: MemoryStateName = openSession ? 'RECOVERING' : rawState;

  const retentionRisk = retentionScore == null ? null : computeRetentionRisk({ decline, daysSinceLast, recurringWeakness, targetImportance });

  let explanationKey = 'STABLE';
  if (openSession) explanationKey = openSession.status === 'AWAITING_DELAYED_VERIFICATION' ? 'VERIFICATION_REQUIRED' : 'RECOVERING';
  else if (recurringWeakness && (rawState === 'AT_RISK' || rawState === 'DECAYING' || rawState === 'FORGOTTEN')) explanationKey = 'RECURRING_WEAKNESS';
  else if (rawState === 'AT_RISK') explanationKey = 'AT_RISK';
  else if (rawState === 'DECAYING') explanationKey = 'DECAYING';
  else if (rawState === 'FORGOTTEN') explanationKey = 'FORGOTTEN';

  return {
    ...base,
    masteryScore,
    retentionScore,
    memoryState,
    confidence,
    retentionRisk,
    trend,
    recurringWeakness,
    escalationLevel,
    lastEvidenceAt,
    evidenceCount: evidence.length,
    delayedEvidenceCount: delayedEvidence.length,
    currentRecoveryStatus: openSession?.status ?? null,
    explanationKey,
  };
}

/**
 * Heuristic failure classifier (spec sections 21 & 25). This is explicitly
 * a heuristic over question-type-tagged performance, not a validated
 * diagnostic model — its accuracy depends entirely on how well evidence is
 * tagged. In a real ACEAPT integration this should incorporate the
 * existing error taxonomy (section 33) rather than the lightweight
 * `context` tag convention used here.
 */
export function classifyFailureType(evidence: RetentionEvidence[]): FailureType {
  const delayed = evidence.filter(isDelayed);
  if (delayed.length === 0) return 'NONE';

  const byType = (t: RetentionEvidence['questionType']) => delayed.filter((e) => e.questionType === t);
  const avgOf = (arr: RetentionEvidence[]) => (arr.length ? average(arr.map((e) => e.performance)) : null);

  const calcErrorTagged = delayed.filter((e) => e.context === 'calculation_error');
  if (delayed.length > 0 && calcErrorTagged.length / delayed.length > 0.4) return 'EXECUTION_FAILURE';

  const recognitionAvg = avgOf(byType('recognition'));
  const recallAvg = avgOf(byType('recall'));
  const applicationAvg = avgOf(byType('application'));
  const transferAvg = avgOf(byType('transfer'));

  if (recognitionAvg !== null && recallAvg !== null && recognitionAvg - recallAvg > 0.25) {
    return 'RETRIEVAL_FAILURE'; // recognizes it, can't produce it unaided
  }
  if (recallAvg !== null && recallAvg >= 0.6 && applicationAvg !== null && applicationAvg < 0.5) {
    return 'APPLICATION_FAILURE'; // knows the method, not when to use it
  }
  if (recallAvg !== null && recallAvg >= 0.6 && transferAvg !== null && transferAvg < 0.5) {
    return 'TRANSFER_FAILURE'; // fine on familiar form, fails novel variations
  }
  if (recallAvg !== null && recallAvg < 0.4 && (recognitionAvg === null || recognitionAvg < 0.6)) {
    return 'CONCEPT_FAILURE'; // no evidence of understanding at all right now
  }
  // No sharp discriminating pattern in the evidence: default to the least
  // invasive hypothesis rather than guessing at a deeper problem.
  return 'RETRIEVAL_FAILURE';
}
