import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { checkDependencyHealth, checkReadiness, computeOverall } from "../src/reliability/health.service";
import { databaseChecker, aiGatewayChecker, sandboxChecker, type DependencyChecker } from "../src/reliability/dependencies";
import { aiProviderAdapter, MockAIProviderAdapter } from "../src/adapters/aiProviderAdapter";
import { sandboxAdapter, MockSandboxAdapter } from "../src/adapters/sandboxAdapter";
import { closePool } from "../src/db/pool";
import { closeAdminClient } from "./dbAdmin";

const mockAI = aiProviderAdapter as MockAIProviderAdapter;
const mockSandbox = sandboxAdapter as MockSandboxAdapter;

beforeEach(() => {
  mockAI.forcedHealthy = true;
  mockSandbox.forcedHealthy = true;
});

afterEach(() => {
  mockAI.forcedHealthy = true;
  mockSandbox.forcedHealthy = true;
});

afterAll(async () => {
  await closeAdminClient();
  await closePool();
});

/** A synthetic essential-dependency checker, used only to exercise the
 * UNAVAILABLE rollup path without severing the test process's own real
 * Postgres connection (see health.service.ts's injectable `checkers` param). */
function fakeEssentialChecker(status: "HEALTHY" | "UNAVAILABLE"): DependencyChecker {
  return {
    name: "fake_essential_dependency",
    essential: true,
    async check() {
      return { name: "fake_essential_dependency", essential: true, latencyMs: 5, status, error: status === "UNAVAILABLE" ? "simulated outage" : undefined };
    }
  };
}

describe("GOLDEN FAILURE TEST — a dependency outage degrades only what depends on it", () => {
  it("baseline: with everything healthy, overall status is HEALTHY and the platform is ready", async () => {
    const report = await checkDependencyHealth([databaseChecker, aiGatewayChecker, sandboxChecker]);
    expect(report.overall).toBe("HEALTHY");
    expect(report.dependencies.map((d) => d.status)).toEqual(["HEALTHY", "HEALTHY", "HEALTHY"]);

    const { ready } = await checkReadiness([databaseChecker, aiGatewayChecker, sandboxChecker]);
    expect(ready).toBe(true);
  });

  it("AI Provider Down -> AI feature degraded -> core platform still operational (readiness unaffected)", async () => {
    mockAI.forcedHealthy = false;

    const report = await checkDependencyHealth([databaseChecker, aiGatewayChecker, sandboxChecker]);
    expect(report.overall).toBe("DEGRADED"); // visible on the dashboard...
    const aiDep = report.dependencies.find((d) => d.name === "ai_gateway")!;
    expect(aiDep.status).toBe("DEGRADED");
    const dbDep = report.dependencies.find((d) => d.name === "database")!;
    expect(dbDep.status).toBe("HEALTHY"); // ...but the unrelated dependency is untouched...

    const { ready } = await checkReadiness([databaseChecker, aiGatewayChecker, sandboxChecker]);
    expect(ready).toBe(true); // ...and the instance still takes traffic. This is FAILURE CONTAINMENT, not just a label.
  });

  it("sandbox (code execution) down behaves the same way — non-essential, degrades, does not fail readiness", async () => {
    mockSandbox.forcedHealthy = false;

    const { ready, report } = await checkReadiness([databaseChecker, aiGatewayChecker, sandboxChecker]);
    expect(report.overall).toBe("DEGRADED");
    expect(ready).toBe(true);
  });

  it("both non-essential dependencies down simultaneously is still only DEGRADED, never UNAVAILABLE", async () => {
    mockAI.forcedHealthy = false;
    mockSandbox.forcedHealthy = false;

    const report = await checkDependencyHealth([databaseChecker, aiGatewayChecker, sandboxChecker]);
    expect(report.overall).toBe("DEGRADED");
  });

  it("an ESSENTIAL dependency (e.g. the database) going UNAVAILABLE takes the platform's overall status to UNAVAILABLE and fails readiness", async () => {
    const report = await checkDependencyHealth([fakeEssentialChecker("UNAVAILABLE"), aiGatewayChecker]);
    expect(report.overall).toBe("UNAVAILABLE");

    const { ready } = await checkReadiness([fakeEssentialChecker("UNAVAILABLE"), aiGatewayChecker]);
    expect(ready).toBe(false);
  });

  it("computeOverall rollup rule, directly: essential-down beats non-essential-degraded beats healthy", () => {
    expect(computeOverall([{ name: "a", essential: true, status: "HEALTHY", latencyMs: 1 }])).toBe("HEALTHY");
    expect(computeOverall([{ name: "a", essential: false, status: "DEGRADED", latencyMs: 1 }])).toBe("DEGRADED");
    expect(
      computeOverall([
        { name: "a", essential: true, status: "UNAVAILABLE", latencyMs: 1 },
        { name: "b", essential: false, status: "HEALTHY", latencyMs: 1 }
      ])
    ).toBe("UNAVAILABLE");
  });
});

describe("GOLDEN RECOVERY TEST — restoring a failed dependency restores normal operation", () => {
  it("AI gateway: DEGRADED -> restore -> HEALTHY, verified by re-running the same check (not assumed)", async () => {
    mockAI.forcedHealthy = false;
    const during = await checkDependencyHealth([databaseChecker, aiGatewayChecker]);
    expect(during.overall).toBe("DEGRADED");

    mockAI.forcedHealthy = true; // dependency recovers
    const after = await checkDependencyHealth([databaseChecker, aiGatewayChecker]);
    expect(after.overall).toBe("HEALTHY");
    expect(after.dependencies.find((d) => d.name === "ai_gateway")?.status).toBe("HEALTHY");
  });

  it("essential dependency: UNAVAILABLE -> restore -> readiness returns to true", async () => {
    const duringReadiness = await checkReadiness([fakeEssentialChecker("UNAVAILABLE")]);
    expect(duringReadiness.ready).toBe(false);

    const afterReadiness = await checkReadiness([fakeEssentialChecker("HEALTHY")]);
    expect(afterReadiness.ready).toBe(true);
  });
});
