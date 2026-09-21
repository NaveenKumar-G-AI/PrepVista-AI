import { CostBasis, RequestStatus } from '../types';

export interface RequestTelemetry {
  requestId: string;
  organizationId: string;
  userId?: string;
  feature: string;
  task: string;
  status: RequestStatus;
  provider?: string;
  modelId?: string;
  routingReasons?: string[];
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  costBasis?: CostBasis;
  queueTimeMs?: number;
  gatewayTimeMs?: number;
  providerTimeMs?: number;
  totalTimeMs?: number;
  ttftMs?: number;
  retries?: number;
  cacheHit?: boolean;
  errorCategory?: string;
  createdAt: string;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

/**
 * Append-only in-memory telemetry store standing in for the `ai_request`
 * table (see migrations/001_init.sql). Every aggregate below is computed
 * from real recorded events — nothing here is a hardcoded or simulated
 * number, which is why an empty store correctly reports zeros/nulls
 * rather than placeholder figures (the dashboard renders that as
 * "no data yet", not as fake activity).
 */
export class Telemetry {
  private records: RequestTelemetry[] = [];

  record(entry: RequestTelemetry): void {
    this.records.push(entry);
  }

  /** Tenant-scoped by construction, same rationale as AuditLog. */
  forOrganization(organizationId: string, sinceMs = 24 * 60 * 60 * 1000): RequestTelemetry[] {
    const cutoff = Date.now() - sinceMs;
    return this.records.filter((r) => r.organizationId === organizationId && new Date(r.createdAt).getTime() >= cutoff);
  }

  all(sinceMs = 24 * 60 * 60 * 1000): RequestTelemetry[] {
    const cutoff = Date.now() - sinceMs;
    return this.records.filter((r) => new Date(r.createdAt).getTime() >= cutoff);
  }

  overview(records: RequestTelemetry[]) {
    const total = records.length;
    const successful = records.filter((r) => r.status === RequestStatus.SUCCESS || r.status === RequestStatus.CACHED || r.status === RequestStatus.FALLBACK);
    const failed = records.filter((r) => r.status === RequestStatus.FAILED || r.status === RequestStatus.BLOCKED);
    const fallbacks = records.filter((r) => r.status === RequestStatus.FALLBACK);
    const cached = records.filter((r) => r.cacheHit);

    const totalTokens = records.reduce((s, r) => s + (r.totalTokens ?? 0), 0);
    const knownCosts = records.filter((r) => r.costBasis !== CostBasis.UNAVAILABLE && r.costUsd !== undefined);
    const totalCostUsd = knownCosts.reduce((s, r) => s + (r.costUsd ?? 0), 0);
    const hasEstimated = knownCosts.some((r) => r.costBasis === CostBasis.ESTIMATED);

    const latencies = records.map((r) => r.totalTimeMs).filter((v): v is number => typeof v === 'number').sort((a, b) => a - b);

    return {
      totalRequests: total,
      successfulRequests: successful.length,
      failureRate: total === 0 ? null : failed.length / total,
      fallbackRate: total === 0 ? null : fallbacks.length / total,
      cacheHitRate: total === 0 ? null : cached.length / total,
      totalTokens,
      totalCostUsd: total === 0 ? null : totalCostUsd,
      costBasisNote: hasEstimated ? ('MIXED_ACTUAL_AND_ESTIMATED' as const) : ('ACTUAL' as const),
      avgCostUsd: successful.length === 0 ? null : totalCostUsd / successful.length,
      latencyP50: percentile(latencies, 50),
      latencyP95: percentile(latencies, 95),
      latencyP99: percentile(latencies, 99),
    };
  }

  breakdownBy(records: RequestTelemetry[], dimension: 'feature' | 'task' | 'modelId' | 'provider') {
    const groups = new Map<string, RequestTelemetry[]>();
    for (const r of records) {
      const key = (r[dimension] as string | undefined) ?? 'unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    return [...groups.entries()]
      .map(([key, group]) => ({ key, ...this.overview(group) }))
      .sort((a, b) => (b.totalCostUsd ?? 0) - (a.totalCostUsd ?? 0));
  }

  /** Real fixed-width time buckets (e.g. hourly) for trend charts — never a fabricated/interpolated series. Empty buckets are omitted rather than zero-filled, so the dashboard can distinguish "no traffic" from "traffic with zero cost". */
  bucketed(records: RequestTelemetry[], bucketMs: number) {
    const buckets = new Map<number, RequestTelemetry[]>();
    for (const r of records) {
      const bucketStart = Math.floor(new Date(r.createdAt).getTime() / bucketMs) * bucketMs;
      if (!buckets.has(bucketStart)) buckets.set(bucketStart, []);
      buckets.get(bucketStart)!.push(r);
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([bucketStart, group]) => ({ bucketStart: new Date(bucketStart).toISOString(), ...this.overview(group) }));
  }
}

export const telemetry = new Telemetry();
