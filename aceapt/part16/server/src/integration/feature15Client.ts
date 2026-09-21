import { store } from '../data/store';

/**
 * ============================================================================
 * INTEGRATION POINT: Feature 15 (Dynamic Personal Mastery Path / Journey)
 * ============================================================================
 * Feature 15 owns where the student goes next (Section 31). Feature 16 owns
 * how to recover when the student is struggling. The contract:
 *   Feature 15 -> next skill -> student struggles -> Feature 16 diagnoses and
 *   intervenes -> verifies -> notifies Feature 15 -> Feature 15 replans.
 *
 * This file is a local mock standing in for that real service. Replace
 * `notifyStruggle`, `notifyResolved`, and `replan` with real calls to your
 * Feature 15 API/service.
 */

export interface JourneyUpdate {
  currentSkillId: string;
  status: string;
  note: string;
}

export async function notifyStruggle(studentId: string, skillId: string, rootCause: string): Promise<void> {
  // TODO(integration): replace with a real call, e.g. feature15ApiClient.notifyStruggle(...)
  const existing = store.getJourneyState(studentId);
  store.upsertJourneyState({
    studentId,
    currentSkillId: skillId,
    currentMicroSkillId: existing?.currentMicroSkillId,
    status: 'in_recovery',
    lastReplannedAt: existing?.lastReplannedAt ?? new Date().toISOString(),
    note: `Paused forward progression on ${skillId} while Feature 16 addresses a ${rootCause}.`,
  });
}

export async function notifyResolved(studentId: string, skillId: string, improved: boolean): Promise<JourneyUpdate> {
  // TODO(integration): replace with a real call, e.g. feature15ApiClient.notifyResolved(...)
  return replan(studentId, skillId, improved);
}

export async function replan(studentId: string, skillId: string, improved: boolean): Promise<JourneyUpdate> {
  // TODO(integration): replace with a real call to Feature 15's replanning endpoint.
  const update: JourneyUpdate = improved
    ? {
        currentSkillId: skillId,
        status: 'advancing',
        note: 'Gap resolved — journey resumes forward progression, now including a transfer checkpoint for this skill.',
      }
    : {
        currentSkillId: skillId,
        status: 'in_recovery',
        note: 'Gap not yet resolved — journey holds here while Feature 16 tries a different intervention.',
      };

  store.upsertJourneyState({
    studentId,
    currentSkillId: update.currentSkillId,
    status: update.status,
    lastReplannedAt: new Date().toISOString(),
    note: update.note,
  });

  return update;
}

export function getJourneyState(studentId: string): JourneyUpdate | undefined {
  const rec = store.getJourneyState(studentId);
  if (!rec) return undefined;
  return { currentSkillId: rec.currentSkillId, status: rec.status, note: rec.note };
}
