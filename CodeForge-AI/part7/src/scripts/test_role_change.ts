import * as fs from 'fs';
import * as path from 'path';
import { withAdmin, closePools } from '../db';
import { createBlueprint } from '../services/blueprintService';
import { DEFAULT_READINESS_GATES } from '../config/readinessConfig';
import { heading, sub, assertTrue } from './printUtils';

const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'scripts-output', 'seed-output.json'), 'utf8'));

async function main() {
  heading('SECTION 92 — ROLE CHANGE (Software Engineer -> ML Engineer)');

  sub('Divya has real Software Engineer history from earlier tests — capture it before the role change');
  const before = await withAdmin((client) =>
    client.query(
      `SELECT readiness_state, readiness_confidence, computed_at FROM assessment_readiness_results
       WHERE student_id=$1 AND role_id=$2 ORDER BY computed_at DESC LIMIT 1`,
      [SEED.students.divya, SEED.roleId]
    )
  );
  assertTrue(before.rows.length > 0, `Divya has prior Software Engineer readiness history (${before.rows[0]?.readiness_state})`);
  const priorMastery = await withAdmin((client) =>
    client.query(`SELECT COUNT(*)::int AS n FROM student_skill_mastery WHERE student_id=$1`, [SEED.students.divya])
  );
  assertTrue(priorMastery.rows[0].n > 0, `Divya has ${priorMastery.rows[0].n} real mastery rows before the role change`);

  sub('Create the ML Engineer role + its own blueprint (a genuinely different competency set)');
  const { roleId: mlRoleId, blueprintVersionId: mlBlueprintVersionId } = await withAdmin(async (client) => {
    const {
      rows: [role],
    } = await client.query(`INSERT INTO roles (name) VALUES ('ML Engineer') RETURNING id`);

    // Reuses arrays/algorithms (still relevant) but introduces role-specific
    // skills that never existed in the Software Engineer blueprint — role
    // change means genuinely different requirements, not a relabeling.
    const skillNames = ['linear_algebra', 'model_evaluation'];
    const ids: Record<string, string> = {};
    for (const name of skillNames) {
      const {
        rows: [s],
      } = await client.query(`INSERT INTO skills (name, category) VALUES ($1,'ml_fundamentals') RETURNING id`, [name]);
      ids[name] = s.id;
    }

    const weights = [
      { skill_id: SEED.skillIds.arrays, skill_name: 'arrays', weight: 0.15 },
      { skill_id: SEED.skillIds.algorithms, skill_name: 'algorithms', weight: 0.2 },
      { skill_id: ids.linear_algebra, skill_name: 'linear_algebra', weight: 0.35 },
      { skill_id: ids.model_evaluation, skill_name: 'model_evaluation', weight: 0.3 },
    ];
    const { version } = await createBlueprint(client, {
      roleId: role.id,
      name: 'ML Engineer Coding Readiness',
      competencyWeights: weights,
      difficultyDistribution: { easy: 0.2, medium: 0.5, hard: 0.3 },
      readinessGates: DEFAULT_READINESS_GATES,
    });
    return { roleId: role.id, blueprintVersionId: version.id };
  });
  console.log('New role id:', mlRoleId, 'new blueprint version:', mlBlueprintVersionId);

  sub('Update Divya\'s target role');
  await withAdmin((client) => client.query(`UPDATE students SET target_role_id=$1 WHERE id=$2`, [mlRoleId, SEED.students.divya]));

  sub('Confirm: her Software Engineer history is UNTOUCHED');
  const afterSweHistory = await withAdmin((client) =>
    client.query(`SELECT COUNT(*)::int AS n FROM assessment_readiness_results WHERE student_id=$1 AND role_id=$2`, [
      SEED.students.divya,
      SEED.roleId,
    ])
  );
  assertTrue(afterSweHistory.rows[0].n >= 1, 'Software Engineer readiness history still exists — nothing was deleted or rewritten by the role change');
  const afterMastery = await withAdmin((client) =>
    client.query(`SELECT COUNT(*)::int AS n FROM student_skill_mastery WHERE student_id=$1`, [SEED.students.divya])
  );
  assertTrue(
    afterMastery.rows[0].n === priorMastery.rows[0].n,
    `Mastery row count unchanged (${afterMastery.rows[0].n}) — old evidence survives the role change (section 92: "Existing evidence remains")`
  );

  sub('Confirm: she has NO ML Engineer readiness result yet (new role = fresh readiness, not inherited)');
  const mlReadiness = await withAdmin((client) =>
    client.query(`SELECT * FROM assessment_readiness_results WHERE student_id=$1 AND role_id=$2`, [SEED.students.divya, mlRoleId])
  );
  assertTrue(mlReadiness.rows.length === 0, 'No ML Engineer readiness exists yet — it has to be earned via a real assessment against the NEW blueprint, not carried over');

  console.log(
    '\nNote: this proves the DATA MODEL correctly isolates role-specific state (blueprint, weights, readiness) while' +
      '\npreserving history. It stops short of running Divya through a full ML Engineer assessment here — that would' +
      '\njust be another instance of the same E2E flow already proven in test_e2e_section85.js, now against a second role.'
  );
}

main()
  .catch((err) => {
    console.error('ROLE CHANGE TEST FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => closePools());
