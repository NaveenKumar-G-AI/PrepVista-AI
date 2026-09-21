import crypto from 'node:crypto';
import { store } from '../data/store';
import { diagnose } from './diagnosticEngine';
import { selectIntervention, InterventionRecommendation } from './interventionSelector';
import { evaluateEffectiveness } from './effectiveness';
import { updateProfile } from './studentProfile';
import { eventBus } from '../events/eventBus';
import * as feature14Client from '../integration/feature14Client';
import * as feature15Client from '../integration/feature15Client';
import { updateTrajectorySignal } from '../integration/otherFeatureClients';
import { AttemptEvidence, StudentSkillHistory } from '../types/evidence';
import { Diagnosis } from '../types/diagnosis';
import { InterventionRecord, EffectivenessResult } from '../types/domain';
import { EscalationLevel } from '../types/intervention';

export interface AttemptOutcome {
  diagnosis: Diagnosis;
  intervention: InterventionRecord | null;
  recommendation: InterventionRecommendation | null;
}

function effectivenessAccuracy(studentId: string, skillId: string, microSkillId?: string): number {
  if (microSkillId) {
    return store.getRecentAccuracyForMicroSkill(studentId, microSkillId).accuracy;
  }
  return store.getRecentAccuracy(studentId, skillId).accuracy;
}

function buildHistory(evidence: AttemptEvidence): StudentSkillHistory {
  const recentAccuracy = [evidence.skillId, ...evidence.prerequisiteSkillIds].map((skillId) => {
    const { accuracy, sampleSize } = store.getRecentAccuracy(evidence.studentId, skillId);
    return { skillId, accuracy, sampleSize };
  });
  const historicalAccuracy = [evidence.skillId, ...evidence.prerequisiteSkillIds].map((skillId) => {
    const { accuracy, sampleSize } = store.getHistoricalAccuracy(evidence.studentId, skillId);
    return { skillId, accuracy, sampleSize };
  });
  const mastery = feature14Client.getMasteryState(evidence.studentId, evidence.skillId);
  const interventionHistory = store.getInterventionHistory(evidence.studentId, evidence.skillId).map((i) => ({
    interventionId: i.id,
    skillId: i.skillId,
    rootCause: i.rootCause,
    interventionType: i.interventionType,
    escalationLevel: i.escalationLevel,
    outcome:
      i.status === 'completed_improved' ? ('improved' as const) : i.status === 'completed_not_improved' ? ('not_improved' as const) : ('in_progress' as const),
    createdAt: i.createdAt,
  }));

  return {
    studentId: evidence.studentId,
    skillId: evidence.skillId,
    recentAccuracy,
    historicalAccuracy,
    masteryState: mastery.masteryState,
    transferState: mastery.transferState,
    retentionState: mastery.retentionState,
    readinessState: 'developing',
    interventionHistory,
  };
}

/**
 * STUDENT ATTEMPT -> PERFORMANCE EVIDENCE -> DIAGNOSTIC ENGINE -> ROOT-CAUSE
 * ANALYSIS -> INTERVENTION SELECTION. This is the first half of the core loop.
 */
export async function handleAttempt(evidence: AttemptEvidence): Promise<AttemptOutcome> {
  const history = buildHistory(evidence);
  const diagnosis = diagnose(evidence, history);

  store.addAttempt(evidence);
  store.addDiagnosis(diagnosis);
  eventBus.emitEvent('DIAGNOSTIC_CREATED', evidence.studentId, { attemptId: diagnosis.attemptId, primary: diagnosis.primary });

  if (evidence.correct) {
    return { diagnosis, intervention: null, recommendation: null };
  }

  const priorHistoryForSkill = history.interventionHistory;
  const profile = store.getProfile(evidence.studentId);
  const recommendation = selectIntervention(diagnosis, priorHistoryForSkill, profile);

  const beforeAccuracy = effectivenessAccuracy(evidence.studentId, evidence.skillId, evidence.microSkillId);

  const intervention: InterventionRecord = {
    id: crypto.randomUUID(),
    studentId: evidence.studentId,
    skillId: evidence.skillId,
    microSkillId: evidence.microSkillId,
    rootCause: recommendation.rootCause,
    interventionType: recommendation.interventionType,
    escalationLevel: recommendation.escalationLevel,
    status: 'recommended',
    beforeAccuracy,
    createdAt: new Date().toISOString(),
    sourceAttemptId: diagnosis.attemptId,
  };
  store.addIntervention(intervention);

  eventBus.emitEvent('INTERVENTION_RECOMMENDED', evidence.studentId, {
    interventionId: intervention.id,
    interventionType: intervention.interventionType,
    escalationLevel: intervention.escalationLevel,
  });

  await feature15Client.notifyStruggle(evidence.studentId, evidence.skillId, diagnosis.primary.cause);

  return { diagnosis, intervention, recommendation };
}

