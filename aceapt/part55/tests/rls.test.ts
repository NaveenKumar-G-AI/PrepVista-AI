import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { withTenant, appPool, studentPool, closeAllPools } from '../src/db/pool.js';
import { makeSuperPool, createTenantFixture, createQuestionVersion, type Fixture } from './helpers/fixtures.js';

/**
 * Automated version of the manual psql verification run during development
 * (see README "Bugs found and fixed" — this suite exists so that
 * verification isn't a one-time manual check).
 */
describe('Row Level Security (live Postgres, difficulty_app / difficulty_student_app roles)', () => {
  const superPool = makeSuperPool();
  let fixtureA: Fixture;
  let fixtureB: Fixture;
  let qvA: string;
  let qvB: string;

  beforeAll(async () => {
    fixtureA = await createTenantFixture(superPool);
    fixtureB = await createTenantFixture(superPool);
    qvA = await createQuestionVersion(superPool, fixtureA);
    qvB = await createQuestionVersion(superPool, fixtureB);
    await superPool.query(
      `INSERT INTO difficulty_snapshots
        (tenant_id, question_version_id, facility, estimate, sample_size, confidence, category, status, source, is_active)
       VALUES
        ($1,$2,0.30,0.70,500,'HIGH','HARD','CALIBRATED','EMPIRICAL',true),
        ($3,$4,0.65,0.35,400,'HIGH','MEDIUM','CALIBRATED','EMPIRICAL',true)`,
      [fixtureA.tenantId, qvA, fixtureB.tenantId, qvB]
    );
  });

  afterAll(async () => {
    await superPool.end();
    await closeAllPools();
  });

  it('difficulty_app sees only its own tenant', async () => {
    const rows = await withTenant(appPool, fixtureA.tenantId, async (client) => {
      const { rows } = await client.query(`SELECT question_version_id FROM difficulty_snapshots`);
      return rows;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].question_version_id).toBe(qvA);
  });

  it("difficulty_app cannot read another tenant's row even by explicit id", async () => {
    const count = await withTenant(appPool, fixtureA.tenantId, async (client) => {
      const { rows } = await client.query(`SELECT count(*)::int AS n FROM difficulty_snapshots WHERE question_version_id = $1`, [
        qvB,
      ]);
      return rows[0].n;
    });
    expect(count).toBe(0);
  });

  it('difficulty_app cross-tenant write is rejected by RLS WITH CHECK', async () => {
    await expect(
      withTenant(appPool, fixtureA.tenantId, async (client) => {
        await client.query(
          `INSERT INTO difficulty_snapshots (tenant_id, question_version_id, sample_size, status) VALUES ($1,$2,1,'PROVISIONAL')`,
          [fixtureB.tenantId, qvB]
        );
      })
    ).rejects.toThrow(/row-level security/i);
  });

  it('an unset tenant fails closed (zero rows, not all rows)', async () => {
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`SELECT count(*)::int AS n FROM difficulty_snapshots`);
      expect(rows[0].n).toBe(0);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  });

  it('difficulty_student_app sees only safe columns for its own tenant via the view', async () => {
    const rows = await withTenant(studentPool, fixtureA.tenantId, async (client) => {
      const { rows } = await client.query(`SELECT * FROM student_difficulty_view`);
      return rows;
    });
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(
      ['category', 'is_well_established', 'mode', 'population_id', 'question_version_id', 'tenant_id'].sort()
    );
  });

  it('difficulty_student_app is denied at the column level if it bypasses the view', async () => {
    await expect(
      withTenant(studentPool, fixtureA.tenantId, async (client) => {
        await client.query(`SELECT facility FROM difficulty_snapshots`);
      })
    ).rejects.toThrow(/permission denied/i);
  });

  it("difficulty_student_app cannot see another tenant's row through the view", async () => {
    const rows = await withTenant(studentPool, fixtureA.tenantId, async (client) => {
      const { rows } = await client.query(`SELECT * FROM student_difficulty_view WHERE question_version_id = $1`, [qvB]);
      return rows;
    });
    expect(rows).toHaveLength(0);
  });
});
