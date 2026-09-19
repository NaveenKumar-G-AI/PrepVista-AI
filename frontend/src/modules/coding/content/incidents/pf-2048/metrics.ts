import { MetricSeries } from "@/modules/coding/engines/incidents/types";
import { generateSeries } from "@/modules/coding/engines/incidents/metricGen";

const FROM = -30;
const TO = 90;
const STEP = 1;

// Shared shape: flat baseline until the v2.14.0 deploy at -21, ramps
// through the timeline's observed milestones (-16 rising, -12 at 5%,
// -2 declared/~18%), holds the plateau, then — ONLY if nothing mitigates
// it — escalates further at +30 per template.escalationRules. Mitigation
// recovery is applied dynamically at query time (see resolveLiveMetrics.ts),
// not baked in here, since it depends on when a given student acts.

function series(key: string, points: { offsetMinutes: number; value: number }[], opts?: { wiggle?: number; clampMin?: number; clampMax?: number; round?: number }) {
  return {
    key,
    points: generateSeries({
      controlPoints: points,
      fromMinutes: FROM,
      toMinutes: TO,
      stepMinutes: STEP,
      wiggleAmplitude: opts?.wiggle ?? 0,
      clampMin: opts?.clampMin,
      clampMax: opts?.clampMax,
      round: opts?.round ?? 2,
    }),
  };
}

