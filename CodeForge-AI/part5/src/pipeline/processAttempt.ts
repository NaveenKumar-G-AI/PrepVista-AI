import { randomUUID } from 'node:crypto';
import type { DB } from '../db/client.js';
import { evaluateSubmission } from '../evaluation/evaluator.js';
import { diagnose } from '../diagnosis/diagnose.js';
import { EvidenceService } from '../evidence/evidenceService.js';
import { MasteryStateService } from '../mastery/masteryStateService.js';
import { ChallengeRepository } from '../recommendation/candidateRetrieval.js';
import type { AssistanceLevel, Attempt, Diagnosis, EvaluationResult, Language, StudentSkillState } from '../types.js';

interface AttemptRow {
  id: string; student_id: string; challenge_id: string; language: string; code: string;
  client_attempt_id: string | null; assistance_used: string; recommendation_id: string | null; submitted_at: string;
}
function toAttempt(r: AttemptRow): Attempt {
  return {
    id: r.id, studentId: r.student_id, challengeId: r.challenge_id, language: r.language as Language, code: r.code,
    clientAttemptId: r.client_attempt_id, assistanceUsed: r.assistance_used as AssistanceLevel,
    recommendationId: r.recommendation_id, submittedAt: r.submitted_at,
  };
}

export interface ProcessAttemptInput {
  studentId: string;
  challengeId: string;
  language: Language;
  code: string;
  clientAttemptId?: string;
  assistanceUsed?: AssistanceLevel;
  recommendationId?: string;
}

export interface ProcessAttemptResult {
  attempt: Attempt;
  evaluation: EvaluationResult;
  diagnosis: Diagnosis;
  updatedStates: StudentSkillState[];
  idempotentReplay: boolean;
}

/**
 * The closed-loop entrypoint (Phase 60):
 *   Submission -> Execution -> Evaluation -> Diagnosis -> Evidence -> Skill State Update
 *
 * Runs synchronously within the call for this reference implementation (see
 * CODEFORGE_FINAL_REPORT.md re: Phase 54 background-processing scope). Every
 * step here operates on REAL data: real sandboxed execution, real comparison
 * against expected values, real deterministic diagnosis, real persisted
 * evidence, real recomputation of mastery/confidence/trend from that
 * evidence — nothing in this path is fabricated or hardcoded per attempt.
 *
 * Idempotency (Phase 52): if `clientAttemptId` matches an attempt already
 * recorded for this student, the existing result is returned rather than
 * reprocessing (protects against double-submit / retry / refresh).
 */
