import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PgRepository } from '../src/db/pgRepository.js';

const { Client } = pg;

const SERVICE_CONN = process.env.DATABASE_URL_SERVICE ?? 'postgres://app_service:svc_local_dev_pw@localhost:5432/skillsignal';
const AUTH_CONN = process.env.DATABASE_URL_AUTHENTICATED ?? 'postgres://app_authenticated:auth_local_dev_pw@localhost:5432/skillsignal';

async function asStudent(studentId: string, fn: (client: InstanceType<typeof Client>) => Promise<void>) {
  const client = new Client({ connectionString: AUTH_CONN });
  await client.connect();
  try {
    await client.query(`set app.current_student_id = '${studentId}'`);
    await fn(client);
  } finally {
    await client.end();
  }
}

describe('security: row-level isolation (req #47/#82)', () => {
  const repo = new PgRepository({ connectionString: SERVICE_CONN });
  const studentA = randomUUID();
  const studentB = randomUUID();

  afterAll(async () => {
    await repo.close();
  });

  it('seeds one signal each for two different students via the trusted service path', async () => {
    const resultA = await repo.upsertSignal(
      { studentId: studentA, skillId: 'algorithms', signal: 0.8, confidence: 0.7, state: 'PROFICIENT' as any, trend: 'STABLE' as any, freshness: 'RECENT' as any, evidenceCount: 5, diversity: 0.6, transferConfidence: 0, retention: null, lastDemonstratedAt: new Date().toISOString(), firstObservedAt: new Date().toISOString(), contradiction: false, modelVersion: 'v1', policyVersion: 'signal-policy-v1', updatedAt: new Date().toISOString(), version: 1 },
      null
    );
    const resultB = await repo.upsertSignal(
      { studentId: studentB, skillId: 'algorithms', signal: 0.3, confidence: 0.6, state: 'DEVELOPING' as any, trend: 'STABLE' as any, freshness: 'RECENT' as any, evidenceCount: 3, diversity: 0.4, transferConfidence: 0, retention: null, lastDemonstratedAt: new Date().toISOString(), firstObservedAt: new Date().toISOString(), contradiction: false, modelVersion: 'v1', policyVersion: 'signal-policy-v1', updatedAt: new Date().toISOString(), version: 1 },
      null
    );
    expect(resultA.ok).toBe(true);
    expect(resultB.ok).toBe(true);
  });

  it('student A can read only their own signal row via RLS, never B\'s', async () => {
    await asStudent(studentA, async (client) => {
      const own = await client.query('select student_id, skill_id, signal from skill_signals');
      expect(own.rows).toHaveLength(1);
      expect(own.rows[0].student_id).toBe(studentA);

      const crossQuery = await client.query('select count(*)::int as n from skill_signals where student_id = $1', [studentB]);
      expect(crossQuery.rows[0].n).toBe(0);
    });
  });

  it('a session with no identity set sees nothing at all (default deny)', async () => {
    const client = new Client({ connectionString: AUTH_CONN });
    await client.connect();
    try {
      const res = await client.query('select count(*)::int as n from skill_signals');
      expect(res.rows[0].n).toBe(0);
    } finally {
      await client.end();
    }
  });

  it('the authenticated role cannot INSERT evidence directly (req #71/#72 — evidence only arrives via the trusted pipeline)', async () => {
    await asStudent(studentA, async (client) => {
      await expect(
        client.query(
          `insert into skill_evidence (evidence_id, student_id, skill_id, source_type, source_id, raw_value, normalized_value, occurred_at, policy_version)
           values ('forged', $1, 'algorithms', 'CHALLENGE_RESULT', 'x', '{}'::jsonb, 1.0, now(), 'signal-policy-v1')`,
          [studentA]
        )
      ).rejects.toThrow(/permission denied/);
    });
  });

  it('the authenticated role cannot UPDATE a signal directly, even their own', async () => {
    await asStudent(studentA, async (client) => {
      await expect(client.query(`update skill_signals set signal = 0.99 where student_id = $1`, [studentA])).rejects.toThrow(/permission denied/);
    });
  });

  it('the authenticated role cannot call the SECURITY DEFINER mutation functions directly', async () => {
    await asStudent(studentA, async (client) => {
      await expect(
        client.query(
          `select * from sig_upsert_signal($1,'algorithms',0.99,0.99,'MASTERED','STABLE','RECENT',99,1,0,null,now(),now(),false,'hacked','hacked',now(),1)`,
          [studentA]
        )
      ).rejects.toThrow(/permission denied/);
    });
  });

  it('the audit trail is invisible to the authenticated role entirely (no policy = default deny)', async () => {
    await asStudent(studentA, async (client) => {
      await expect(client.query('select * from skill_audit_events')).rejects.toThrow(/permission denied/);
    });
  });

  it('the service role itself has no raw table write access — only the functions can write (req #48/#99)', async () => {
    const client = new Client({ connectionString: SERVICE_CONN });
    await client.connect();
    try {
      await expect(client.query(`update skill_signals set signal = 0.5 where skill_id = 'algorithms'`)).rejects.toThrow(/permission denied/);
    } finally {
      await client.end();
    }
  });
});

