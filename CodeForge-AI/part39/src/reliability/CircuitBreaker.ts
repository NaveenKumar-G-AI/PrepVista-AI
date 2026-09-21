import { CircuitOpenError } from '../errors';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitRecord {
  state: CircuitState;
  failuresInWindow: number;
  windowStartedAt: number;
  openedAt?: number;
  halfOpenProbeInFlight: boolean;
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  windowMs: number;
  cooldownMs: number;
}

/**
 * Classic Closed -> Open -> Half-Open -> Closed state machine, keyed per
 * provider+model. See tests/circuitBreaker.test.ts for explicit
 * transition coverage.
 *
 *   CLOSED  --(failuresInWindow >= threshold)-->  OPEN
 *   OPEN    --(cooldownMs elapses)-->              HALF_OPEN (single probe allowed through)
 *   HALF_OPEN --(probe succeeds)-->                 CLOSED
 *   HALF_OPEN --(probe fails)-->                     OPEN (cooldown restarts)
 */
export class CircuitBreaker {
  private circuits = new Map<string, CircuitRecord>();

  private getOrCreate(key: string): CircuitRecord {
    let c = this.circuits.get(key);
    if (!c) {
      c = { state: 'CLOSED', failuresInWindow: 0, windowStartedAt: Date.now(), halfOpenProbeInFlight: false };
      this.circuits.set(key, c);
    }
    return c;
  }

  state(key: string): CircuitState {
    return this.getOrCreate(key).state;
  }

  /** Call before attempting a provider call. Throws if the call must not proceed. */
  beforeCall(key: string, opts: CircuitBreakerOptions): void {
    const c = this.getOrCreate(key);

    if (c.state === 'OPEN') {
      const elapsedSinceOpen = Date.now() - (c.openedAt ?? 0);
      if (elapsedSinceOpen >= opts.cooldownMs) {
        c.state = 'HALF_OPEN';
        c.halfOpenProbeInFlight = false;
      } else {
        throw new CircuitOpenError(key);
      }
    }

    if (c.state === 'HALF_OPEN') {
      if (c.halfOpenProbeInFlight) {
        // Only one probe is allowed through at a time — everything else
        // fails fast rather than piling onto a provider we're not sure
        // has recovered.
        throw new CircuitOpenError(key);
      }
      c.halfOpenProbeInFlight = true;
    }
  }

  onSuccess(key: string): void {
    const c = this.getOrCreate(key);
    c.state = 'CLOSED';
    c.failuresInWindow = 0;
    c.windowStartedAt = Date.now();
    c.halfOpenProbeInFlight = false;
    c.openedAt = undefined;
  }

  onFailure(key: string, opts: CircuitBreakerOptions): void {
    const c = this.getOrCreate(key);

    if (c.state === 'HALF_OPEN') {
      // Probe failed — back to OPEN, cooldown restarts.
      c.state = 'OPEN';
      c.openedAt = Date.now();
      c.halfOpenProbeInFlight = false;
      return;
    }

    const now = Date.now();
    if (now - c.windowStartedAt > opts.windowMs) {
      // Rolling window expired — start counting fresh.
      c.failuresInWindow = 0;
      c.windowStartedAt = now;
    }
    c.failuresInWindow++;

    if (c.failuresInWindow >= opts.failureThreshold) {
      c.state = 'OPEN';
      c.openedAt = now;
    }
  }

  snapshot(key: string): CircuitRecord & { key: string } {
    return { key, ...this.getOrCreate(key) };
  }

  listAll(): Array<CircuitRecord & { key: string }> {
    return [...this.circuits.entries()].map(([key, record]) => ({ key, ...record }));
  }
}

export const circuitBreaker = new CircuitBreaker();
