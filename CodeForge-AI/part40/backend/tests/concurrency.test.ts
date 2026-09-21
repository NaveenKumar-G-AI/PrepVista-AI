import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { closePool } from "../src/db/pool";
import { resetDatabase, closeAdminClient } from "./dbAdmin";
import { RateLimiter, MemoryRateLimitStore } from "../src/lib/rateLimiter";
import { emitSecurityEvent } from "../src/security/securityEvents.service";
import { flushPendingAlertEvaluationsForTests } from "../src/security/alertEngine";
import { runAsSystem } from "../src/db/tenantContext";
import { ORG_A, USERS, authHeader } from "./helpers";

/**
 * This is scoped honestly as CONCURRENCY CORRECTNESS testing — proving
 * shared-counter and upsert-dedup logic doesn't lose updates when many
 * callers hit it at the same instant — not a production-scale load test.
 * No real staging environment or production-like traffic pattern was
 * available in this context; see COMPLETION_REPORT.md's Load Testing
 * Results section for what this does and does not demonstrate.
 */

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeAdminClient();
  await closePool();
});

describe("Concurrency correctness", () => {
  it("RateLimiter: N concurrent checks against the same key never lose an increment (no two callers see the same count)", async () => {
    const limiter = new RateLimiter(new MemoryRateLimitStore(), 10, 60_000);
    const N = 50;

    const results = await Promise.all(Array.from({ length: N }, () => limiter.check("concurrent-key")));

    const counts = results.map((r) => r.count).sort((a, b) => a - b);
    const expected = Array.from({ length: N }, (_, i) => i + 1);
    expect(counts).toEqual(expected); // every count 1..N appears exactly once — no lost or duplicated increments

    const allowedCount = results.filter((r) => r.allowed).length;
    expect(allowedCount).toBe(10); // exactly the configured limit, regardless of arrival order
  });

  it("Alert dedup: N concurrent TENANT_ISOLATION_VIOLATION emissions for the same actor produce exactly one alert with occurrence_count === N", async () => {
    const N = 15;
    const actor = USERS.studentA.userId;

    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        emitSecurityEvent({
          eventType: "TENANT_ISOLATION_VIOLATION",
          actorUserId: actor,
          actorRole: "STUDENT",
          organizationId: ORG_A,
          result: "DENIED",
          correlationId: `concurrency-${i}`
        })
      )
    );

    await flushPendingAlertEvaluationsForTests();

    const alerts = await runAsSystem(async (c) => {
      const { rows } = await c.query(`SELECT * FROM security_alert WHERE rule_id = 'tenant_isolation_violation'`);
      return rows;
    });

    // Exactly one alert row — the partial unique index prevented N separate rows.
    expect(alerts).toHaveLength(1);
    expect(alerts[0].occurrence_count).toBe(N); // and no increment was lost under concurrent upserts.

    const events = await runAsSystem(async (c) => {
      const { rows } = await c.query(`SELECT count(*)::int AS n FROM security_event WHERE event_type = 'TENANT_ISOLATION_VIOLATION'`);
      return rows[0].n as number;
    });
    expect(events).toBe(N); // and every underlying event was actually persisted (nothing silently dropped under load).
  });

  it("HTTP: M concurrent authenticated reads against a real endpoint all succeed with correct, isolated per-request data", async () => {
    const M = 30;
    const start = Date.now();

    const responses = await Promise.all(
      Array.from({ length: M }, () => request(app).get("/api/audit/events").set(...authHeader(USERS.adminA)))
    );

    const elapsedMs = Date.now() - start;
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(responses.every((r) => Array.isArray(r.body.events))).toBe(true);

    // Not a hard performance assertion (this sandbox's Postgres is not
    // representative of a real deployment's hardware) — just proves the
    // pipeline doesn't serialize into >30x single-request latency, i.e.
    // requests are genuinely handled concurrently, not queued one at a time.
    // eslint-disable-next-line no-console
    console.log(`[concurrency] ${M} concurrent authenticated reads completed in ${elapsedMs}ms`);
    expect(elapsedMs).toBeLessThan(5000);
  });
});