describe('security: optimistic concurrency (req #50/#51/#82 stale-version rejection)', () => {
  const repo = new PgRepository({ connectionString: SERVICE_CONN });
  const student = randomUUID();

  afterAll(async () => {
    await repo.close();
  });

  it('a write with a stale expected_version is rejected and does not overwrite the real state', async () => {
    const base = { studentId: student, skillId: 'algorithms', signal: 0.5, confidence: 0.5, state: 'DEVELOPING' as any, trend: 'STABLE' as any, freshness: 'RECENT' as any, evidenceCount: 1, diversity: 0.2, transferConfidence: 0, retention: null, lastDemonstratedAt: new Date().toISOString(), firstObservedAt: new Date().toISOString(), contradiction: false, modelVersion: 'v1', policyVersion: 'signal-policy-v1', updatedAt: new Date().toISOString(), version: 1 };
    const created = await repo.upsertSignal(base, null);
    expect(created.ok).toBe(true);
    expect(created.current.version).toBe(1);

    // A legitimate second writer updates it first (version 1 -> 2)
    const legit = await repo.upsertSignal({ ...base, signal: 0.6, version: 2 }, 1);
    expect(legit.ok).toBe(true);
    expect(legit.current.version).toBe(2);

    // An attacker (or a stale in-flight recompute) tries to write against the now-stale version 1
    const attack = await repo.upsertSignal({ ...base, signal: 0.99, state: 'MASTERED' as any, version: 2 }, 1);
    expect(attack.ok).toBe(false);
    expect(attack.current.signal).toBe(0.6); // untouched — attacker's 0.99 never landed
    expect(attack.current.version).toBe(2);
  });
});

describe('security: malformed/adversarial evidence payloads are rejected, not guessed at (req #83/#91)', () => {
  it('oversized/malformed payloads and unknown source types fail schema validation cleanly', async () => {
    const { normalizeEvidence } = await import('../src/engine/normalize.js');
    const now = new Date().toISOString();

    const unknownType = normalizeEvidence({ sourceType: 'NOT_A_REAL_TYPE' as any, sourceId: 'x', studentId: randomUUID(), skillIds: ['algorithms'], payload: {}, occurredAt: now }, now);
    expect(unknownType.evidence).toHaveLength(0);

    const missingFields = normalizeEvidence({ sourceType: 'CORRECTNESS_RESULT' as any, sourceId: 'x', studentId: randomUUID(), skillIds: ['algorithms'], payload: {}, occurredAt: now }, now);
    expect(missingFields.evidence).toHaveLength(0);
    expect(missingFields.rejected).toHaveLength(1);

    const hugePayload = normalizeEvidence(
      { sourceType: 'QUALITY_RESULT' as any, sourceId: 'x', studentId: randomUUID(), skillIds: ['code_quality'], payload: { score0to100: 50, junk: 'x'.repeat(200_000) }, occurredAt: now },
      now
    );
    // extra oversized field is simply not part of the validated schema and is ignored, not crashed on
    expect(hugePayload.evidence).toHaveLength(1);
  });
});
