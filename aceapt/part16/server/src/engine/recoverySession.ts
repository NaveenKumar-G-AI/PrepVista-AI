import crypto from 'node:crypto';
import { RootCause } from '../types/rootCause';
import { RecoverySession, RecoveryStep } from '../types/domain';

const STEP_TEMPLATES: { type: RecoveryStep['type']; title: string; minutes: number }[] = [
  { type: 'clarification', title: 'Strategy clarification', minutes: 2 },
  { type: 'contrast', title: 'Contrast practice', minutes: 3 },
  { type: 'guided', title: 'Guided problem', minutes: 3 },
  { type: 'independent', title: 'Independent challenge', minutes: 3 },
  { type: 'transfer', title: 'Transfer verification', minutes: 3 },
];

/**
 * Builds a recovery session (Section 21) — used once a repeated pattern of
 * related errors is detected, rather than after a single wrong answer.
 */
export function buildRecoverySession(args: {
  studentId: string;
  skillId: string;
  microSkillId?: string;
  rootCause: RootCause;
  triggeringPattern: string;
}): RecoverySession {
  const steps: RecoveryStep[] = STEP_TEMPLATES.map((t, i) => ({
    index: i,
    type: t.type,
    title: t.title,
    estimatedMinutes: t.minutes,
    status: 'pending',
  }));

  return {
    id: crypto.randomUUID(),
    studentId: args.studentId,
    skillId: args.skillId,
    microSkillId: args.microSkillId,
    triggeringPattern: args.triggeringPattern,
    rootCause: args.rootCause,
    steps,
    status: 'in_progress',
    createdAt: new Date().toISOString(),
  };
}

export function completeStep(session: RecoverySession, stepIndex: number): RecoverySession {
  const steps = session.steps.map((s) => (s.index === stepIndex ? { ...s, status: 'completed' as const } : s));
  const allDone = steps.every((s) => s.status === 'completed');
  return {
    ...session,
    steps,
    status: allDone ? 'completed' : 'in_progress',
    completedAt: allDone ? new Date().toISOString() : session.completedAt,
  };
}
