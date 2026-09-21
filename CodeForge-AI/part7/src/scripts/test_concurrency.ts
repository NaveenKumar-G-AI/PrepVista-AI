import * as fs from 'fs';
import * as path from 'path';
import { withAdmin, withUserContext, closePools } from '../db';
import { createAssessment } from '../services/assessmentService';
import { startAssessment } from '../services/sessionService';
import { submitCode } from '../services/submissionService';
import { heading, sub, assertTrue } from './printUtils';

const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'scripts-output', 'seed-output.json'), 'utf8'));

async function main() {
  heading('REAL CONCURRENCY — genuinely simultaneous requests, not sequential retries');

  const student = SEED.students.rahul;
  const assessment = await withUserContext(student, 'student', (client) =>
    createAssessment(client, {
      studentId: student,
      roleId: SEED.roleId,
      blueprintName: 'Software Engineer Coding Readiness',
      assessmentType: 'skill_verification',
      purpose: 'Concurrency probe',
      language: 'python',
      durationMinutes: 30,
    })
  );
  await withUserContext(student, 'student', (client) => startAssessment(client, assessment.id));
  const ch = await withAdmin((client) => client.query(`SELECT id FROM assessment_challenges WHERE assessment_id=$1 LIMIT 1`, [assessment.id]));
  const challengeId = ch.rows[0].id;

  sub('Same idempotency key, fired as 10 genuinely concurrent requests (Promise.all, not a loop)');
  const sameKeyPromises = Array.from({ length: 10 }, () =>
    withUserContext(student, 'student', (client) =>
      submitCode(client, {
        assessmentId: assessment.id,
        studentId: student,
        assessmentChallengeId: challengeId,
        language: 'python',
        code: 'print(1)',
        idempotencyKey: 'concurrent-same-key',
      }).catch((err) => ({ error: err.message }))
    )
  );
  const results = await Promise.all(sameKeyPromises);
  const succeeded = results.filter((r: any) => !r.error);
  const uniqueSubmissionIds = new Set(succeeded.map((r: any) => r.submission.id));
  const replayCount = succeeded.filter((r: any) => r.replay).length;

  console.log(`${succeeded.length}/10 requests succeeded, ${uniqueSubmissionIds.size} unique submission id(s), ${replayCount} marked as replay`);
  assertTrue(succeeded.length === 10, 'All 10 concurrent requests received a successful response (no 500s for the race losers)');
  assertTrue(uniqueSubmissionIds.size === 1, 'All 10 concurrent requests with the SAME idempotency key resolved to exactly ONE submission row — no duplicate execution under real concurrency');
  assertTrue(replayCount === 9, `Exactly 9 of the 10 were served as a graceful replay of the 1 winner (got ${replayCount})`);

  const dbCount = await withAdmin((client) =>
    client.query(`SELECT COUNT(*)::int AS n FROM assessment_submissions WHERE assessment_challenge_id=$1`, [challengeId])
  );
  assertTrue(dbCount.rows[0].n === 1, `Exactly one row actually persisted in assessment_submissions (found ${dbCount.rows[0].n}) — the unique constraint on (assessment_challenge_id, idempotency_key) held under a real race`);

  console.log(
    '\nHow this holds under a real race: the UNIQUE constraint on (assessment_challenge_id, idempotency_key) in' +
      '\ndb/migrations/002_assessment_engine.sql is the actual arbiter when two requests race past the application-level' +
      '\n"does a row already exist" check at the same instant — Postgres accepts one INSERT and rejects the other with a' +
      '\nreal 23505 constraint violation. submissionService.ts catches exactly that error and re-fetches the winning row' +
      '\nas a graceful replay, so a losing request gets the same successful response as a normal idempotent retry, not a 500.'
  );
}

main()
  .catch((err) => {
    console.error('CONCURRENCY TEST FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => closePools());
