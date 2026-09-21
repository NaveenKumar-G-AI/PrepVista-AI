// ============================================================================
// Reactivation engine.
//
// WEAKENING → MICRO RECALL → TARGETED HINT → GUIDED REPAIR → SIMILAR
// QUESTION → TRANSFER QUESTION → RETAINED AGAIN.
//
// "Minimum necessary intervention": a repair attempt starts at whatever the
// *current* level already is; we only escalate on failure, and a success at
// any level moves straight to verification instead of working through the
// remaining levels for completeness.
// ============================================================================

import { ReactivationSession, ReactivationStep, ReactivationLevel } from '../domain/types';

const LEVEL_KIND: Record<ReactivationLevel, ReactivationStep['kind']> = {
  1: 'recall_prompt',
  2: 'small_hint',
  3: 'concept_reminder',
  4: 'guided_solve',
  5: 'targeted_lesson',
};

export function startReactivationSession(
  id: string,
  studentId: string,
  conceptId: string,
  now: string
): ReactivationSession {
  return {
    id,
    studentId,
    conceptId,
    startedAt: now,
    completedAt: null,
    currentLevel: 1,
    outcome: 'in_progress',
    steps: [],
  };
}

export type ReactivationAction =
  | { kind: 'repair_step'; level: ReactivationLevel; stepKind: ReactivationStep['kind'] }
  | { kind: 'similar_question' }
  | { kind: 'transfer_question' }
  | { kind: 'done'; outcome: 'retained_again' | 'escalated' };

export interface ReactivationDecision {
  session: ReactivationSession;
  nextAction: ReactivationAction;
}

function nextLevel(level: ReactivationLevel): ReactivationLevel {
  return (Math.min(5, level + 1) as ReactivationLevel);
}

/**
 * Advances the state machine by one graded step. `phase` says what kind of
 * step was just attempted; `succeeded` is whatever the caller's question
 * engine already determined.
 */
export function recordReactivationOutcome(
  session: ReactivationSession,
  phase: 'repair' | 'similar' | 'transfer',
  succeeded: boolean,
  attemptId: string,
  now: string
): ReactivationDecision {
  if (phase === 'repair') {
    session.steps.push({
      level: session.currentLevel,
      kind: LEVEL_KIND[session.currentLevel],
      attemptId,
      succeeded,
      timestamp: now,
    });

    if (succeeded) {
      return { session, nextAction: { kind: 'similar_question' } };
    }
    if (session.currentLevel >= 5) {
      session.outcome = 'escalated';
      session.completedAt = now;
      return { session, nextAction: { kind: 'done', outcome: 'escalated' } };
    }
    session.currentLevel = nextLevel(session.currentLevel);
    return {
      session,
      nextAction: { kind: 'repair_step', level: session.currentLevel, stepKind: LEVEL_KIND[session.currentLevel] },
    };
  }

  if (phase === 'similar') {
    session.steps.push({ level: session.currentLevel, kind: 'similar_question', attemptId, succeeded, timestamp: now });
    if (succeeded) return { session, nextAction: { kind: 'transfer_question' } };

    // A missed "similar question" right after a successful repair step
    // means the repair didn't really stick — escalate one level rather
    // than looping the same repair forever.
    if (session.currentLevel >= 5) {
      session.outcome = 'escalated';
      session.completedAt = now;
      return { session, nextAction: { kind: 'done', outcome: 'escalated' } };
    }
    session.currentLevel = nextLevel(session.currentLevel);
    return {
      session,
      nextAction: { kind: 'repair_step', level: session.currentLevel, stepKind: LEVEL_KIND[session.currentLevel] },
    };
  }

  // phase === 'transfer'
  session.steps.push({ level: session.currentLevel, kind: 'transfer_question', attemptId, succeeded, timestamp: now });
  if (succeeded) {
    session.outcome = 'retained_again';
    session.completedAt = now;
    return { session, nextAction: { kind: 'done', outcome: 'retained_again' } };
  }
  if (session.currentLevel >= 5) {
    session.outcome = 'escalated';
    session.completedAt = now;
    return { session, nextAction: { kind: 'done', outcome: 'escalated' } };
  }
  session.currentLevel = nextLevel(session.currentLevel);
  return {
    session,
    nextAction: { kind: 'repair_step', level: session.currentLevel, stepKind: LEVEL_KIND[session.currentLevel] },
  };
}

export function firstRepairAction(session: ReactivationSession): ReactivationAction {
  return { kind: 'repair_step', level: session.currentLevel, stepKind: LEVEL_KIND[session.currentLevel] };
}
