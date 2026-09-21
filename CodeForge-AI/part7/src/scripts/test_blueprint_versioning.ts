import * as fs from 'fs';
import * as path from 'path';
import { withAdmin, withUserContext, closePools } from '../db';
import { createNewBlueprintVersion } from '../services/blueprintService';
import { createAssessment } from '../services/assessmentService';
import { heading, sub, assertTrue } from './printUtils';

const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'scripts-output', 'seed-output.json'), 'utf8'));

async function main() {
  heading('SECTIONS 7 & 93 — BLUEPRINT VERSION IMMUTABILITY');

  sub('v1 should already be locked (Ananya\'s assessment referenced it)');
  const v1 = await withAdmin((client) => client.query(`SELECT * FROM role_blueprint_versions WHERE id=$1`, [SEED.blueprintVersionId]));
  assertTrue(v1.rows[0].is_locked === true, 'v1.is_locked = true');

  sub('Attempting to directly edit v1\'s weights (even as admin — the trigger applies regardless of role)');
  try {
    await withAdmin((client) =>
      client.query(`UPDATE role_blueprint_versions SET competency_weights = '[]'::jsonb WHERE id=$1`, [SEED.blueprintVersionId])
    );
    console.error('❌ ASSERTION FAILED: editing a locked blueprint version should have been rejected by the DB trigger');
    process.exitCode = 1;
  } catch (err) {
    console.log('✅ DB trigger rejected the edit:', (err as Error).message.split('\n')[0]);
  }

  sub('Creating v2 with rebalanced weights (graphs given more weight after cohort results showed it as the most common gap)');
  const v2 = await withAdmin((client) =>
    createNewBlueprintVersion(client, SEED.blueprintId, {
      competencyWeights: [
        { skill_id: SEED.skillIds.arrays, skill_name: 'arrays', weight: 0.1 },
        { skill_id: SEED.skillIds.hash_maps, skill_name: 'hash_maps', weight: 0.1 },
        { skill_id: SEED.skillIds.algorithms, skill_name: 'algorithms', weight: 0.2 },
        { skill_id: SEED.skillIds.debugging, skill_name: 'debugging', weight: 0.25 },
        { skill_id: SEED.skillIds.graphs, skill_name: 'graphs', weight: 0.35 },
      ],
      difficultyDistribution: { easy: 0.2, medium: 0.5, hard: 0.3 },
    })
  );
  console.log('Created v2 id:', v2.id, 'version_number:', v2.version_number);
  assertTrue(v2.version_number === 2, 'New version is numbered 2, not a replacement for v1');
  assertTrue(v2.is_locked === false, 'v2 starts UNLOCKED — it has not been used by any assessment yet');

  sub('Creating a brand-new assessment for Divya — should now pick up v2 automatically (it is the new active_version_id)');
  const newAssessment = await withUserContext(SEED.students.divya, 'student', (client) =>
    createAssessment(client, {
      studentId: SEED.students.divya,
      roleId: SEED.roleId,
      blueprintName: 'Software Engineer Coding Readiness',
      assessmentType: 'skill_verification',
      purpose: 'Versioning probe',
      language: 'python',
      durationMinutes: 30,
    })
  );
  assertTrue(
    (newAssessment.config_snapshot as { blueprint_version_number: number }).blueprint_version_number === 2,
    `New assessment's frozen config_snapshot references v2 (got v${(newAssessment.config_snapshot as any).blueprint_version_number})`
  );

  sub('Confirming v2 is now locked too, and Ananya\'s ORIGINAL (v1) assessment is untouched');
  const v2After = await withAdmin((client) => client.query(`SELECT is_locked FROM role_blueprint_versions WHERE id=$1`, [v2.id]));
  assertTrue(v2After.rows[0].is_locked === true, 'v2 is now locked (this assessment just used it)');

  const ananyaOriginal = await withAdmin((client) =>
    client.query(
      `SELECT config_snapshot FROM assessments WHERE student_id=$1 AND blueprint_version_id=$2 ORDER BY created_at ASC LIMIT 1`,
      [SEED.students.ananya, SEED.blueprintVersionId]
    )
  );
  assertTrue(
    (ananyaOriginal.rows[0].config_snapshot as { blueprint_version_number: number }).blueprint_version_number === 1,
    'Ananya\'s original assessment STILL shows blueprint_version_number=1 — creating v2 never retroactively changed it (section 7)'
  );
}

main()
  .catch((err) => {
    console.error('BLUEPRINT VERSIONING TEST FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => closePools());
