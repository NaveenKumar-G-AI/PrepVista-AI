import { EventEmitter } from "node:events";

/** Spec section 59's event chain. This in-process EventEmitter is a stand-in
 * for whatever event/queue infrastructure ACEAPT already runs on — the
 * orchestrator only depends on the emit/on shape below, so swapping this for
 * Kafka/SQS/etc. is a drop-in replacement. */
export const FORECAST_EVENTS = {
  ASSESSMENT_COMPLETED: "ASSESSMENT_COMPLETED",
  CAPABILITY_UPDATED: "CAPABILITY_UPDATED",
  FORECAST_TRIGGERED: "FORECAST_TRIGGERED",
  TRAJECTORY_UPDATED: "TRAJECTORY_UPDATED",
  RISK_RECALCULATED: "RISK_RECALCULATED",
  FORECAST_PUBLISHED: "FORECAST_PUBLISHED",
  FEATURE26_UPDATED: "FEATURE26_UPDATED",
} as const;

export type ForecastEventName = (typeof FORECAST_EVENTS)[keyof typeof FORECAST_EVENTS];

export class TypedEventBus {
  private emitter = new EventEmitter();

  emit(event: ForecastEventName, payload: unknown): void {
    this.emitter.emit(event, payload);
  }

  on(event: ForecastEventName, handler: (payload: any) => void): () => void {
    this.emitter.on(event, handler);
    return () => {
      this.emitter.off(event, handler);
    };
  }
}
