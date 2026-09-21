import { ActionDefinition } from "@/lib/engine/types";

const investigativeShared: Pick<ActionDefinition, "risk" | "requiresConfirmation" | "isMitigation" | "isPermanentFix"> = {
  risk: "SAFE",
  requiresConfirmation: false,
  isMitigation: false,
  isPermanentFix: false,
};

export const actionDefs: ActionDefinition[] = [
  {
    actionType: "INSPECT_LOGS",
    ...investigativeShared,
    simMinutesCost: 1,
    description: "Search and filter structured logs across all services.",
    expectedEffect: "Read-only. Reveals log lines; does not change system state.",
    validity: "OPTIMAL",
    consequence: { narrative: "Log search results returned." },
  },
  {
    actionType: "INSPECT_METRICS",
    ...investigativeShared,
    simMinutesCost: 1,
    description: "View time-series metrics across services.",
    expectedEffect: "Read-only. Does not change system state.",
    validity: "OPTIMAL",
    consequence: { narrative: "Metric charts returned." },
  },
  {
    actionType: "INSPECT_TRACES",
    ...investigativeShared,
    simMinutesCost: 1,
    description: "Inspect a distributed trace and its spans.",
    expectedEffect: "Read-only. Does not change system state.",
    validity: "OPTIMAL",
    consequence: { narrative: "Trace detail returned." },
  },
  {
    actionType: "INSPECT_DEPLOYMENT",
    ...investigativeShared,
    simMinutesCost: 1,
    description: "Review deployment history for a service.",
    expectedEffect: "Read-only. Does not change system state.",
    validity: "OPTIMAL",
    consequence: { narrative: "Deployment history returned." },
  },
  {
    actionType: "RUN_DIAGNOSTIC",
    targetServiceKey: "placement-db",
    risk: "SAFE",
    requiresConfirmation: false,
    isMitigation: false,
    isPermanentFix: false,
    simMinutesCost: 3,
    description: "Run an EXPLAIN-ANALYZE-style diagnostic against placement-db for the slow query.",
    expectedEffect: "Read-only. Surfaces query-plan detail without changing production state.",
    validity: "OPTIMAL",
    consequence: {
      narrative:
        "Diagnostic confirms a sequential scan on employers during the verification-status filter — 480,210 rows examined per call, no matching index.",
    },
  },
  {
    actionType: "RESTART_SERVICE",
    targetServiceKey: "placement-api",
    risk: "CAUTION",
    requiresConfirmation: false,
    isMitigation: false,
    isPermanentFix: false,
    simMinutesCost: 3,
    description: "Restart the placement-api service.",
    expectedEffect: "Brief connection drop for in-flight requests. Does not address a query-plan issue.",
    validity: "RISKY",
    consequence: {
      narrative:
        "placement-api restarts cleanly. Error rate is unchanged a few minutes later — the bottleneck is the database, not the application process.",
    },
  },
  {
    actionType: "ROLLBACK",
    targetServiceKey: "placement-api",
    risk: "DANGEROUS",
    requiresConfirmation: true,
    isMitigation: true,
    isPermanentFix: false,
    simMinutesCost: 5,
    description: "Roll back placement-api to the previous stable version (v2.13.2).",
    expectedEffect:
      "Removes the new verification-status query path. Active in-flight requests to the current version may be interrupted.",
    validity: "OPTIMAL",
    consequence: {
      advancesStateTo: "MITIGATED",
      setMitigated: true,
      narrative:
        "placement-api rolled back to v2.13.2. The verification-status query path is removed; error rate and latency begin recovering immediately.",
    },
  },
  {
    actionType: "DISABLE_FEATURE",
    targetServiceKey: "placement-api",
    risk: "CAUTION",
    requiresConfirmation: true,
    isMitigation: true,
    isPermanentFix: false,
    simMinutesCost: 4,
    description: "Disable the employer-verification-status filter feature flag on placement-api.",
    expectedEffect:
      "Removes the offending query path without a full rollback. The verification feature becomes unavailable until re-enabled.",
    validity: "OPTIMAL",
    consequence: {
      advancesStateTo: "MITIGATED",
      setMitigated: true,
      narrative:
        "Feature flag disabled. The verification-status query no longer executes; error rate and latency begin recovering without a full rollback.",
    },
  },
  {
    actionType: "SCALE_SERVICE",
    targetServiceKey: "placement-api",
    risk: "CAUTION",
    requiresConfirmation: false,
    isMitigation: false,
    isPermanentFix: false,
    simMinutesCost: 3,
    description: "Add additional placement-api instances.",
    expectedEffect: "Increases application capacity. Does not reduce load on placement-db.",
    validity: "RISKY",
    consequence: {
      narrative:
        "Two additional placement-api instances come online. Error rate is essentially unchanged — more app instances means more concurrent connections competing for the same saturated database, which risks making placement-db worse, not better.",
    },
  },
  {
    actionType: "CHANGE_CONFIGURATION",
    targetServiceKey: "placement-db",
    risk: "CAUTION",
    requiresConfirmation: true,
    isMitigation: false,
    isPermanentFix: false,
    simMinutesCost: 3,
    description: "Increase the placement-db max connection pool size.",
    expectedEffect: "Allows more concurrent connections. Does not address the underlying slow query.",
    validity: "RISKY",
    consequence: {
      narrative:
        "Connection pool size increased. A few more requests get through, but each one is still doing a sequential scan — the database is doing just as much work for slightly higher throughput. Error rate improves only marginally.",
      setMetricShift: [{ metricName: "error_rate_pct", serviceKey: "api-gateway", deltaPct: -8 }],
    },
  },
  {
    actionType: "DEPLOY_FIX",
    targetServiceKey: "placement-api",
    risk: "CAUTION",
    requiresConfirmation: true,
    isMitigation: true,
    isPermanentFix: true,
    simMinutesCost: 10,
    description:
      "Deploy v2.14.1: adds a composite index on employers(verification_status, id) and keeps the verification-status filter.",
    expectedEffect: "Permanently resolves the query performance issue. Safe to deploy at any point.",
    validity: "OPTIMAL",
    consequence: {
      advancesStateTo: "FIXING",
      setMitigated: true,
      setPermanentFixApplied: true,
      narrative:
        "v2.14.1 deployed: employers(verification_status, id) index added. The verification-status filter now uses an index scan instead of a sequential scan; query duration returns to baseline (~8ms).",
    },
  },
  {
    actionType: "RUN_TESTS",
    targetServiceKey: "placement-api",
    risk: "SAFE",
    requiresConfirmation: false,
    isMitigation: false,
    isPermanentFix: false,
    simMinutesCost: 2,
    description: "Run the placement-api regression suite plus a query-performance test against a production-scale fixture.",
    expectedEffect: "Read-only against production. Verifies the fix in isolation.",
    validity: "OPTIMAL",
    consequence: {
      advancesStateTo: "VERIFYING",
      narrative:
        "All regression tests pass. The new performance test confirms the verification-status query now completes in 8ms (was 4200ms+) against a production-scale fixture.",
    },
  },
  {
    actionType: "VERIFY_SERVICE",
    targetServiceKey: "placement-api",
    risk: "SAFE",
    requiresConfirmation: false,
    isMitigation: false,
    isPermanentFix: false,
    simMinutesCost: 2,
    description: "Confirm current production metrics are back within SLO before closing the incident.",
    expectedEffect: "Read-only confirmation. Required before the incident can be marked resolved.",
    validity: "OPTIMAL",
    consequence: {
      advancesStateTo: "RESOLVED",
      setVerified: true,
      narrative: "Current error rate 0.3%, p95 latency 190ms — within normal range. Incident verified recovered.",
    },
  },
];
