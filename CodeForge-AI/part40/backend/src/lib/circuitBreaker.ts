/**
 * CIRCUIT BREAKER
 * -----------------------------------------------------------------------
 * HEALTHY(CLOSED) -> FAILURES -> OPEN -> RECOVERY PROBE(HALF_OPEN) -> HEALTHY
 *
 * Deliberately dependency-free and synchronous-state so it is trivial to
 * unit test (see tests/unit.circuitBreaker.test.ts) and to reason about.
 * One instance per protected dependency (e.g. one for the AI gateway, one
 * for the code-execution sandbox) — do not share instances across
 * unrelated dependencies, or one flaky dependency will trip the breaker
 * for an unrelated healthy one.
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  /** Consecutive failures (in CLOSED) before the breaker opens. */
  failureThreshold: number;
  /** Consecutive successes (in HALF_OPEN) before the breaker fully closes. */
  successThreshold: number;
  /** How long the breaker stays OPEN before allowing a single recovery probe. */
  openDurationMs: number;
  /** Optional label used only for logging/telemetry. */
  name: string;
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit "${name}" is OPEN — call rejected without hitting the dependency`);
    this.name = "CircuitOpenError";
  }
}

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private openedAtMs: number | null = null;

  constructor(private readonly opts: CircuitBreakerOptions) {}

  getState(): CircuitState {
    this.maybeTransitionToHalfOpen();
    return this.state;
  }

  private setState(next: CircuitState) {
    if (next === this.state) return;
    const prev = this.state;
    this.state = next;
    this.opts.onStateChange?.(prev, next);
  }

  private maybeTransitionToHalfOpen() {
    if (this.state === "OPEN" && this.openedAtMs !== null) {
      if (Date.now() - this.openedAtMs >= this.opts.openDurationMs) {
        this.setState("HALF_OPEN");
        this.consecutiveSuccesses = 0;
      }
    }
  }

  /** Runs `fn` if the circuit permits it; throws CircuitOpenError otherwise without invoking `fn`. */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.maybeTransitionToHalfOpen();

    if (this.state === "OPEN") {
      throw new CircuitOpenError(this.opts.name);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    if (this.state === "HALF_OPEN") {
      this.consecutiveSuccesses += 1;
      if (this.consecutiveSuccesses >= this.opts.successThreshold) {
        this.consecutiveFailures = 0;
        this.openedAtMs = null;
        this.setState("CLOSED");
      }
    } else if (this.state === "CLOSED") {
      this.consecutiveFailures = 0;
    }
  }

  private onFailure() {
    if (this.state === "HALF_OPEN") {
      // A single failure during the recovery probe re-opens the breaker.
      this.consecutiveSuccesses = 0;
      this.openedAtMs = Date.now();
      this.setState("OPEN");
      return;
    }

    this.consecutiveFailures += 1;
    if (this.state === "CLOSED" && this.consecutiveFailures >= this.opts.failureThreshold) {
      this.openedAtMs = Date.now();
      this.setState("OPEN");
    }
  }
}
