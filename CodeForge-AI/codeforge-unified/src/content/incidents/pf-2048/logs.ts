import { LogLine } from "@/engines/incidents/types";

/**
 * The four log lines that carry real diagnostic weight, plus the trace in
 * traces.ts, make up template.expectedEvidenceKeys (see
 * causesAndPrevention.ts). Their `id` here IS the citable evidence
 * reference — nothing marks them as special to the client; only the fact
 * that these specific ids appear on the hidden expectedEvidenceKeys list
 * is secret, and that list never leaves the server (see types.ts).
 */
const goldenLines: LogLine[] = [
  {
    id: "deploy_v2140_before_symptom_onset",
    offsetSeconds: -21 * 60,
    serviceKey: "placement-api",
    level: "INFO",
    endpoint: undefined,
    message: "Deployment placement-api v2.14.0 completed successfully (previous: v2.13.2)",
    metadata: { version: "v2.14.0", previousVersion: "v2.13.2", commit: "c4d08e7" },
  },
  {
    id: "slow_query_employers_join",
    offsetSeconds: -14 * 60,
    serviceKey: "placement-db",
    level: "WARN",
    durationMs: 4218,
    message: "Slow query detected (4218ms)",
    metadata: {
      query:
        "SELECT a.* FROM placement_applications a JOIN employers e ON a.employer_id = e.id WHERE e.verification_status = 'pending'",
      planHint: "Seq Scan on employers  (cost=0.00..48213.10 rows=480210 width=214)",
      rowsExamined: 480210,
    },
  },
  {
    id: "db_connection_pressure_climbing",
    offsetSeconds: -10 * 60,
    serviceKey: "placement-db",
    level: "WARN",
    message: "Connection pool utilization at 81% (81/100)",
    metadata: { poolUsed: 81, poolMax: 100 },
  },
  {
    id: "gateway_upstream_timeout",
    offsetSeconds: -6 * 60,
    serviceKey: "api-gateway",
    level: "ERROR",
    endpoint: "/api/applications/submit",
    statusCode: 504,
    durationMs: 5000,
    message: "Upstream timeout calling placement-api",
    errorCode: "UPSTREAM_TIMEOUT",
    metadata: {},
  },
  {
    id: "log_db_call_timeout_context",
    offsetSeconds: -5 * 60,
    serviceKey: "placement-api",
    level: "ERROR",
    endpoint: "/api/applications/submit",
    traceId: "trace-incident-01",
    durationMs: 4650,
    message: "Request failed: database call exceeded budget",
    errorCode: "DB_CALL_TIMEOUT",
    metadata: { traceRef: "trace-incident-01" },
  },
];

let seq = 0;
function fillerId(): string {
  seq += 1;
  return `log-f${String(seq).padStart(4, "0")}`;
}

/** Deterministic, non-random filler traffic so log search has real volume
 * to page/filter through instead of just the 5 evidence lines. */
function buildFiller(): LogLine[] {
  const lines: LogLine[] = [];
  const normalOffsets = [-29, -27, -25, -23, -21.5, -20, -19, -18, -17, -15.5];
  for (const m of normalOffsets) {
    lines.push({
      id: fillerId(),
      offsetSeconds: Math.round(m * 60),
      serviceKey: "placement-api",
      level: "INFO",
      endpoint: "/api/applications/submit",
      statusCode: 200,
      durationMs: 165 + Math.round(20 * Math.sin(m)),
      message: "Application submitted successfully",
      metadata: {},
    });
    lines.push({
      id: fillerId(),
      offsetSeconds: Math.round(m * 60) + 3,
      serviceKey: "redis-cache",
      level: "DEBUG",
      message: "Cache hit for employer lookup",
      metadata: { hit: true },
    });
  }

  const degradedOffsets = [-13, -11, -9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5, -4.5, -4, -3.5, -3, -2.5, -2, -1.5, -1, -0.5, -0.2];
  for (const m of degradedOffsets) {
    const failing = m % 1 !== 0.5; // deterministic ~ alternate pattern, no randomness
    lines.push({
      id: fillerId(),
      offsetSeconds: Math.round(m * 60),
      serviceKey: "placement-api",
      level: failing ? "ERROR" : "WARN",
      endpoint: "/api/applications/submit",
      statusCode: failing ? 504 : 200,
      durationMs: failing ? 4400 + Math.round(200 * Math.sin(m * 3)) : 3800,
      message: failing
        ? "Request failed: database call exceeded budget"
        : "Application submitted successfully (elevated latency)",
      errorCode: failing ? "DB_CALL_TIMEOUT" : undefined,
      metadata: {},
    });
  }

  // Cache stays healthy throughout — a deliberate red herring check: a
  // student who inspects redis-cache logs/metrics should be able to rule
  // it out, not find corroborating evidence for it.
  const cacheOffsets = [-20, -15, -10, -5, -2, 0];
  for (const m of cacheOffsets) {
    lines.push({
      id: fillerId(),
      offsetSeconds: Math.round(m * 60),
      serviceKey: "redis-cache",
      level: "DEBUG",
      message: "Cache hit for employer lookup",
      metadata: { hit: true, hitRatePct: 92 },
    });
  }

  return lines;
}

export const logLines: LogLine[] = [...goldenLines, ...buildFiller()].sort(
  (a, b) => a.offsetSeconds - b.offsetSeconds
);
