import { PoolClient } from 'pg';
import { withUserContext } from '../db';
import { createAssessment } from '../services/assessmentService';
import { startAssessment } from '../services/sessionService';
import { submitCode, requestHint } from '../services/submissionService';
import { finalizeAssessment } from '../services/finalizationService';
import { buildStudentReport } from '../services/reportService';
import { SOLUTIONS } from './solutions';
import { AssessmentType, AssistanceLevel, SupportedLanguage } from '../types';

export interface PersonaPlanEntry {
  variant: 'correct' | 'broken' | 'partial' | 'correct_inefficient';
  hints?: number;
}

export interface RunPersonaInput {
  studentId: string;
  roleId: string;
  blueprintName: string;
  assessmentType: AssessmentType;
  purpose: string;
  language: SupportedLanguage;
  assistanceLevel?: AssistanceLevel;
  plan: Record<string, PersonaPlanEntry>; // keyed by skill NAME
  skillIdToName: Record<string, string>;
  challengeIdToKey: Record<string, string>;
}

export interface SubmissionLogEntry {
  skill: string;
  challenge_key: string;
  is_unseen: boolean;
  is_transfer_probe: boolean;
  variant: string;
  hints_used: number;
  tests_passed: number;
  tests_total: number;
  status: string;
}

/** Runs one student through the REAL, full pipeline end to end: create -> start -> submit each challenge -> finalize -> report. */
export async function runPersonaAssessment(input: RunPersonaInput) {
  const created = await withUserContext(input.studentId, 'student', (client) =>
    createAssessment(client, {
      studentId: input.studentId,
      roleId: input.roleId,
      blueprintName: input.blueprintName,
      assessmentType: input.assessmentType,
      purpose: input.purpose,
      language: input.language,
      assistanceLevel: input.assistanceLevel,
    })
  );

  await withUserContext(input.studentId, 'student', (client) => startAssessment(client, created.id));

  const challenges = await withUserContext(input.studentId, 'student', async (client: PoolClient) => {
    const { rows } = await client.query(
      `SELECT id, challenge_id, skill_id, is_unseen, is_transfer_probe FROM assessment_challenges WHERE assessment_id=$1 ORDER BY sequence_order`,
      [created.id]
    );
    return rows;
  });

  const submissionLog: SubmissionLogEntry[] = [];

  for (const ch of challenges) {
    const skillName = input.skillIdToName[ch.skill_id];
    const challengeKey = input.challengeIdToKey[ch.challenge_id];
    const planEntry = input.plan[skillName] || { variant: 'correct' as const, hints: 0 };
    const solutionSet = SOLUTIONS[challengeKey];
    const chosen = solutionSet?.[planEntry.variant] ?? solutionSet?.correct;
    if (!chosen) throw new Error(`No solution available for ${challengeKey}/${planEntry.variant}`);

    for (let h = 0; h < (planEntry.hints ?? 0); h++) {
      await withUserContext(input.studentId, 'student', (client) =>
        requestHint(client, created.id, input.studentId, ch.id, h + 1)
      );
    }

    const outcome = await withUserContext(input.studentId, 'student', (client) =>
      submitCode(client, {
        assessmentId: created.id,
        studentId: input.studentId,
        assessmentChallengeId: ch.id,
        language: chosen.language,
        code: chosen.code,
        idempotencyKey: `run-${ch.id}`,
      })
    );

    submissionLog.push({
      skill: skillName,
      challenge_key: challengeKey,
      is_unseen: ch.is_unseen,
      is_transfer_probe: ch.is_transfer_probe,
      variant: planEntry.variant,
      hints_used: planEntry.hints ?? 0,
      tests_passed: outcome.submission.tests_passed,
      tests_total: outcome.submission.tests_total,
      status: outcome.submission.status,
    });

    if (outcome.assessmentNowSubmitted) {
      await withUserContext(input.studentId, 'student', (client) => finalizeAssessment(client, created.id));
    }
  }

  const report = await withUserContext(input.studentId, 'student', (client) => buildStudentReport(client, created.id));

  return { assessmentId: created.id, submissionLog, report };
}