const defs = [
  series(
    "api-gateway:error_rate_pct",
    [
      { offsetMinutes: -30, value: 0.2 },
      { offsetMinutes: -21, value: 0.2 },
      { offsetMinutes: -16, value: 1.8 },
      { offsetMinutes: -12, value: 5.1 },
      { offsetMinutes: -7, value: 10.4 },
      { offsetMinutes: -2, value: 17.8 },
      { offsetMinutes: 0, value: 18.1 },
      { offsetMinutes: 30, value: 18.3 },
      { offsetMinutes: 31, value: 29.6 },
      { offsetMinutes: 90, value: 30.1 },
    ],
    { wiggle: 0.3, clampMin: 0, clampMax: 45, round: 2 }
  ),
  series(
    "api-gateway:p95_latency_ms",
    [
      { offsetMinutes: -30, value: 178 },
      { offsetMinutes: -21, value: 180 },
      { offsetMinutes: -16, value: 820 },
      { offsetMinutes: -12, value: 1900 },
      { offsetMinutes: -7, value: 3400 },
      { offsetMinutes: -2, value: 4750 },
      { offsetMinutes: 0, value: 4800 },
      { offsetMinutes: 30, value: 4820 },
      { offsetMinutes: 31, value: 6100 },
      { offsetMinutes: 90, value: 6200 },
    ],
    { wiggle: 25, clampMin: 100, round: 0 }
  ),
  series(
    "api-gateway:p50_latency_ms",
    [
      { offsetMinutes: -30, value: 95 },
      { offsetMinutes: -21, value: 96 },
      { offsetMinutes: -16, value: 340 },
      { offsetMinutes: -12, value: 900 },
      { offsetMinutes: -2, value: 2100 },
      { offsetMinutes: 0, value: 2150 },
      { offsetMinutes: 90, value: 2200 },
    ],
    { wiggle: 15, clampMin: 50, round: 0 }
  ),
  series(
    "api-gateway:p99_latency_ms",
    [
      { offsetMinutes: -30, value: 310 },
      { offsetMinutes: -21, value: 312 },
      { offsetMinutes: -16, value: 1400 },
      { offsetMinutes: -12, value: 3600 },
      { offsetMinutes: -2, value: 6800 },
      { offsetMinutes: 0, value: 6900 },
      { offsetMinutes: 31, value: 8200 },
      { offsetMinutes: 90, value: 8300 },
    ],
    { wiggle: 40, clampMin: 150, round: 0 }
  ),
  series(
    "api-gateway:request_rate_rps",
    [
      { offsetMinutes: -30, value: 42 },
      { offsetMinutes: 0, value: 39 },
      { offsetMinutes: 90, value: 33 },
    ],
    { wiggle: 2, clampMin: 5, round: 1 }
  ),
  series(
    "placement-db:cpu_pct",
    [
      { offsetMinutes: -30, value: 14 },
      { offsetMinutes: -21, value: 15 },
      { offsetMinutes: -16, value: 40 },
      { offsetMinutes: -12, value: 62 },
      { offsetMinutes: -2, value: 87 },
      { offsetMinutes: 0, value: 88 },
      { offsetMinutes: 30, value: 89 },
      { offsetMinutes: 31, value: 96 },
      { offsetMinutes: 90, value: 97 },
    ],
    { wiggle: 1.5, clampMin: 5, clampMax: 100, round: 1 }
  ),
  series(
    "placement-db:db_connections",
    [
      { offsetMinutes: -30, value: 18 },
      { offsetMinutes: -21, value: 20 },
      { offsetMinutes: -12, value: 48 },
      { offsetMinutes: -2, value: 79 },
      { offsetMinutes: 0, value: 81 },
      { offsetMinutes: 30, value: 84 },
      { offsetMinutes: 31, value: 94 },
      { offsetMinutes: 90, value: 96 },
    ],
    { wiggle: 1, clampMin: 5, clampMax: 100, round: 0 }
  ),
  series(
    "placement-db:query_p95_latency_ms",
    [
      { offsetMinutes: -30, value: 11 },
      { offsetMinutes: -21, value: 12 },
      { offsetMinutes: -16, value: 640 },
      { offsetMinutes: -12, value: 1750 },
      { offsetMinutes: -2, value: 4300 },
      { offsetMinutes: 0, value: 4350 },
      { offsetMinutes: 90, value: 4400 },
    ],
    { wiggle: 30, clampMin: 5, round: 0 }
  ),
  series(
    "placement-api:cpu_pct",
    [
      { offsetMinutes: -30, value: 24 },
      { offsetMinutes: -21, value: 25 },
      { offsetMinutes: -12, value: 34 },
      { offsetMinutes: -2, value: 44 },
      { offsetMinutes: 0, value: 45 },
      { offsetMinutes: 90, value: 46 },
    ],
    { wiggle: 2, clampMin: 5, clampMax: 100, round: 1 }
  ),
  series(
    "placement-api:memory_pct",
    [
      { offsetMinutes: -30, value: 38 },
      { offsetMinutes: 0, value: 41 },
      { offsetMinutes: 90, value: 42 },
    ],
    { wiggle: 1, clampMin: 5, clampMax: 100, round: 1 }
  ),
  series(
    "redis-cache:cache_hit_rate_pct",
    [
      { offsetMinutes: -30, value: 92 },
      { offsetMinutes: 0, value: 91.5 },
      { offsetMinutes: 90, value: 92 },
    ],
    { wiggle: 0.8, clampMin: 60, clampMax: 100, round: 1 }
  ),
  series(
    "web-frontend:client_error_rate_pct",
    [
      { offsetMinutes: -30, value: 0.3 },
      { offsetMinutes: -21, value: 0.3 },
      { offsetMinutes: -16, value: 1.9 },
      { offsetMinutes: -12, value: 5.0 },
      { offsetMinutes: -2, value: 17.5 },
      { offsetMinutes: 0, value: 17.9 },
      { offsetMinutes: 30, value: 18.0 },
      { offsetMinutes: 31, value: 29.2 },
      { offsetMinutes: 90, value: 29.8 },
    ],
    { wiggle: 0.3, clampMin: 0, clampMax: 45, round: 2 }
  ),
];

export const metricSeries: MetricSeries = Object.fromEntries(defs.map((d) => [d.key, d.points]));

/** Baseline (pre-incident) value for each metric key — used by the
 * recovery-blend function when a student mitigates. */
export const metricBaselines: Record<string, number> = Object.fromEntries(
  defs.map((d) => [d.key, d.points[0]!.value])
);
