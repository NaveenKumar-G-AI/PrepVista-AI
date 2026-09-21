import * as fs from 'fs';
import * as path from 'path';
import { withAdmin, withUserContext, closePools } from '../db';
import { createAssessment } from '../services/assessmentService';
import { startAssessment, getAssessmentWithAutoExpire } from '../services/sessionService';
import { submitCode, requestHint } from '../services/submissionService';
import { heading, sub, assertTrue } from './printUtils';

const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'scripts-output', 'seed-output.json'), 'utf8'));

async function expectDenied(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    console.error(`❌ ASSERTION FAILED: ${label} — expected this to be denied, but it SUCCEEDED`);
    process.exitCode = 1;
  } catch (err) {
    const code = (err as { code?: string }).code || 'unknown';
    console.log(`✅ ${label} — denied as expected (${code})`);
  }
}

async function main() {
  heading('SECTION 86 SECURITY TEST SUITE — Karthik (Student A) vs Vikram (Student B), plus TPO isolation');

  // ---- set up a SECOND institution + TPO, purely to test cross-institution isolation ----
  const outsider = await withAdmin(async (client) => {
    const {
      rows: [inst],
    } = await client.query(`INSERT INTO institutions (name) VALUES ('A Different College Entirely') RETURNING id`);
    const {
      rows: [u],
    } = await client.query(`INSERT INTO app_users (role, institution_id, display_name) VALUES ('tpo',$1,'Outside TPO') RETURNING id`, [
      inst.id,
    ]);
    return { institutionId: inst.id, tpoId: u.id as string };
  });

  const karthikId = SEED.students.karthik; // Student A — has their own completed assessment from test_cohort.ts
  const vikramId = SEED.students.vikram; // Student B — likewise

  const vikramAssessment = await withAdmin((client) =>
    client.query(`SELECT id FROM assessments WHERE student_id=$1 ORDER BY created_at DESC LIMIT 1`, [vikramId])
  );
  const vikramAssessmentId = vikramAssessment.rows[0].id;
  const vikramChallenge = await withAdmin((client) =>
    client.query(`SELECT id FROM assessment_challenges WHERE assessment_id=$1 LIMIT 1`, [vikramAssessmentId])
  );
  const vikramChallengeId = vikramChallenge.rows[0].id;

  sub('1. Student A reads Student B\'s assessment');
  await expectDenied('GET assessment/{vikram-assessment-id} as Karthik', () =>
    withUserContext(karthikId, 'student', (client) => getAssessmentWithAutoExpire(client, vikramAssessmentId))
  );

  sub('2. Student A submits code against Student B\'s assessment_challenge');
  await expectDenied('submit code into Vikram\'s challenge, claiming to be Karthik', () =>
    withUserContext(karthikId, 'student', (client) =>
      submitCode(client, {
        assessmentId: vikramAssessmentId,
        studentId: karthikId,
        assessmentChallengeId: vikramChallengeId,
        language: 'python',
        code: 'print("hacked")',
        idempotencyKey: 'attack-1',
      })
    )
  );

  sub('3. Student A requests a hint on Student B\'s assessment');
  await expectDenied('request hint on Vikram\'s assessment as Karthik', () =>
    withUserContext(karthikId, 'student', (client) => requestHint(client, vikramAssessmentId, karthikId, vikramChallengeId, 1))
  );

  sub('4. Raw RLS check — Karthik queries assessment_submissions directly for Vikram\'s student_id');
  const rawAttempt = await withUserContext(karthikId, 'student', (client) =>
    client.query(`SELECT * FROM assessment_submissions WHERE student_id = $1`, [vikramId])
  );
  assertTrue(rawAttempt.rows.length === 0, `RLS returns 0 rows for a direct query at Vikram's submissions (admin sees ${await countAdmin('assessment_submissions', vikramId)} really exist)`);

  sub('5. TPO (same institution) can see aggregate-eligible rows, but NOT raw submissions');
  const tpoSubmissions = await withUserContext(SEED.tpoId, 'tpo', (client) =>
    client.query(`SELECT * FROM assessment_submissions WHERE student_id = $1`, [vikramId])
  );
  assertTrue(tpoSubmissions.rows.length === 0, 'Same-institution TPO sees 0 rows from assessment_submissions — no policy grants it at all');
  const tpoReadiness = await withUserContext(SEED.tpoId, 'tpo', (client) =>
    client.query(`SELECT readiness_state FROM assessment_readiness_results WHERE student_id = $1`, [vikramId])
  );
  assertTrue(tpoReadiness.rows.length > 0, 'Same-institution TPO CAN see readiness_state (the aggregate-eligible table) — this is intended, not a leak');

  sub('6. TPO from a DIFFERENT institution');
  const outsiderView = await withUserContext(outsider.tpoId, 'tpo', (client) =>
    client.query(`SELECT * FROM students WHERE institution_id = $1`, [SEED.institutionId])
  );
  assertTrue(outsiderView.rows.length === 0, 'Outside-institution TPO sees 0 of this college\'s students, even querying by the real institution_id');

  sub('7. Submission after expiry');
  const expiryProbe = await withUserContext(karthikId, 'student', (client) =>
    createAssessment(client, {
      studentId: karthikId,
      roleId: SEED.roleId,
      blueprintName: 'Software Engineer Coding Readiness',
      assessmentType: 'skill_verification',
      purpose: 'Expiry probe',
      language: 'python',
      durationMinutes: 30,
    })
  );
  await withUserContext(karthikId, 'student', (client) => startAssessment(client, expiryProbe.id));
  // Force real time passage rather than waiting 30 minutes — this is the one
  // admin-pool write in this whole suite, and it exists purely to simulate
  // the clock, not to bypass any check under test.
  await withAdmin((client) => client.query(`UPDATE assessments SET expires_at = now() - interval '1 minute' WHERE id=$1`, [expiryProbe.id]));
  const probeChallenge = await withAdmin((client) =>
    client.query(`SELECT id FROM assessment_challenges WHERE assessment_id=$1 LIMIT 1`, [expiryProbe.id])
  );
  await expectDenied('submit after server-side expiry (even though the client thinks time remains)', () =>
    withUserContext(karthikId, 'student', (client) =>
      submitCode(client, {
        assessmentId: expiryProbe.id,
        studentId: karthikId,
        assessmentChallengeId: probeChallenge.rows[0].id,
        language: 'python',
        code: 'print(1)',
        idempotencyKey: 'late-submit',
      })
    )
  );
  const expiredState = await withUserContext(karthikId, 'student', (client) => getAssessmentWithAutoExpire(client, expiryProbe.id));
  assertTrue(expiredState.status === 'expired', `Assessment auto-transitioned to EXPIRED server-side (status=${expiredState.status})`);

  sub('8. Double-submit / idempotency + submission immutability');
  const idemProbe = await withUserContext(karthikId, 'student', (client) =>
    createAssessment(client, {
      studentId: karthikId,
      roleId: SEED.roleId,
      blueprintName: 'Software Engineer Coding Readiness',
      assessmentType: 'skill_verification',
      purpose: 'Idempotency probe',
      language: 'python',
      durationMinutes: 30,
    })
  );
  await withUserContext(karthikId, 'student', (client) => startAssessment(client, idemProbe.id));
  const idemChallenge = await withAdmin((client) =>
    client.query(`SELECT id FROM assessment_challenges WHERE assessment_id=$1 LIMIT 1`, [idemProbe.id])
  );
  const first = await withUserContext(karthikId, 'student', (client) =>
    submitCode(client, {
      assessmentId: idemProbe.id,
      studentId: karthikId,
      assessmentChallengeId: idemChallenge.rows[0].id,
      language: 'python',
      code: 'print(1)',
      idempotencyKey: 'same-key',
    })
  );
  const replay = await withUserContext(karthikId, 'student', (client) =>
    submitCode(client, {
      assessmentId: idemProbe.id,
      studentId: karthikId,
      assessmentChallengeId: idemChallenge.rows[0].id,
      language: 'python',
      code: 'print(1)',
      idempotencyKey: 'same-key',
    })
  );
  assertTrue(replay.replay === true && replay.submission.id === first.submission.id, 'Retried submission with the SAME idempotency key returns the ORIGINAL row — no re-execution, no duplicate');

  await expectDenied('a SECOND, different submission for a challenge that already has a final one', () =>
    withUserContext(karthikId, 'student', (client) =>
      submitCode(client, {
        assessmentId: idemProbe.id,
        studentId: karthikId,
        assessmentChallengeId: idemChallenge.rows[0].id,
        language: 'python',
        code: 'print(999)',
        idempotencyKey: 'different-key-attempted-resubmit',
      })
    )
  );

  console.log('\nSecurity note (read this — it matters more than any single assertion above):');
  console.log(
    'RLS above genuinely stops one student reading/writing another\'s rows, and stops TPO from ever\n' +
      'seeing raw code. It does NOT, by itself, stop a student from tampering with fields on their OWN\n' +
      'row (e.g. UPDATE assessments SET expires_at = ... WHERE student_id = me) if a client were ever\n' +
      'given direct table write access. This implementation\'s real anti-tampering guarantee (section 56)\n' +
      'comes from a different, complementary source: score/timer/status are never accepted as input by\n' +
      'any service function — they are always computed server-side from real execution or real clocks.\n' +
      'The practical implication for deployment: do not expose these tables for direct client writes via\n' +
      'PostgREST/Supabase\'s auto-API — route all writes through this API layer (or equivalent Edge\n' +
      'Functions), which is the only thing that never accepts those fields from the caller.'
  );
}

async function countAdmin(table: string, studentId: string): Promise<number> {
  const r = await withAdmin((client) => client.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE student_id=$1`, [studentId]));
  return r.rows[0].n;
}

main()
  .catch((err) => {
    console.error('SECURITY TEST FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => closePools());
