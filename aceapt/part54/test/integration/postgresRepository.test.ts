import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { PostgresValidationRunRepository, PostgresValidationAuditRepository } from "../../src/repositories/postgres/PostgresValidationRunRepository.js";
import { baselineSnapshot } from "../fixtures/baseline.js";
import type { ValidationRunResult } from "../../src/contracts/types.js";

const ADMIN_URL = process.env.PG_ADMIN_URL ?? "postgresql://postgres:postgres_dev@localhost:5432/aceapt_qve";
const APP_URL = process.env.PG_APP_URL ?? "postgresql://qve_app:qve_app_dev_password_replace_me@localhost:5432/aceapt_qve";

describe("PostgresValidationRunRepository (live, connects as qve_app)", () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;
  let repo: PostgresValidationRunRepository;
  let auditRepo: PostgresValidationAuditRepository;
  let questionId: string;
  let tenantId: string;
  let versionId: string;

  beforeAll(async () => {
    adminPool = new pg.Pool({ connectionString: ADMIN_URL });
    appPool = new pg.Pool({ connectionString: APP_URL });
    repo = new PostgresValidationRunRepository(appPool);
    auditRepo = new PostgresValidationAuditRepository(appPool);

    const q = await adminPool.query(`INSERT INTO questions (tenant_id, is_global) VALUES (gen_random_uuid(), false) RETURNING id, tenant_id`);
    questionId = q.rows[0].id;
    tenantId = q.rows[0].tenant_id;
    const v = await adminPool.query(
      `INSERT INTO question_versions (question_id, version_number, content_hash, status, snapshot_json) VALUES ($1,1,'hash-repo-test','PUBLISHED','{}'::jsonb) RETURNING id`,
      [questionId]
    );
    versionId = v.rows[0].id;
  });

  afterAll(async () => {
    await adminPool.end();
    await appPool.end();
  });

  function makeRun(overrides: Partial<ValidationRunResult> = {}): ValidationRunResult {
    const snapshot = baselineSnapshot();
    return {
      runId: "unused-server-generates-its-own-id",
      questionId,
      versionId,
      versionNumber: 1,
      mode: "STANDARD",
      profile: "PRACTICE_PROFILE",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      results: [
        {
          validator: "SCHEMA_VALIDATOR",
          category: "SCHEMA",
          status: "PASS",
          severity: "NONE",
          code: "VALID",
          message: "ok",
          evidence: { note: "real round-trip through Postgres" },
          validatorVersion: "1.0.0",
          validatedAt: new Date().toISOString(),
          durationMs: 2
        }
      ],
      overallStatus: "VALID",
      highestSeverity: "NONE",
      blockingCodes: [],
      eligibility: { practice: true, timed: true, assessment: false },
      contentHash: snapshot.contentHash,
      validatorVersionSet: { SCHEMA_VALIDATOR: "1.0.0" },
      ...overrides
    };
  }

  it("round-trips a full run through real Postgres via qve_app + SECURITY DEFINER functions", async () => {
    const run = makeRun();
    await repo.save(run, tenantId, { role: "SYSTEM", id: "test-harness" });

    const latest = await repo.getLatestForVersion({ tenantId, role: "REVIEWER" }, versionId);
    expect(latest).not.toBeNull();
    expect(latest!.overallStatus).toBe("VALID");
    expect(latest!.results[0]!.evidence.note).toBe("real round-trip through Postgres");
  });

  it("enforces tenant isolation through the repository layer itself, not just raw SQL", async () => {
    const run = makeRun();
    await repo.save(run, tenantId, { role: "SYSTEM", id: "test-harness" });
    const otherTenantId = "00000000-0000-0000-0000-000000000099";
    const asOtherTenant = await repo.getLatestForVersion({ tenantId: otherTenantId, role: "REVIEWER" }, versionId);
    expect(asOtherTenant).toBeNull();
  });

  it("getHistoryForQuestion returns runs ordered by version, across multiple saved runs", async () => {
    await repo.save(makeRun({ versionNumber: 1 }), tenantId, { role: "SYSTEM", id: "t" });
    await repo.save(makeRun({ versionNumber: 2, overallStatus: "INVALID" }), tenantId, { role: "SYSTEM", id: "t" });
    const history = await repo.getHistoryForQuestion({ tenantId, role: "ADMIN" }, questionId);
    expect(history.length).toBeGreaterThanOrEqual(2);
    const versionNumbers = history.map((r) => r.versionNumber);
    expect(versionNumbers).toEqual([...versionNumbers].sort((a, b) => a - b));
  });

  it("records a real audit event via the SECURITY DEFINER function", async () => {
    const run = makeRun();
    await repo.save(run, tenantId, { role: "SYSTEM", id: "t" });
    const auditId = await auditRepo.record({ tenantId, questionId, validationRunId: null, actorRole: "REVIEWER", actorId: "r1", action: "MANUAL_REVIEW_NOTE", reason: "spot check" });
    expect(auditId).toBeTruthy();

    const { rows } = await adminPool.query("SELECT action, reason FROM validation_audit_events WHERE id = $1", [auditId]);
    expect(rows[0]).toEqual({ action: "MANUAL_REVIEW_NOTE", reason: "spot check" });
  });
});
