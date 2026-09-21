import * as fs from 'fs';
import * as path from 'path';
import { withAdmin, withUserContext, closePools } from '../db';
import { measureComplexity } from '../execution/executionEngine';
import { assessCodeQuality } from '../services/codeQualityService';
import { createAssessment } from '../services/assessmentService';
import { startAssessment } from '../services/sessionService';
import { submitCode } from '../services/submissionService';
import { finalizeAssessment } from '../services/finalizationService';
import { SOLUTIONS } from './solutions';
import { heading, sub, assertTrue } from './printUtils';

const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'scripts-output', 'seed-output.json'), 'utf8'));

async function main() {
  heading('REAL COMPLEXITY & CODE-QUALITY MEASUREMENT (sections 39-40)');

  sub('1. Direct complexity probe — efficient DP vs. naive exponential recursion, SAME correctness (both pass all 3 tests)');
  const probe = { small_input: '15', large_input: '30', input_size_ratio: 2.0, max_acceptable_runtime_ratio: 4 };
  const efficient = await measureComplexity('python', SOLUTIONS.fibonacci_memo.correct!.code, probe);
  const inefficient = await measureComplexity('python', SOLUTIONS.fibonacci_memo.correct_inefficient!.code, probe);
  console.log('Efficient (iterative DP):  ', efficient);
  console.log('Inefficient (naive recursion):', inefficient);
  assertTrue(efficient.score > inefficient.score, `Efficient solution scores higher (${efficient.score.toFixed(2)}) than the naive one (${inefficient.score.toFixed(2)}) — a REAL timing difference, not asserted`);
  assertTrue(inefficient.runtime_ratio > efficient.runtime_ratio, `Naive recursion's measured runtime growth (${inefficient.runtime_ratio.toFixed(1)}x) genuinely exceeds the DP version's (${efficient.runtime_ratio.toFixed(1)}x)`);

  sub('2. Direct code-quality check — clean vs. deliberately tangled Python, via the real radon tool');
  const clean = await assessCodeQuality('python', SOLUTIONS.fix_off_by_one.correct!.code);
  const messy = `
def f(a,b,c,d,e,z):
    if a:
        if b:
            for i in range(10):
                if c:
                    while d:
                        if a and b:
                            if e:
                                return 1
                            elif z:
                                return 2
                        elif c or d:
                            return 3
    return 0
`;
  const messyResult = await assessCodeQuality('python', messy);
  console.log('Clean submission:  ', clean);
  console.log('Tangled submission:', messyResult);
  assertTrue((clean.score ?? 0) > (messyResult.score ?? 1), `radon scores the clean solution higher (${clean.score?.toFixed(2)}) than the tangled one (${messyResult.score?.toFixed(2)}) — real static analysis, not a guess`);

  sub('3. End-to-end — both scores actually land in assessment_skill_results for a real submitted assessment');
  const assessment = await withUserContext(SEED.students.karthik, 'student', (client) =>
    createAssessment(client, {
      studentId: SEED.students.karthik,
      roleId: SEED.roleId,
      blueprintName: 'Software Engineer Coding Readiness',
      assessmentType: 'skill_verification',
      purpose: 'Complexity/quality probe',
      language: 'python',
      durationMinutes: 30,
    })
  );
  await withUserContext(SEED.students.karthik, 'student', (client) => startAssessment(client, assessment.id));
  const challenges = await withAdmin((client) =>
    client.query(
      `SELECT ac.id, sk.name AS skill_name FROM assessment_challenges ac JOIN skills sk ON sk.id=ac.skill_id WHERE ac.assessment_id=$1`,
      [assessment.id]
    )
  );
  for (const ch of challenges.rows) {
    const key = ch.skill_name === 'algorithms' ? 'fibonacci_memo' : ch.skill_name === 'debugging' ? 'fix_off_by_one' : null;
    const code = key ? SOLUTIONS[key].correct!.code : 'print(1)';
    await withUserContext(SEED.students.karthik, 'student', (client) =>
      submitCode(client, {
        assessmentId: assessment.id,
        studentId: SEED.students.karthik,
        assessmentChallengeId: ch.id,
        language: 'python',
        code,
        idempotencyKey: `quality-probe-${ch.id}`,
      })
    );
  }
  await withUserContext(SEED.students.karthik, 'student', (client) => finalizeAssessment(client, assessment.id));

  const persisted = await withAdmin((client) =>
    client.query(
      `SELECT sk.name, sr.complexity_score, sr.code_quality_score FROM assessment_skill_results sr JOIN skills sk ON sk.id=sr.skill_id WHERE sr.assessment_id=$1 ORDER BY sk.name`,
      [assessment.id]
    )
  );
  console.table(persisted.rows);
  const algoRow = persisted.rows.find((r) => r.name === 'algorithms');
  const debugRow = persisted.rows.find((r) => r.name === 'debugging');
  assertTrue(algoRow?.complexity_score !== null, 'Algorithms row has a real persisted complexity_score (fibonacci has a complexity_probe configured)');
  assertTrue(debugRow?.complexity_score === null, "Debugging row has NO complexity_score (that challenge has no complexity_probe) — not fabricated for challenges that don't define one");
  assertTrue(algoRow?.code_quality_score !== null && debugRow?.code_quality_score !== null, 'Both rows have a real persisted code_quality_score (radon runs on any Python submission)');
}

main()
  .catch((err) => {
    console.error('COMPLEXITY/QUALITY TEST FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => closePools());
