/**
 * CODE EXECUTION INTEGRATION — Feature 40 <-> Feature 8 boundary
 * -----------------------------------------------------------------------
 * Feature 8 owns execution isolation (the actual sandbox). Feature 40
 * adds security-event emission, audit, monitoring, and incident
 * correlation AROUND execution — it does not replace or reimplement the
 * sandbox itself. This narrow interface is only what reliability
 * monitoring needs: "is the execution backend currently reachable."
 *
 * Wire this to Feature 8's real health/status signal in the host repo.
 * The mock below exists only for tests/local dev.
 */

export interface SandboxHealth {
  healthy: boolean;
  latencyMs: number;
  queueDepth?: number;
  detail?: string;
}

export interface SandboxAdapter {
  checkHealth(): Promise<SandboxHealth>;
}

export class MockSandboxAdapter implements SandboxAdapter {
  public forcedHealthy = true;
  public forcedLatencyMs = 60;

  async checkHealth(): Promise<SandboxHealth> {
    await new Promise((r) => setTimeout(r, 1));
    if (!this.forcedHealthy) {
      return { healthy: false, latencyMs: this.forcedLatencyMs, detail: "mock: forced unhealthy for test" };
    }
    return { healthy: true, latencyMs: this.forcedLatencyMs, queueDepth: 0 };
  }
}

export const sandboxAdapter: SandboxAdapter = new MockSandboxAdapter();
