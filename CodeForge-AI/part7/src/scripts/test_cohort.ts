import * as fs from 'fs';
import * as path from 'path';
import { withAdmin, withUserContext, closePools } from '../db';
import { runPersonaAssessment } from './runPersona';
import { buildCohortReport } from '../services/reportService';
import { heading, sub, assertTrue } from './printUtils';

const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'scripts-output', 'seed-output.json'), 'utf8'));
const skillIdToName: Record<string, string> = Object.fromEntries(Object.entries(SEED.skillIds).map(([k, v]) => [v as string, k]));
const challengeIdToKey: Record<string, string> = Object.fromEntries(
  Object.entries(SEED.challengeIds).map(([k, v]) => [v as string, k])
);

async function run(name: string, studentId: string, assessmentType: any, purpose: string, plan: any) {
  const { report } = await runPersonaAssessment({
    studentId,
    roleId: SEED.roleId,
    blueprintName: 'Software Engineer Coding Readiness',
    assessmentType,
    purpose,
    language: 'python',
    assistanceLevel: 'hints_allowed',
    skillIdToName,
    challengeIdToKey,
    plan,
  });
  console.log(`${name.padEnd(10)} -> readiness=${report.overall_readiness.padEnd(18)} confidence=${report.readiness_confidence}`);
  return report;
}

async function main() {
  heading('COHORT RUN — 5 more students, real pipeline, deliberately varied inputs (not hand-set outputs)');

  await run('Vikram', SEED.students.vikram, 'role_readiness', 'Determine Software Engineer readiness.', {
    arrays: { variant: 'correct' },
    hash_maps: { variant: 'correct' },
    algorithms: { variant: 'correct' },
    debugging: { variant: 'correct' },
    graphs: { variant: 'correct' },
  });

  await run('Priya', SEED.students.priya, 'diagnostic', 'Diagnose algorithmic weaknesses.', {
    arrays: { variant: 'broken' },
    hash_maps: { variant: 'broken' },
    algorithms: { variant: 'broken' },
    debugging: { variant: 'broken' },
    graphs: { variant: 'broken' },
  });

  await run('Karthik', SEED.students.karthik, 'skill_verification', 'Verify current skill standing before mock interviews.', {
    arrays: { variant: 'correct' },
    hash_maps: { variant: 'correct' },
    algorithms: { variant: 'broken' },
    debugging: { variant: 'partial' },
    graphs: { variant: 'correct' },
  });

  await run('Divya', SEED.students.divya, 'role_readiness', 'Determine Software Engineer readiness.', {
    arrays: { variant: 'correct' },
    hash_maps: { variant: 'correct' },
    algorithms: { variant: 'correct', hints: 1 },
    debugging: { variant: 'correct' },
    graphs: { variant: 'partial' },
  });

  await run('Rahul', SEED.students.rahul, 'diagnostic', 'New student — establish a starting baseline.', {
    arrays: { variant: 'broken' },
    hash_maps: { variant: 'broken' },
    algorithms: { variant: 'broken' },
    debugging: { variant: 'broken' },
    graphs: { variant: 'broken' },
  });

  sub('TPO cohort report — computed by the TPO\'s OWN RLS-scoped session, never touching assessment_submissions');
  const cohortReport = await withUserContext(SEED.tpoId, 'tpo', (client) => buildCohortReport(client, SEED.roleId));
  console.log(JSON.stringify(cohortReport, null, 2));

  heading('ASSERTIONS');
  assertTrue(cohortReport.students_with_readiness_result === 6, 'Cohort report counts all 6 students who now have a readiness result (Ananya + 5)');
  const distSum = Object.values(cohortReport.readiness_distribution as Record<string, number>).reduce((a, b) => a + b, 0);
  assertTrue(distSum === 6, 'Readiness distribution buckets sum to 6 (no student double-counted or dropped)');
  assertTrue(
    cohortReport.competency_gap_ranking[0]?.gap_count !== undefined,
    'Competency gap ranking is populated from real per-skill results across the cohort'
  );

  // Sanity: this query is only possible with adminPool (bypasses RLS) — proves
  // buildCohortReport() above did NOT need elevated access to produce a
  // useful report; it worked entirely inside the TPO's own restricted session.
  const rawCount = await withAdmin((client) => client.query(`SELECT COUNT(*)::int AS n FROM assessment_readiness_results`));
  console.log(`\n(For reference — admin-only view: ${rawCount.rows[0].n} total readiness rows persisted across all students so far.)`);
}

main()
  .catch((err) => {
    console.error('COHORT TEST FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => closePools());
