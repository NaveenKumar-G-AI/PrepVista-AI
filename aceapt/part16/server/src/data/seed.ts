import { store } from './store';
import { PROFIT_LOSS_SKILL_ID } from './skillGraph';

export const DEMO_STUDENT_ID = 'student_demo';

/**
 * Seeds a believable BEFORE state: solid general accuracy on Profit & Loss
 * (concept + calculation are fine) so that when the demo attempt fails on
 * strategy selection specifically, the diagnosis reads as "strategy gap
 * against a strong foundation" rather than "everything is broken" — matching
 * the Section 48 scenario (Concept: Strong, Calculation: Strong, Strategy: Weak).
 */
export function seedDemoData(): void {
  store.upsertStudent({ id: DEMO_STUDENT_ID, displayName: 'Demo Student' });

  const priorAttempts: { correct: boolean }[] = [
    { correct: true },
    { correct: true },
    { correct: true },
    { correct: false },
    { correct: true },
    { correct: true },
    { correct: true },
    { correct: true },
  ];

  for (const a of priorAttempts) {
    store.addAttempt({
      studentId: DEMO_STUDENT_ID,
      skillId: PROFIT_LOSS_SKILL_ID,
      questionId: `seed_${Math.random().toString(36).slice(2, 8)}`,
      correct: a.correct,
      responseTimeSeconds: 45,
      expectedTimeSeconds: 50,
      difficulty: 'medium',
      questionType: 'standard',
      hintsUsed: 0,
      prerequisiteSkillIds: [],
    });
  }

  store.upsertMasteryState({
    studentId: DEMO_STUDENT_ID,
    skillId: PROFIT_LOSS_SKILL_ID,
    masteryState: 'developing',
    transferState: 'not_assessed',
    retentionState: 'stable',
    readinessState: 'developing',
    updatedAt: new Date().toISOString(),
  });

  store.upsertJourneyState({
    studentId: DEMO_STUDENT_ID,
    currentSkillId: PROFIT_LOSS_SKILL_ID,
    status: 'advancing',
    lastReplannedAt: new Date().toISOString(),
    note: 'On track — next up in the journey is Profit & Loss reverse problems.',
  });
}
