/**
 * §79 event taxonomy + §80 educational metrics. The north-star (§81) is student independence
 * after assistance, not hint count — the metrics below are written to make that measurable,
 * not to flatter engagement.
 */

import { HintInteraction, HintOutcome, HintOutcomeResultEnum } from "../domain/types";

export type AnalyticsEventName =
  | "hint_requested"
  | "hint_auto_offered"
  | "hint_shown"
  | "hint_helpful"
  | "hint_ineffective"
  | "hint_escalated"
  | "hint_different_strategy"
  | "hint_solution_revealed"
  | "hint_abandoned"
  | "hint_validation_failed"
  | "independent_after_hint";

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  studentId: string;
  sessionId: string;
  problemId: string;
  stepId?: string;
  properties?: Record<string, unknown>;
  at: string;
}

export interface AnalyticsSink {
  emit(event: AnalyticsEvent): void;
}

/** Reference sink: structured console logging. Swap for the real event pipeline in production. */
export class ConsoleAnalyticsSink implements AnalyticsSink {
  emit(event: AnalyticsEvent): void {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ type: "aceapt.feature48.analytics", ...event }));
  }
}

export function makeEvent(
  name: AnalyticsEventName,
  base: { studentId: string; sessionId: string; problemId: string; stepId?: string },
  properties?: Record<string, unknown>,
): AnalyticsEvent {
  return { name, ...base, properties, at: new Date().toISOString() };
}

// -----------------------------------------------------------------------------------------
// §80 educational metrics — pure functions over interaction/outcome history.
// -----------------------------------------------------------------------------------------

export interface HintRecord {
  interaction: HintInteraction;
  outcome?: HintOutcome;
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function firstHintSuccessRate(records: HintRecord[]): number {
  const firstHints = groupFirstPerStep(records);
  const successes = firstHints.filter((r) => r.outcome?.result === HintOutcomeResultEnum.SUCCESS).length;
  return rate(successes, firstHints.length);
}

export function recoveryRate(records: HintRecord[]): number {
  const withOutcome = records.filter((r) => r.outcome);
  const recovered = withOutcome.filter(
    (r) => r.outcome!.result === HintOutcomeResultEnum.SUCCESS || r.outcome!.result === HintOutcomeResultEnum.PARTIAL,
  ).length;
  return rate(recovered, withOutcome.length);
}

export function escalationRate(records: HintRecord[]): number {
  const byStep = groupByStep(records);
  const stepsWithMultipleHints = [...byStep.values()].filter((g) => g.length > 1).length;
  return rate(stepsWithMultipleHints, byStep.size);
}

export function wrongHintRate(records: HintRecord[]): number {
  const withOutcome = records.filter((r) => r.outcome);
  const wrong = withOutcome.filter(
    (r) => r.outcome!.result === HintOutcomeResultEnum.INAPPROPRIATE || r.outcome!.result === HintOutcomeResultEnum.CONFUSION,
  ).length;
  return rate(wrong, withOutcome.length);
}

export function independentConversionRate(records: HintRecord[]): number {
  const withOutcome = records.filter((r) => r.outcome?.subsequentIndependence !== undefined);
  const independent = withOutcome.filter((r) => r.outcome!.subsequentIndependence).length;
  return rate(independent, withOutcome.length);
}

function groupByStep(records: HintRecord[]): Map<string, HintRecord[]> {
  const map = new Map<string, HintRecord[]>();
  for (const r of records) {
    const key = `${r.interaction.sessionId}:${r.interaction.problemId}:${r.interaction.stepId}`;
    map.set(key, [...(map.get(key) ?? []), r]);
  }
  return map;
}

function groupFirstPerStep(records: HintRecord[]): HintRecord[] {
  return [...groupByStep(records).values()].map(
    (group) => group.slice().sort((a, b) => a.interaction.shownAt.localeCompare(b.interaction.shownAt))[0],
  );
}
