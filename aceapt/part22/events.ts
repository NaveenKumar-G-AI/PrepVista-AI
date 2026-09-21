import { PathfinderEvent } from "./types";

type Listener = (event: PathfinderEvent) => void;

/**
 * Minimal in-memory event emitter standing in for ACEAPT's real event bus
 * (Section 47). Swap `publish` to call `config.eventBus.url` once that
 * infrastructure exists — nothing else in this codebase needs to change,
 * since callers only ever depend on `eventBus.publish` / `eventBus.on`.
 */
class PathfinderEventBus {
  private listeners: Listener[] = [];
  private log: PathfinderEvent[] = [];

  on(listener: Listener): void {
    this.listeners.push(listener);
  }

  publish(event: PathfinderEvent): void {
    this.log.push(event);
    for (const listener of this.listeners) listener(event);
  }

  history(): PathfinderEvent[] {
    return [...this.log];
  }
}

export const eventBus = new PathfinderEventBus();
