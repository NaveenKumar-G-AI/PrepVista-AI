import { pingDatabase } from "../db/pool";
import { aiProviderAdapter } from "../adapters/aiProviderAdapter";
import { sandboxAdapter } from "../adapters/sandboxAdapter";
import { withTimeout, TimeoutError } from "../lib/retry";
import type { ServiceHealthStatus } from "../types/events";

/**
 * DEPENDENCY HEALTH
 * -----------------------------------------------------------------------
 * For each dependency: availability, latency, error rate (tracked by the
 * caller across checks — see health.service.ts), last successful check,
 * current status. Never invents a status: every checker here actually
 * calls the dependency (or its adapter). If a dependency has no adapter
 * wired yet in the host repo, it should not appear here pretending to be
 * healthy — better to omit it than fabricate a green light.
 *
 * `essential: true` marks a dependency whose UNAVAILABLE state degrades
 * the platform's overall status to UNAVAILABLE, not just DEGRADED — see
 * FAILURE CONTAINMENT: "AI Provider Down -> AI Feature Degraded -> Core
 * CodeForge still operational" is exactly why the AI/sandbox dependencies
 * below are marked non-essential and the database is marked essential.
 */

export interface DependencyCheckResult {
  name: string;
  status: ServiceHealthStatus;
  latencyMs: number;
  essential: boolean;
  error?: string;
}

export interface DependencyChecker {
  name: string;
  essential: boolean;
  check(): Promise<DependencyCheckResult>;
}

const CHECK_TIMEOUT_MS = 3000;

function degradedOrUnavailable(essential: boolean): ServiceHealthStatus {
  return essential ? "UNAVAILABLE" : "DEGRADED";
}

export const databaseChecker: DependencyChecker = {
  name: "database",
  essential: true,
  async check() {
    try {
      const result = await withTimeout(() => pingDatabase(CHECK_TIMEOUT_MS), CHECK_TIMEOUT_MS + 500);
      return {
        name: this.name,
        essential: this.essential,
        latencyMs: result.latencyMs,
        status: result.ok ? "HEALTHY" : degradedOrUnavailable(this.essential),
        error: result.ok ? undefined : result.error
      };
    } catch (err) {
      return { name: this.name, essential: this.essential, latencyMs: CHECK_TIMEOUT_MS, status: "UNAVAILABLE", error: message(err) };
    }
  }
};

export const aiGatewayChecker: DependencyChecker = {
  name: "ai_gateway",
  essential: false, // Feature 39's domain going down must not take the platform down (FAILURE CONTAINMENT example in the brief)
  async check() {
    const start = Date.now();
    try {
      const health = await withTimeout(() => aiProviderAdapter.checkHealth(), CHECK_TIMEOUT_MS);
      return {
        name: this.name,
        essential: this.essential,
        latencyMs: health.latencyMs,
        status: health.healthy ? "HEALTHY" : degradedOrUnavailable(this.essential),
        error: health.healthy ? undefined : health.detail
      };
    } catch (err) {
      return { name: this.name, essential: this.essential, latencyMs: Date.now() - start, status: "DEGRADED", error: message(err) };
    }
  }
};

export const sandboxChecker: DependencyChecker = {
  name: "code_execution_sandbox",
  essential: false, // reporting/browsing must still work if the execution backend is having a bad day
  async check() {
    const start = Date.now();
    try {
      const health = await withTimeout(() => sandboxAdapter.checkHealth(), CHECK_TIMEOUT_MS);
      return {
        name: this.name,
        essential: this.essential,
        latencyMs: health.latencyMs,
        status: health.healthy ? "HEALTHY" : degradedOrUnavailable(this.essential),
        error: health.healthy ? undefined : health.detail
      };
    } catch (err) {
      return { name: this.name, essential: this.essential, latencyMs: Date.now() - start, status: "DEGRADED", error: message(err) };
    }
  }
};

function message(err: unknown): string {
  if (err instanceof TimeoutError) return err.message;
  return err instanceof Error ? err.message : String(err);
}

export const ALL_DEPENDENCY_CHECKERS: DependencyChecker[] = [databaseChecker, aiGatewayChecker, sandboxChecker];
