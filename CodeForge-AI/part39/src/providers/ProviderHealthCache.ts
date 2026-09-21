import { ProviderHealth, ProviderHealthStatus } from '../types';
import { ProviderRegistry } from './ProviderRegistry';

/**
 * Provider health checks hit the network (see AnthropicProvider/
 * OpenAIProvider .health()). Calling that inline before every single
 * gateway request would add a full extra round trip to every request's
 * latency. Instead, this cache is refreshed on a timer (see
 * startBackgroundRefresh, invoked once from src/index.ts) and the gateway
 * reads the last-known status synchronously. Real-time failure detection
 * still happens reactively and immediately via the CircuitBreaker, which
 * reacts to the actual call outcome rather than a separate probe — the
 * two are complementary, not redundant: health cache catches "provider is
 * down before we even try", circuit breaker catches "provider started
 * failing mid-traffic".
 */
export class ProviderHealthCache {
  private status = new Map<string, ProviderHealth>();
  private timer?: ReturnType<typeof setInterval>;

  constructor(private registry: ProviderRegistry) {}

  async refresh(): Promise<void> {
    const results = await this.registry.healthAll();
    for (const r of results) this.status.set(r.provider, r);
  }

  getStatus(providerName: string): ProviderHealthStatus {
    // An unchecked provider is presumed HEALTHY rather than UNAVAILABLE —
    // "no evidence of failure" is not the same as "known failing" (see
    // spec: "Do not claim health without evidence" applies in both
    // directions).
    return this.status.get(providerName)?.status ?? ProviderHealthStatus.HEALTHY;
  }

  getAll(): ProviderHealth[] {
    return [...this.status.values()];
  }

  startBackgroundRefresh(intervalMs = 15_000): void {
    if (this.timer) return;
    this.refresh().catch(() => undefined);
    this.timer = setInterval(() => {
      this.refresh().catch(() => undefined);
    }, intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
