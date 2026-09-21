import * as fs from 'fs';
import * as path from 'path';
import { withAdmin, withUserContext, closePools } from '../db';
import { createAssessment } from '../services/assessmentService';
import { startAssessment } from '../services/sessionService';
import { submitCode } from '../services/submissionService';
import { finalizeAssessment } from '../services/finalizationService';
import { AlwaysFailingRoadmapService } from '../integrations/roadmapService';
import { aiRouter } from '../integrations/aiProvider';
import { heading, sub, assertTrue } from './printUtils';

const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'scripts-output', 'seed-output.json'), 'utf8'));

async function main() {
  heading('SECTIONS 87 & 88 — FAILURE RECOVERY');

  sub('87. AI provider unavailable — no real GROQ/GEMINI key is configured in this sandbox (.env has placeholders only)');
  const { output, providerUsed } = await aiRouter.generateQualitativeSummary({
    studentName: 'Test Student',
    targetRole: 'Software Engineer',
    readinessState: 'developing',
    readinessConfidence: 'medium',
    skillResults: [{ skill_name: 'arrays', performance_level: 'strong', evidence_level: 'direct_evidence' }],
  });
  assertTrue(providerUsed === 'none', 'AIProviderRouter fell back to NullProvider (no configured key, and no network egress to Groq/Gemini from this sandbox anyway)');
  assertTrue(typeof output.summary === 'string' && output.summary.length > 0, 'A usable narrative was still produced — the pipeline never blocked on AI');
  console.log('Fallback narrative:', output.summary);

  sub('88. Roadmap engine outage — finalize an assessment with a RoadmapService that always throws');
  const student = SEED.students.rahul;
  const created = await withUserContext(student, 'student', (client) =>
    createAssessment(client, {
      studentId: student,
      roleId: SEED.roleId,
      blueprintName: 'Software Engineer Coding Readiness',
      assessmentType: 'skill_verification',
      purpose: 'Roadmap-outage failure-injection probe',
      language: 'python',
      durationMinutes: 30,
    })
  );
  await withUserContext(student, 'student', (client) => startAssessment(client, created.id));
  const challenges = await withAdmin((client) => client.query(`SELECT id FROM assessment_challenges WHERE assessment_id=$1`, [created.id]));
  for (const ch of challenges.rows) {
    await withUserContext(student, 'student', (client) =>
      submitCode(client, {
        assessmentId: created.id,
        studentId: student,
        assessmentChallengeId: ch.id,
        language: 'python',
        code: 'print("deliberately wrong")',
        idempotencyKey: `outage-probe-${ch.id}`,
      })
    );
  }

  const failingRoadmap = new AlwaysFailingRoadmapService();
  const result = await withUserContext(student, 'student', (client) => finalizeAssessment(client, created.id, failingRoadmap));

  assertTrue(result.roadmap.triggered === false && !!result.roadmap.error, 'finalizeAssessment did NOT throw — it caught the roadmap failure and recorded it instead');
  assertTrue(result.assessment.status === 'completed', `Assessment still reached COMPLETED status (${result.assessment.status}) despite the roadmap outage`);
  assertTrue(result.skillResults.length > 0, 'Skill results were still computed and persisted');
  assertTrue(!!result.readiness.result.readiness_state, `Readiness was still computed and persisted (${result.readiness.result.readiness_state})`);

  const persistedReadiness = await withAdmin((client) =>
    client.query(`SELECT readiness_state FROM assessment_readiness_results WHERE assessment_id=$1`, [created.id])
  );
  assertTrue(persistedReadiness.rows.length === 1, 'Readiness result is genuinely persisted in the DB, not just returned in memory');

  const roadmapEvent = await withAdmin((client) =>
    client.query(`SELECT payload FROM assessment_events WHERE assessment_id=$1 AND event_type='ROADMAP_RECALCULATION_TRIGGERED'`, [created.id])
  );
  console.log('Recorded roadmap-failure event:', JSON.stringify(roadmapEvent.rows[0]?.payload));
}

main()
  .catch((err) => {
    console.error('FAILURE-RECOVERY TEST FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => closePools());