export function startIntervention(interventionId: string): InterventionRecord | undefined {
  const updated = store.updateIntervention(interventionId, {
    status: 'in_progress',
    startedAt: new Date().toISOString(),
  });
  if (updated) {
    eventBus.emitEvent('INTERVENTION_STARTED', updated.studentId, { interventionId }, `started:${interventionId}`);
  }
  return updated;
}

export interface ReassessmentOutcome {
  intervention: InterventionRecord;
  effectiveness: EffectivenessResult;
  nextRecommendation: InterventionRecommendation | null;
  masteryUpdate: Awaited<ReturnType<typeof feature14Client.submitEvidence>>;
  journeyUpdate: Awaited<ReturnType<typeof feature15Client.notifyResolved>>;
}

/**
 * REASSESSMENT -> DID THE STUDENT IMPROVE? -> (VERIFY MASTERY | CHANGE
 * STRATEGY) -> FEATURE 14 -> FEATURE 15. This is the second half of the loop.
 */
export async function reassessIntervention(
  interventionId: string,
  reassessmentEvidence: AttemptEvidence,
  transferCheck?: { correct: boolean }
): Promise<ReassessmentOutcome | null> {
  const intervention = store.getIntervention(interventionId);
  if (!intervention) return null;

  store.addAttempt(reassessmentEvidence);
  const afterAccuracy = effectivenessAccuracy(intervention.studentId, intervention.skillId, intervention.microSkillId);

  // A transfer check, when provided, is a single unfamiliar-framing question
  // (Section 26/48's "Transfer Challenge"). One question is a weak sample size —
  // this is a quick signal for the UI, not a substitute for Feature 14's own
  // transfer-mastery verification over multiple attempts.
  const transferAccuracy = transferCheck ? (transferCheck.correct ? 1 : 0) : undefined;
  const effectiveness = evaluateEffectiveness(intervention.beforeAccuracy ?? 0, afterAccuracy, transferAccuracy);

  const updated = store.updateIntervention(interventionId, {
    status: effectiveness.improved ? 'completed_improved' : 'completed_not_improved',
    afterAccuracy,
    completedAt: new Date().toISOString(),
  })!;

  eventBus.emitEvent('REASSESSMENT_COMPLETED', intervention.studentId, { interventionId, improved: effectiveness.improved });
  eventBus.emitEvent(
    effectiveness.improved ? 'INTERVENTION_SUCCEEDED' : 'INTERVENTION_FAILED',
    intervention.studentId,
    { interventionId },
    `${effectiveness.improved ? 'succeeded' : 'failed'}:${interventionId}`
  );
  eventBus.emitEvent('INTERVENTION_COMPLETED', intervention.studentId, { interventionId }, `completed:${interventionId}`);

  const profile = store.getProfile(intervention.studentId);
  const updatedProfile = updateProfile(profile, intervention.interventionType, effectiveness.improved);
  store.saveProfile(updatedProfile);

  const masteryUpdate = await feature14Client.submitEvidence({
    studentId: intervention.studentId,
    skillId: intervention.skillId,
    microSkillId: intervention.microSkillId,
    effectiveness,
    interventionType: intervention.interventionType,
    rootCause: intervention.rootCause,
  });

  const journeyUpdate = await feature15Client.notifyResolved(intervention.studentId, intervention.skillId, effectiveness.improved);

  let nextRecommendation: InterventionRecommendation | null = null;

  if (!effectiveness.improved) {
    eventBus.emitEvent(
      'INTERVENTION_ESCALATED',
      intervention.studentId,
      { interventionId, fromLevel: intervention.escalationLevel },
      `escalated:${interventionId}`
    );
    await updateTrajectorySignal(intervention.studentId, intervention.skillId, 'repeated_failure');

    // Re-run selection so the caller can immediately offer the next approach
    // rather than making the student re-submit the same failing attempt.
    const history = buildHistory(reassessmentEvidence);
    const diagnosis = diagnose(reassessmentEvidence, history);
    nextRecommendation = selectIntervention(diagnosis, history.interventionHistory, updatedProfile);
  } else {
    await updateTrajectorySignal(intervention.studentId, intervention.skillId, 'resolved');
  }

  return { intervention: updated, effectiveness, nextRecommendation, masteryUpdate, journeyUpdate };
}

export function escalationLabel(level: EscalationLevel): string {
  return EscalationLevel[level];
}
