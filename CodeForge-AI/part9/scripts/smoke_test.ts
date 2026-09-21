/**
 * Seeds a tiny slice of the skill graph (mirroring the spec's own PHASE 91
 * worked example: a Software Engineer role, with Dynamic Programming
 * blocked by a weak State Modeling prerequisite) and drives it through
 * MasteryService + RecommendationService against a real database.
 *
 * This is a wiring smoke test, not a unit test — it exists to prove the
 * repositories' SQL and the services' orchestration actually work together,
 * which `tsc --noEmit` and the pure-domain unit tests cannot catch on
 * their own (wrong column name, wrong join, etc.)
 *
 * Run with: DATABASE_URL=postgres://app_admin:PASSWORD@localhost/codeforge_mastery npx tsx scripts/smoke_test.ts
 */
import { randomUUID } from 'node:crypto';
import { getPool } from '../src/repositories/db.js';
import { MasteryService } from '../src/services/MasteryService.js';
import { RecommendationService } from '../src/services/RecommendationService.js';
import { PracticeService } from '../src/services/PracticeService.js';

async function main() {
  const pool = getPool();
  const studentId = randomUUID();

  console.log('--- seeding student, role, skills, prerequisite, and role requirements ---');
  await pool.query(`insert into students (id, email) values ($1, $2)`, [studentId, `${studentId}@smoke.test`]);

  const roleId = (await pool.query(`insert into roles (key, name) values ('software_engineer', 'Software Engineer') returning id`)).rows[0].id;

  const recursionId = (await pool.query(`insert into skill_nodes (key, name, category) values ('recursion', 'Recursion', 'PROGRAMMING') returning id`)).rows[0].id;
  const stateModelingId = (await pool.query(`insert into skill_nodes (key, name, category) values ('state_modeling', 'DP State Modeling', 'ALGORITHMS') returning id`)).rows[0].id;
  const dpId = (await pool.query(`insert into skill_nodes (key, name, category) values ('dynamic_programming', 'Dynamic Programming', 'ALGORITHMS') returning id`)).rows[0].id;
  const arraysId = (await pool.query(`insert into skill_nodes (key, name, category) values ('arrays', 'Arrays', 'DATA_STRUCTURES') returning id`)).rows[0].id;

  await pool.query(`insert into skill_relationships (from_skill_id, to_skill_id, relationship_type) values ($1, $2, 'PREREQUISITE')`, [recursionId, dpId]);
  await pool.query(`insert into skill_relationships (from_skill_id, to_skill_id, relationship_type) values ($1, $2, 'PREREQUISITE')`, [stateModelingId, dpId]);

  await pool.query(`insert into role_skill_requirements (role_id, skill_id, importance, target_state) values ($1,$2,0.9,'STRONG')`, [roleId, dpId]);
  await pool.query(`insert into role_skill_requirements (role_id, skill_id, importance, target_state) values ($1,$2,0.6,'FUNCTIONAL')`, [roleId, arraysId]);

  async function newProblem(difficulty: 'easy' | 'medium' | 'hard'): Promise<string> {
    const { rows } = await pool.query(`insert into problems (title, difficulty) values ($1, $2) returning id`, [`Smoke test problem (${difficulty})`, difficulty]);
    return rows[0].id;
  }

  console.log('--- recording evidence: recursion is strong, state modeling is weak, arrays is mastered ---');
  const practiceService = new PracticeService();

  // Arrays: mastered (independent + transfer + timed assessment).
  for (const [difficulty, source, isTransfer] of [
    ['easy', 'PRACTICE', false],
    ['medium', 'PRACTICE', false],
    ['hard', 'PRACTICE', false],
    ['hard', 'PRACTICE', false],
    ['hard', 'PRACTICE', true],
    ['hard', 'TIMED_ASSESSMENT', false],
  ] as const) {
    await practiceService.completePractice({
      studentId, skillId: arraysId, problemId: await newProblem(difficulty), source, difficulty, independent: true,
      hintsUsed: 0, solutionViewed: false, isTransfer, timed: source === 'TIMED_ASSESSMENT', passed: true,
      idempotencyKey: randomUUID(),
    });
  }

  // Recursion: strong (independent, varied difficulty, one transfer).
  for (const [difficulty, isTransfer] of [['medium', false], ['hard', false], ['hard', true]] as const) {
    await practiceService.completePractice({
      studentId, skillId: recursionId, problemId: await newProblem(difficulty), source: 'PRACTICE', difficulty, independent: true,
      hintsUsed: 0, solutionViewed: false, isTransfer, timed: false, passed: true, idempotencyKey: randomUUID(),
    });
  }

  // State modeling: weak — repeated independent failures, real failureReason signal.
  for (let i = 0; i < 3; i++) {
    await practiceService.completePractice({
      studentId, skillId: stateModelingId, problemId: await newProblem('medium'), source: 'PRACTICE', difficulty: 'medium', independent: true,
      hintsUsed: 0, solutionViewed: false, isTransfer: false, timed: false, passed: false, failureReason: 'WRONG_APPROACH',
      idempotencyKey: randomUUID(),
    });
  }

  console.log('--- current mastery states ---');
  const masteryService = new MasteryService();
  for (const [label, id] of [['Arrays', arraysId], ['Recursion', recursionId], ['DP State Modeling', stateModelingId], ['Dynamic Programming', dpId]] as const) {
    const state = await masteryService.getState(studentId, id);
    console.log(`  ${label}: ${state?.masteryState ?? 'UNKNOWN'} (confidence ${state?.confidence ?? 0})`);
  }

  console.log('--- next best action for role=software_engineer ---');
  const recommendationService = new RecommendationService();
  const recs = await recommendationService.getNextActions(studentId, 'software_engineer');
  for (const r of recs) {
    console.log(`  [${r.isPrimary ? 'PRIMARY' : 'secondary'}] ${r.actionType} on skill ${r.skillId}`);
    for (const reason of r.reasons) console.log(`      - ${reason}`);
    console.log(`      expected outcome: ${r.expectedOutcome}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
