import { store } from '../data/store';
import { EffectivenessResult } from '../types/domain';
import { MasteryState, TransferState, RetentionState } from '../types/evidence';

/**
 * ============================================================================
 * INTEGRATION POINT: Feature 14 (Mastery + Transfer)
 * ============================================================================
 * Feature 14 owns mastery, independence, transfer, and retention state
 * (Section 30). Feature 16 must never declare mastery itself — it only ever
 * SENDS evidence here and reads back whatever Feature 14 decides.
 *
 * This file is a local mock standing in for that real service, since Feature
 * 14 is not part of this codebase. Replace `submitEvidence` and
 * `getMasteryState` with real calls to your Feature 14 API/service — every
 * other module in Feature 16 talks to Feature 14 exclusively through this
 * file, so that's the only place that needs to change.
 */

export interface MasteryEvidencePayload {
  studentId: string;
  skillId: string;
  microSkillId?: string;
  effectiveness: EffectivenessResult;
  interventionType: string;
  rootCause: string;
}

export interface MasteryUpdate {
  masteryState: MasteryState;
  transferState: TransferState;
  retentionState: RetentionState;
}

export async function submitEvidence(payload: MasteryEvidencePayload): Promise<MasteryUpdate> {
  // TODO(integration): replace this body with a real call to Feature 14, e.g.
  //   return feature14ApiClient.submitEvidence(payload);
  const existing = store.getMasteryState(payload.studentId, payload.skillId);
  const nextMastery: MasteryState = payload.effectiveness.improved
    ? existing?.masteryState === 'mastered'
      ? 'mastered'
      : 'proficient'
    : (existing?.masteryState as MasteryState) ?? 'developing';

  const nextTransfer: TransferState =
    payload.effectiveness.transferStatus === 'not_assessed'
      ? (existing?.transferState as TransferState) ?? 'not_assessed'
      : (payload.effectiveness.transferStatus as TransferState);

  const update: MasteryUpdate = {
    masteryState: nextMastery,
    transferState: nextTransfer,
    retentionState: 'stable',
  };

  store.upsertMasteryState({
    studentId: payload.studentId,
    skillId: payload.skillId,
    microSkillId: payload.microSkillId,
    masteryState: update.masteryState,
    transferState: update.transferState,
    retentionState: update.retentionState,
    readinessState: 'developing',
    updatedAt: new Date().toISOString(),
  });

  return update;
}

export function getMasteryState(studentId: string, skillId: string): MasteryUpdate {
  const rec = store.getMasteryState(studentId, skillId);
  return {
    masteryState: (rec?.masteryState as MasteryState) ?? 'not_started',
    transferState: (rec?.transferState as TransferState) ?? 'not_assessed',
    retentionState: (rec?.retentionState as RetentionState) ?? 'stable',
  };
}
