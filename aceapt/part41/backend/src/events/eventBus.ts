import { EventEmitter } from 'node:events';

/** spec #61: EVENT ARCHITECTURE. */
export type Feature41Event =
  | 'strategy_created' | 'strategy_updated' | 'decision_created' | 'decision_completed'
  | 'action_started' | 'action_completed' | 'action_skipped'
  | 'recommendation_generated' | 'recommendation_feedback'
  | 'experiment_started' | 'experiment_completed'
  | 'outcome_recorded' | 'bottleneck_detected' | 'strategy_reviewed';

/**
 * Thin wrapper so call sites don't depend on which event system ACEAPT
 * actually runs (Kafka/SNS/in-process). Swap the internals of publish() for
 * your real event infra; keep the publish(event, payload) call sites as-is.
 * Payloads are deliberately IDs/enums only — never raw decision text or
 * other sensitive content (spec #72: "do not log private decision content
 * unnecessarily").
 */
class Feature41EventBus extends EventEmitter {
  publish(event: Feature41Event, payload: Record<string, unknown>): void {
    this.emit(event, { event, payload, at: new Date().toISOString() });
  }
}

export const eventBus = new Feature41EventBus();
