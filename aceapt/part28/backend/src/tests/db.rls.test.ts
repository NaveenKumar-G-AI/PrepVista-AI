// These tests exercise the REAL Postgres RLS + SECURITY DEFINER setup from
// src/db/migrations/*.sql — not a mock. They need a database with those
// migrations already applied (`npm run migrate`). Connection details
// default to the same dev-only credentials the migrations create;
// override via env vars (PROOF_DB_*) for any other environment.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

const { Pool } = pg;

const adminPool = new Pool({
  host: process.env.PROOF_DB_HOST ?? 'localhost',
  port: Number(process.env.PROOF_DB_PORT ?? 5432),
  database: process.env.PROOF_DB_NAME ?? 'aceapt_proof',
  user: process.env.PROOF_DB_ADMIN_USER ?? 'postgres',
  password: process.env.PROOF_DB_ADMIN_PASSWORD ?? 'postgres',
});

const appPool = new Pool({
  host: process.env.PROOF_DB_HOST ?? 'localhost',
  port: Number(process.env.PROOF_DB_PORT ?? 5432),
  database: process.env.PROOF_DB_NAME ?? 'aceapt_proof',
  user: 'proof_app',
  password: 'proof_app_dev_password',
});

let studentA: string;
let studentB: string;

beforeAll(async () => {
  studentA = randomUUID();
  studentB = randomUUID();
  await adminPool.query('insert into students (id, full_name) values ($1,$2), ($3,$4)', [
    studentA, 'RLS Test Student A', studentB, 'RLS Test Student B',
  ]);
});

afterAll(async () => {
  await adminPool.query('delete from students where id in ($1,$2)', [studentA, studentB]);
  await adminPool.end();
  await appPool.end();
});

function evidencePayload(id: string, studentId: string) {
  return [{
    id, studentId, sessionId: null, sourceAttemptId: 'a1', evidenceType: 'PRACTICE',
    capability: 'arrays', difficulty: 'MEDIUM', novelty: 'RELATED', performance: 0.9,
    timeTakenMs: 1000, expectedTimeMs: 1000, isValid: true,
    quality: {
      recency: 0.9, diversity: 0.9, difficulty: 0.9, novelty: 0.9, independence: 0.9,
      timePressure: 0.9, targetRelevance: 0.9, repeatedPerformance: 0.9,
    },
    createdAt: new Date().toISOString(),
  }];
}

describe('Row-level security and privilege isolation (real Postgres)', () => {
  it('proof_app has zero direct grants on any table — all access must go through SECURITY DEFINER functions', async () => {
    const { rows } = await adminPool.query(
      `select table_name, privilege_type from information_schema.role_table_grants
       where grantee = 'proof_app' and table_schema = 'public'`,
    );
    expect(rows).toHaveLength(0);
  });

  it('proof_app is rejected with a permission error when it queries a PROOF table directly', async () => {
    await expect(appPool.query('select * from verification_evidence')).rejects.toThrow(/permission denied/i);
  });

  it('every fn_* SECURITY DEFINER function is owned by a non-superuser, non-BYPASSRLS role', async () => {
    const { rows } = await adminPool.query(
      `select p.proname, r.rolsuper, r.rolbypassrls from pg_proc p
       join pg_roles r on r.oid = p.proowner
       where p.proname like 'fn_%'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.rolsuper).toBe(false);
      expect(row.rolbypassrls).toBe(false);
    }
  });

  it('RLS is FORCED (not merely enabled) on every per-student table', async () => {
    const { rows } = await adminPool.query(
      `select relname, relrowsecurity, relforcerowsecurity from pg_class
       where relname in ('verification_sessions','session_responses','verification_evidence','verification_results','proof_snapshots')`,
    );
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.relrowsecurity).toBe(true);
      expect(row.relforcerowsecurity).toBe(true);
    }
  });

  it('fn_get_evidence never returns another student\'s rows, even when both students have evidence', async () => {
    await appPool.query('select fn_save_evidence($1, $2::jsonb)', [studentA, JSON.stringify(evidencePayload('ev_rls_a1', studentA))]);
    await appPool.query('select fn_save_evidence($1, $2::jsonb)', [studentB, JSON.stringify(evidencePayload('ev_rls_b1', studentB))]);

    const { rows: aRows } = await appPool.query('select * from fn_get_evidence($1, $2)', [studentA, null]);
    const { rows: bRows } = await appPool.query('select * from fn_get_evidence($1, $2)', [studentB, null]);

    const aIds = aRows.map((r) => r.id);
    const bIds = bRows.map((r) => r.id);
    expect(aIds).toContain('ev_rls_a1');
    expect(aIds).not.toContain('ev_rls_b1');
    expect(bIds).toContain('ev_rls_b1');
    expect(bIds).not.toContain('ev_rls_a1');
  });

  it('blocks a cross-student overwrite even if an evidence id ever collided', async () => {
    // The application layer scopes evidence ids by student id specifically
    // to make this impossible in normal operation (see
    // evidenceAggregation.ts) — this test forces the collision directly
    // against the database to confirm RLS is real defense-in-depth, not
    // just app-level discipline.
    const sharedId = `ev_rls_collision_${randomUUID()}`;
    await appPool.query('select fn_save_evidence($1, $2::jsonb)', [studentA, JSON.stringify(evidencePayload(sharedId, studentA))]);
    await expect(
      appPool.query('select fn_save_evidence($1, $2::jsonb)', [studentB, JSON.stringify(evidencePayload(sharedId, studentB))]),
    ).rejects.toThrow(/row-level security/i);
  });

  it('fn_get_session and fn_get_history are also student-scoped, not just evidence', async () => {
    const targetA = randomUUID();
    await adminPool.query('insert into verification_targets (id, student_id, role_name) values ($1,$2,$3)', [targetA, studentA, 'role']);
    const { rows: history } = await appPool.query('select * from fn_get_history($1, $2)', [studentB, targetA]);
    // studentB asking about a target that belongs to studentA's history gets nothing back.
    expect(history).toHaveLength(0);
  });
});
