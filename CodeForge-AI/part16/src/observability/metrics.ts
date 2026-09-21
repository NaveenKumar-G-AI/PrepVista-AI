export interface Metrics {
  increment(name: string, tags?: Record<string, string>): void;
  timing(name: string, ms: number, tags?: Record<string, string>): void;
}

export class MemoryMetrics implements Metrics {
  counters: Array<{ name: string; tags?: Record<string, string> }> = [];
  timings: Array<{ name: string; ms: number; tags?: Record<string, string> }> = [];
  increment(name: string, tags?: Record<string, string>) {
    this.counters.push({ name, tags });
  }
  timing(name: string, ms: number, tags?: Record<string, string>) {
    this.timings.push({ name, ms, tags });
  }
}

export const noopMetrics: Metrics = {
  increment: () => {},
  timing: () => {},
};
