/**
 * PrepVista AI — Part 15
 * Minimal typed event bus (Section 53). Built on Node's EventEmitter — zero
 * external dependency. Production should route these onto the shared event
 * architecture from Parts 1-14 (Kafka/SNS/BullMQ/etc.) rather than keeping
 * them in-process; this implementation exists so Part 15's services can
 * publish events without depending on knowing which transport Parts 1-14 use.
 */

import { EventEmitter } from "node:events";
import type { StrategyEventName } from "../types/placement-strategy.types.js";

export interface StrategyEvent {
  name: StrategyEventName;
  payload: Record<string, unknown>;
  timestamp: string;
}

export class StrategyEventBus extends EventEmitter {
  private log: StrategyEvent[] = [];

  publish(name: StrategyEventName, payload: Record<string, unknown>): StrategyEvent {
    const event: StrategyEvent = { name, payload, timestamp: new Date().toISOString() };
    this.log.push(event);
    this.emit(name, event);
    this.emit("*", event);
    return event;
  }

  getLog(): StrategyEvent[] {
    return this.log;
  }

  clearLog(): void {
    this.log = [];
  }
}

export const strategyEventBus = new StrategyEventBus();

export function emitEvent(name: StrategyEventName, payload: Record<string, unknown>): StrategyEvent {
  return strategyEventBus.publish(name, payload);
}
