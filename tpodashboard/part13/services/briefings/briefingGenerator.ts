// services/briefings/briefingGenerator.ts
//
// Pure aggregation — every number here is counted from the signals you
// pass in. There is no fabricated-content path (section 87: "No
// fabricated alert. No random numbers.").

import type { ProactiveSignal, Severity } from '../signals/types';

const OPEN: ProactiveSignal['status'][] = ['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS'];

function countBySeverity(signals: ProactiveSignal[]): Record<Severity, number> {
  const base: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  for (const s of signals) {
    if (s.polarity === 'RISK' && OPEN.includes(s.status)) base[s.severity]++;
  }
  return base;
}

export interface DailyBriefing {
  generatedAt: string;
  institutionId: string;
  counts: Record<Severity, number>;
  positiveCount: number;
  topPriorities: { signalId: string; title: string; priorityScore: number }[];
  positiveHighlights: { signalId: string; title: string }[];
}

export function generateDailyBriefing(institutionId: string, signals: ProactiveSignal[], topN = 3): DailyBriefing {
  const scoped = signals.filter((s) => s.institutionId === institutionId);
  const risk = scoped.filter((s) => s.polarity === 'RISK' && OPEN.includes(s.status));
  const positive = scoped.filter((s) => s.polarity === 'POSITIVE' && (s.status === 'NEW' || s.status === 'ACKNOWLEDGED'));

  const topPriorities = [...risk]
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, topN)
    .map((s) => ({ signalId: s.id, title: s.title, priorityScore: s.priorityScore }));

  return {
    generatedAt: new Date().toISOString(),
    institutionId,
    counts: countBySeverity(scoped),
    positiveCount: positive.length,
    topPriorities,
    positiveHighlights: positive.slice(0, 3).map((s) => ({ signalId: s.id, title: s.title })),
  };
}

export interface EndOfDayBriefing {
  generatedAt: string;
  institutionId: string;
  resolvedToday: number;
  newToday: number;
  stillUnresolved: number;
  improved: number;
}

export function generateEndOfDayBriefing(institutionId: string, signals: ProactiveSignal[], since: Date): EndOfDayBriefing {
  const scoped = signals.filter((s) => s.institutionId === institutionId);
  const sinceIso = since.toISOString();

  const resolvedToday = scoped.filter((s) => s.resolvedAt && s.resolvedAt >= sinceIso).length;
  const newToday = scoped.filter((s) => s.detectedAt >= sinceIso).length;
  const stillUnresolved = scoped.filter((s) => ['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS', 'SNOOZED'].includes(s.status)).length;
  const improved = scoped.filter(
    (s) => s.polarity === 'RISK' && s.updateHistory.some((u) => u.at >= sinceIso && u.note.includes('Affected count changed')),
  ).length;

  return { generatedAt: new Date().toISOString(), institutionId, resolvedToday, newToday, stillUnresolved, improved };
}

export interface WeeklyIntelligence {
  generatedAt: string;
  institutionId: string;
  window: EndOfDayBriefing;
  currentPriorities: DailyBriefing['topPriorities'];
  positiveOutcomes: DailyBriefing['positiveHighlights'];
}

export function generateWeeklyIntelligence(institutionId: string, signals: ProactiveSignal[], sevenDaysAgo: Date): WeeklyIntelligence {
  const window = generateEndOfDayBriefing(institutionId, signals, sevenDaysAgo);
  const daily = generateDailyBriefing(institutionId, signals, 5);
  return {
    generatedAt: new Date().toISOString(),
    institutionId,
    window,
    currentPriorities: daily.topPriorities,
    positiveOutcomes: daily.positiveHighlights,
  };
}

export interface ManagementBriefing {
  generatedAt: string;
  institutionId: string;
  strategicSignals: { signalId: string; title: string; summary: string; severity: Severity }[];
  positiveHighlights: { signalId: string; title: string }[];
}

/** Sections 43/73 — management only ever sees signals whose audience list
 * includes MANAGEMENT. TPO-only operational chatter never reaches this
 * briefing — enforced by the same audience field every other view uses. */
export function generateManagementBriefing(institutionId: string, signals: ProactiveSignal[]): ManagementBriefing {
  const scoped = signals.filter((s) => s.institutionId === institutionId && s.audiences.includes('MANAGEMENT'));
  const risk = scoped.filter((s) => s.polarity === 'RISK' && OPEN.includes(s.status));
  const positive = scoped.filter((s) => s.polarity === 'POSITIVE');

  return {
    generatedAt: new Date().toISOString(),
    institutionId,
    strategicSignals: [...risk]
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .map((s) => ({ signalId: s.id, title: s.title, summary: s.summary, severity: s.severity })),
    positiveHighlights: positive.slice(0, 3).map((s) => ({ signalId: s.id, title: s.title })),
  };
}
