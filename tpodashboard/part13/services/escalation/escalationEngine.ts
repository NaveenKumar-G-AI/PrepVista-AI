// services/escalation/escalationEngine.ts
//
// Sections 17/56 — persistent, unresolved problems get louder over time.
// Escalation only moves severity upward, only while a signal is open
// (never touches SNOOZED, RESOLVED, EXPIRED, DISMISSED — sections 18/20),
// and always records why, so it stays explainable.

import type { ProactiveSignal, Severity } from '../signals/types';
import { SEVERITY_RANK } from '../signals/types';
import type { SignalRepository } from '../signals/repository';
import { SIGNAL_REGISTRY, type EscalationStep } from '../signals/registry';

export function nextEscalatedSeverity(
  signal: Pick<ProactiveSignal, 'signalType' | 'severity' | 'detectedAt'>,
  now: Date,
): { severity: Severity; step: EscalationStep } | null {
  const definition = SIGNAL_REGISTRY[signal.signalType];
  if (!definition || definition.escalation.length === 0) return null;

  const hoursOpen = (now.getTime() - new Date(signal.detectedAt).getTime()) / (1000 * 60 * 60);

  // Walk from the longest threshold the signal already qualifies for, so
  // a signal open 40 hours jumps straight to the 24h step, not the 6h one.
  const eligible = [...definition.escalation].filter((s) => hoursOpen >= s.afterHours).sort((a, b) => b.afterHours - a.afterHours)[0];

  if (!eligible) return null;
  if (SEVERITY_RANK[eligible.escalateTo] <= SEVERITY_RANK[signal.severity]) return null; // never downgrade, never repeat

  return { severity: eligible.escalateTo, step: eligible };
}

// Deliberately excludes SNOOZED: a snoozed signal is intentionally quiet
// until its snooze window ends (section 18), and re-enters escalation
// timing from whenever it's next evaluated as open again.
const OPEN_FOR_ESCALATION: ProactiveSignal['status'][] = ['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS'];

export interface EscalationSweepResult {
  scanned: number;
  escalated: { signalId: string; from: Severity; to: Severity }[];
}

export async function runEscalationSweep(repository: SignalRepository, now: Date = new Date()): Promise<EscalationSweepResult> {
  const open = await repository.listByStatuses(OPEN_FOR_ESCALATION);
  const escalated: EscalationSweepResult['escalated'] = [];

  for (const signal of open) {
    const result = nextEscalatedSeverity(signal, now);
    if (!result) continue;

    await repository.update(signal.id, {
      severity: result.severity,
      priorityBucket: result.severity,
      lastUpdatedAt: now.toISOString(),
      escalationHistory: [
        ...signal.escalationHistory,
        {
          at: now.toISOString(),
          from: signal.severity,
          to: result.severity,
          reason: `Unresolved for ${result.step.afterHours}+ hours.`,
        },
      ],
    });

    escalated.push({ signalId: signal.id, from: signal.severity, to: result.severity });
  }

  return { scanned: open.length, escalated };
}
