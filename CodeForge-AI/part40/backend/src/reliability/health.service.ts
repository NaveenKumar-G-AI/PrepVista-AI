import { runAsSystem } from "../db/tenantContext";
import { baseLogger } from "../lib/logger";
import { ALL_DEPENDENCY_CHECKERS, type DependencyCheckResult } from "./dependencies";
import type { ServiceHealthStatus } from "../types/events";

/**
 * HEALTH CHECKS + SERVICE HEALTH + FAILURE CONTAINMENT
 * -----------------------------------------------------------------------
 * Liveness  — "is the process up at all". Deliberately does nothing but
 *             return 200; never touches a dependency (health endpoints
 *             must stay lightweight, per the brief).
 * Readiness — "should this instance receive traffic". Checks only
 *             ESSENTIAL dependencies (currently: the database) — a
 *             non-essential dependency being down should not pull a
 *             healthy instance out of the load balancer.
 * Dependency health — the full picture for the reliability dashboard:
 *             every checked dependency's status/latency/error, plus a
 *             single overall rollup computed by the rule below.
 *
 * Rollup rule (this is the actual containment logic, not just a label):
 *   any essential dependency UNAVAILABLE  -> overall UNAVAILABLE
 *   any non-essential dependency DEGRADED/UNAVAILABLE -> overall DEGRADED
 *   otherwise -> HEALTHY
 * This is what makes "AI Provider Down -> AI Feature Degraded -> Core
 * CodeForge still operational" true in code, not just in a diagram: an
 * AI-gateway outage can only ever push overall status to DEGRADED, never
 * UNAVAILABLE, because aiGatewayChecker.essential === false.
 */

export interface DependencyHealthReport {
  overall: ServiceHealthStatus;
  checkedAt: string;
  dependencies: DependencyCheckResult[];
}

export function computeOverall(results: DependencyCheckResult[]): ServiceHealthStatus {
  if (results.some((r) => r.essential && r.status === "UNAVAILABLE")) return "UNAVAILABLE";
  if (results.some((r) => r.status === "DEGRADED" || (r.status === "UNAVAILABLE" && !r.essential))) return "DEGRADED";
  return "HEALTHY";
}

/**
 * `checkers` defaults to the real, wired dependency list but accepts an
 * override — this is what lets golden.failureRecovery.test.ts exercise a
 * genuine "essential dependency UNAVAILABLE" rollup without having to
 * actually sever the test process's own Postgres connection (which the
 * test harness itself depends on).
 */
export async function checkDependencyHealth(checkers = ALL_DEPENDENCY_CHECKERS): Promise<DependencyHealthReport> {
  const results = await Promise.all(checkers.map((c) => c.check()));
  return { overall: computeOverall(results), checkedAt: new Date().toISOString(), dependencies: results };
}

export async function checkReadiness(checkers = ALL_DEPENDENCY_CHECKERS): Promise<{ ready: boolean; report: DependencyHealthReport }> {
  const report = await checkDependencyHealth(checkers);
  // Only essential-dependency status can fail readiness — see module doc.
  const essentialDown = report.dependencies.some((d) => d.essential && d.status === "UNAVAILABLE");
  return { ready: !essentialDown, report };
}

export function checkLiveness(): { alive: true; uptimeSeconds: number } {
  return { alive: true, uptimeSeconds: Math.floor(process.uptime()) };
}

/**
 * Best-effort persistence for the reliability dashboard's trend view
 * (dependency_health_snapshot — see migrations/006). A failure here must
 * never affect the live health check response that called it.
 */
export async function snapshotAndPersist(report: DependencyHealthReport): Promise<void> {
  try {
    await runAsSystem(async (client) => {
      for (const dep of report.dependencies) {
        await client.query(
          `INSERT INTO dependency_health_snapshot (service_name, status, latency_ms, error_message, checked_at)
           VALUES ($1,$2,$3,$4,$5)`,
          [dep.name, dep.status, dep.latencyMs, dep.error ?? null, report.checkedAt]
        );
      }
    });
  } catch (err) {
    baseLogger.error({ err }, "health_snapshot_persist_failed");
  }
}

export async function getRecentSnapshots(serviceName: string, limit = 50) {
  return runAsSystem(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM dependency_health_snapshot WHERE service_name = $1 ORDER BY checked_at DESC LIMIT $2`,
      [serviceName, limit]
    );
    return rows;
  });
}