export async function processAttempt(db: DB, input: ProcessAttemptInput): Promise<ProcessAttemptResult> {
  const challengeRepo = new ChallengeRepository(db);
  const evidenceService = new EvidenceService(db);
  const masteryState = new MasteryStateService(db);

  if (input.clientAttemptId) {
    const existing = db
      .prepare('SELECT * FROM attempts WHERE student_id = ? AND client_attempt_id = ?')
      .get(input.studentId, input.clientAttemptId) as unknown as AttemptRow | undefined;
    if (existing) {
      const evalRow = db.prepare('SELECT * FROM evaluation_results WHERE attempt_id = ?').get(existing.id) as unknown as
        { attempt_id: string; tests_total: number; tests_passed: number; passed: number; runtime_error: number; syntax_error: number; timeout: number; raw_result_json: string } | undefined;
      const diagRow = db.prepare('SELECT * FROM diagnoses WHERE attempt_id = ?').get(existing.id) as unknown as
        { attempt_id: string; mistake_category: string; language_issue: number; failure_pattern: string | null; details: string } | undefined;
      const attempt = toAttempt(existing);
      const evaluation: EvaluationResult = evalRow
        ? { attemptId: evalRow.attempt_id, testsTotal: evalRow.tests_total, testsPassed: evalRow.tests_passed, passed: Boolean(evalRow.passed), runtimeError: Boolean(evalRow.runtime_error), syntaxError: Boolean(evalRow.syntax_error), timeout: Boolean(evalRow.timeout), results: JSON.parse(evalRow.raw_result_json) }
        : { attemptId: existing.id, testsTotal: 0, testsPassed: 0, passed: false, runtimeError: false, syntaxError: false, timeout: false, results: [] };
      const diagnosis: Diagnosis = diagRow
        ? { attemptId: diagRow.attempt_id, mistakeCategory: diagRow.mistake_category as Diagnosis['mistakeCategory'], languageIssue: Boolean(diagRow.language_issue), failurePattern: diagRow.failure_pattern, details: diagRow.details }
        : { attemptId: existing.id, mistakeCategory: 'NONE', languageIssue: false, failurePattern: null, details: '' };
      const challenge = challengeRepo.getById(existing.challenge_id)!;
      const touchedSkillIds = [challenge.primarySkillId, ...challenge.secondarySkillIds];
      const updatedStates = touchedSkillIds.map((sid) => masteryState.getState(input.studentId, sid)).filter((s): s is StudentSkillState => s !== null);
      return { attempt, evaluation, diagnosis, updatedStates, idempotentReplay: true };
    }
  }

  const challenge = challengeRepo.getById(input.challengeId);
  if (!challenge) throw new Error(`Unknown or inactive challenge: ${input.challengeId}`);
  if (challenge.status !== 'ACTIVE') throw new Error(`Challenge ${input.challengeId} is not ACTIVE (status=${challenge.status})`);
  if (!challenge.languagesSupported.includes(input.language)) {
    throw new Error(`Challenge ${input.challengeId} does not support language ${input.language}`);
  }

  const attemptId = randomUUID();
  db.prepare(`
    INSERT INTO attempts (id, student_id, challenge_id, language, code, client_attempt_id, assistance_used, recommendation_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(attemptId, input.studentId, input.challengeId, input.language, input.code, input.clientAttemptId ?? null, input.assistanceUsed ?? 'NONE', input.recommendationId ?? null);
  const attemptRow = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attemptId) as unknown as AttemptRow;
  const attempt = toAttempt(attemptRow);

  // Server-side test cases (including hidden) — never sent to the client as-is.
  const testCases = challengeRepo.getTestCases(input.challengeId, input.language);
  const evaluation = await evaluateSubmission({ attemptId, challenge, language: input.language, code: input.code, testCases });

  db.prepare(`
    INSERT INTO evaluation_results (id, attempt_id, tests_total, tests_passed, passed, runtime_error, syntax_error, timeout, raw_result_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), attemptId, evaluation.testsTotal, evaluation.testsPassed, evaluation.passed ? 1 : 0, evaluation.runtimeError ? 1 : 0, evaluation.syntaxError ? 1 : 0, evaluation.timeout ? 1 : 0, JSON.stringify(evaluation.results));

  const diagnosis = diagnose(evaluation);
  db.prepare(`
    INSERT INTO diagnoses (id, attempt_id, mistake_category, language_issue, failure_pattern, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), attemptId, diagnosis.mistakeCategory, diagnosis.languageIssue ? 1 : 0, diagnosis.failurePattern, diagnosis.details);

  evidenceService.recordEvidence({ attempt, challenge, evaluation, diagnosis });

  const touchedSkillIds = [challenge.primarySkillId, ...challenge.secondarySkillIds];
  const updatedStates = touchedSkillIds.map((skillId) => masteryState.recompute(input.studentId, skillId));

  if (input.recommendationId) {
    db.prepare("UPDATE recommendations SET status = 'COMPLETED', completed_at = ? WHERE id = ? AND student_id = ?")
      .run(new Date().toISOString(), input.recommendationId, input.studentId);
  }

  return { attempt, evaluation, diagnosis, updatedStates, idempotentReplay: false };
}
