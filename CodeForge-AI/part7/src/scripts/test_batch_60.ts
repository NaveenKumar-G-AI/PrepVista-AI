import * as fs from 'fs';
import * as path from 'path';
import { withAdmin, withUserContext, closePools } from '../db';
import { createBatchAssignment, provisionBatchAssessments } from '../services/batchService';
import { startAssessment } from '../services/sessionService';
import { submitCode } from '../services/submissionService';
import { finalizeAssessment } from '../services/finalizationService';
import { buildCohortReport } from '../services/reportService';
import { SOLUTIONS } from './solutions';
import { heading, sub, assertTrue } from './printUtils';

const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'scripts-output', 'seed-output.json'), 'utf8'));
const N = 60;

const FIRST = ['Aarav', 'Vihaan', 'Aditi', 'Diya', 'Kabir', 'Meera', 'Rohan', 'Sanya', 'Ishaan', 'Anika', 'Arjun', 'Riya', 'Dev', 'Naina', 'Yash'];
const LAST = ['Sharma', 'Verma', 'Iyer', 'Reddy', 'Gupta', 'Nair', 'Das', 'Bhatt', 'Joshi', 'Chauhan'];

function randomName(i: number) {
  return `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
}

/** Weighted random variant, skewed by an overall "strength" draw per student so a real distribution emerges rather than uniform noise. */
function pickVariant(strength: number): 'correct' | 'broken' | 'partial' {
  const r = Math.random();
  if (strength > 0.7) return r < 0.85 ? 'correct' : 'partial';
  if (strength > 0.4) return r < 0.5 ? 'correct' : r < 0.85 ? 'partial' : 'broken';
  return r < 0.15 ? 'correct' : r < 0.45 ? 'partial' : 'broken';
}

async function main() {
  const t0 = Date.now();
  heading(`SECTION 94 BATCH SCENARIO — ${N} students, real pipeline end to end`);

  sub(`Creating ${N} students with random pre-existing mastery (representing prior practice history)`);
  const skillNames = Object.keys(SEED.skillIds);
  const studentIds: string[] = await withAdmin(async (client) => {
    const ids: string[] = [];
    for (let i = 0; i < N; i++) {
      const {
        rows: [u],
      } = await client.query(`INSERT INTO app_users (role, institution_id, display_name) VALUES ('student',$1,$2) RETURNING id`, [
        SEED.institutionId,
        randomName(i),
      ]);
      await client.query(`INSERT INTO students (id, institution_id, target_role_id, goal, experience_level) VALUES ($1,$2,$3,$4,$5)`, [
        u.id,
        SEED.institutionId,
        SEED.roleId,
        'Placement Preparation',
        'intermediate',
      ]);
      const strength = Math.random();
      for (const skill of skillNames) {
        if (Math.random() < 0.6) {
          const level = strength > 0.66 ? 'competent' : strength > 0.33 ? 'developing' : 'weak';
          await client.query(
            `INSERT INTO student_skill_mastery (student_id, skill_id, mastery_level, evidence_quality) VALUES ($1,$2,$3,'direct')`,
            [u.id, SEED.skillIds[skill], level]
          );
        }
      }
      ids.push(u.id);
    }
    return ids;
  });
  console.log(`Created ${studentIds.length} students.`);

  sub('TPO creates the batch assignment and provisions all 60 real assessments');
  const batch = await withUserContext(SEED.tpoId, 'tpo', (client) =>
    createBatchAssignment(client, {
      institutionId: SEED.institutionId,
      roleId: SEED.roleId,
      blueprintName: 'Software Engineer Coding Readiness',
      assessmentType: 'placement_assessment',
      purpose: 'Placement Coding Readiness Assessment — full batch',
      createdBy: SEED.tpoId,
      studentIds,
    })
  );
  const provisioned = await provisionBatchAssessments(batch.id, 'python');
  const provisionFailures = provisioned.filter((p) => p.error);
  console.log(`Provisioned ${provisioned.length - provisionFailures.length}/${provisioned.length} assessments (${provisionFailures.length} failed).`);
  assertTrue(provisionFailures.length === 0, 'Every student in the batch got a real assessment provisioned under their own session');

  sub('Each student independently starts, submits (randomized real code), and finalizes');
  const challengeIdToKey: Record<string, string> = Object.fromEntries(
    Object.entries(SEED.challengeIds as Record<string, string>).map(([k, v]) => [v, k])
  );

  let completedCount = 0;
  for (const p of provisioned) {
    if (!p.assessmentId) continue;
    const strength = Math.random();
    try {
      await withUserContext(p.studentId, 'student', (client) => startAssessment(client, p.assessmentId!));
      const challengeRows = await withAdmin((client) =>
        client.query(`SELECT id, skill_id, challenge_id FROM assessment_challenges WHERE assessment_id=$1`, [p.assessmentId])
      );
      for (const ch of challengeRows.rows) {
        const key = challengeIdToKey[ch.challenge_id];
        const variant = pickVariant(strength);
        const solutionSet = SOLUTIONS[key];
        const sol = solutionSet?.[variant] ?? solutionSet?.correct;
        if (!sol) continue;
        const outcome = await withUserContext(p.studentId, 'student', (client) =>
          submitCode(client, {
            assessmentId: p.assessmentId!,
            studentId: p.studentId,
            assessmentChallengeId: ch.id,
            language: sol.language,
            code: sol.code,
            idempotencyKey: `batch60-${ch.id}`,
          })
        );
        if (outcome.assessmentNowSubmitted) {
          await withUserContext(p.studentId, 'student', (client) => finalizeAssessment(client, p.assessmentId!));
          completedCount++;
        }
      }
    } catch (err) {
      console.error(`  student ${p.studentId} failed mid-run:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`${completedCount}/${N} assessments completed end to end.`);

  sub('TPO management report (section 80) — real aggregate, computed under RLS');
  const cohort = await withUserContext(SEED.tpoId, 'tpo', (client) => buildCohortReport(client, SEED.roleId));
  const completionPct = ((cohort.completion.completed / cohort.completion.total_assessments) * 100).toFixed(1);
  console.log(`\nPLACEMENT CODING READINESS`);
  console.log(`Students in this run: ${N}`);
  console.log(`Completed: ${cohort.completion.completed} (${completionPct}%)`);
  console.log(`Readiness distribution:`, cohort.readiness_distribution);
  console.log(`Top competency gaps:`);
  for (const g of cohort.competency_gap_ranking.slice(0, 5)) {
    console.log(`  ${g.skill_name}: ${g.gap_count}/${g.total} results in weak/developing`);
  }

  heading('ASSERTIONS');
  assertTrue(completedCount >= N * 0.9, `At least 90% of the batch completed end to end (${completedCount}/${N})`);
  const distTotal = Object.values(cohort.readiness_distribution as Record<string, number>).reduce((a, b) => a + b, 0);
  assertTrue(distTotal >= N, `Readiness distribution accounts for at least the ${N} new students (plus earlier cohort members still in the DB) — got ${distTotal}`);

  console.log(`\nWall-clock time for all ${N} students, real subprocess execution throughout: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main()
  .catch((err) => {
    console.error('BATCH-60 TEST FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => closePools());
