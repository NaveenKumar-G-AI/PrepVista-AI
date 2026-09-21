import pg from 'pg';
import { makeSuperPool } from '../../src/db/pool.js';

export { makeSuperPool };

export interface Fixture {
  tenantId: string;
  skillId: string;
  studentIds: string[];
  testStudentId: string;
}

export async function createTenantFixture(pool: pg.Pool): Promise<Fixture> {
  const { rows: tenantRows } = await pool.query<{ id: string }>(
    `INSERT INTO tenants (name) VALUES ('Test Tenant ' || gen_random_uuid()::text) RETURNING id`
  );
  const tenantId = tenantRows[0]!.id;
  const { rows: skillRows } = await pool.query<{ id: string }>(
    `INSERT INTO skills (tenant_id, name) VALUES ($1, 'Test Skill') RETURNING id`,
    [tenantId]
  );
  const skillId = skillRows[0]!.id;
  const studentIds: string[] = [];
  for (let i = 0; i < 20; i++) {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO students (tenant_id, is_test_account) VALUES ($1, false) RETURNING id`,
      [tenantId]
    );
    studentIds.push(rows[0]!.id);
  }
  const { rows: testStudentRows } = await pool.query<{ id: string }>(
    `INSERT INTO students (tenant_id, is_test_account) VALUES ($1, true) RETURNING id`,
    [tenantId]
  );
  return { tenantId, skillId, studentIds, testStudentId: testStudentRows[0]!.id };
}

export async function createQuestionVersion(
  pool: pg.Pool,
  fixture: Fixture,
  opts: Partial<{
    isValid: boolean;
    qualityStatus: string;
    initialLabel: string | null;
    contentHash: string;
  }> = {}
): Promise<string> {
  const { rows: qRows } = await pool.query<{ id: string }>(
    `INSERT INTO questions (tenant_id, skill_id, purpose, answer_type) VALUES ($1,$2,'PRACTICE','NUMERIC') RETURNING id`,
    [fixture.tenantId, fixture.skillId]
  );
  const questionId = qRows[0]!.id;
  const { rows: qvRows } = await pool.query<{ id: string }>(
    `INSERT INTO question_versions
      (question_id, tenant_id, version_number, content_hash, initial_difficulty_label, is_valid, quality_status,
       number_of_steps, number_of_variables, number_of_constraints, concept_dependencies, reading_length)
     VALUES ($1,$2,1,$3,$4,$5,$6,2,2,1,1,100) RETURNING id`,
    [
      questionId,
      fixture.tenantId,
      opts.contentHash ?? `hash-${questionId}`,
      opts.initialLabel ?? 'Medium',
      opts.isValid ?? true,
      opts.qualityStatus ?? 'OK',
    ]
  );
  return qvRows[0]!.id;
}

export async function insertAttempt(
  pool: pg.Pool,
  fixture: Fixture,
  questionVersionId: string,
  overrides: Partial<{
    studentId: string;
    isCorrect: boolean;
    responseTimeMs: number | null;
    mode: 'UNTIMED' | 'TIMED';
    hintsUsed: number;
    exposureNumber: number;
    isNovel: boolean;
    completed: boolean;
    abilityProxy: number;
    createdAt: Date;
  }> = {}
): Promise<void> {
  const studentId = overrides.studentId ?? fixture.studentIds[Math.floor(Math.random() * fixture.studentIds.length)]!;
  await pool.query(
    `INSERT INTO attempts
      (tenant_id, student_id, question_version_id, is_correct, response_time_ms, mode, hints_used,
       exposure_number, is_novel, respondent_ability_proxy, completed, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      fixture.tenantId,
      studentId,
      questionVersionId,
      overrides.isCorrect ?? true,
      overrides.responseTimeMs === undefined ? 45000 : overrides.responseTimeMs,
      overrides.mode ?? 'UNTIMED',
      overrides.hintsUsed ?? 0,
      overrides.exposureNumber ?? 1,
      overrides.isNovel ?? true,
      overrides.abilityProxy ?? Math.random(),
      overrides.completed ?? true,
      overrides.createdAt ?? new Date(),
    ]
  );
}
